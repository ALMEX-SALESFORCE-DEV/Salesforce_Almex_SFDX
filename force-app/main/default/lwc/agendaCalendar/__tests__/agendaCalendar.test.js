import { createElement } from 'lwc';
import AgendaCalendar from 'c/agendaCalendar';
import getCurrentUser from '@salesforce/apex/ALMEX_AgendaDataController.getCurrentUser';
import {
    getAgendaActivities, searchActivityClients, getActivityClientBranches, createAgendaActivity,
    improveAgendaText, completeAgendaActivity, cancelAgendaActivity, rescheduleAgendaActivity
} from 'c/agendaServices';

jest.mock('@salesforce/apex/ALMEX_AgendaDataController.getCurrentUser', () => ({
    default: jest.fn()
}), { virtual: true });
jest.mock('@salesforce/customPermission/ALMEX_Agendas_IA', () => ({
    default: true
}), { virtual: true });
jest.mock('c/agendaServices', () => ({
    getAgendaActivities: jest.fn(),
    searchActivityClients: jest.fn(),
    getActivityClientBranches: jest.fn(),
    createAgendaActivity: jest.fn(),
    improveAgendaText: jest.fn(),
    completeAgendaActivity: jest.fn(),
    cancelAgendaActivity: jest.fn(),
    rescheduleAgendaActivity: jest.fn()
}));

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function record(id, status, followUp = false) {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;
    return {
        Id: id,
        Name: `ACT-${id}`,
        Titulo__c: id,
        Ejecutivo__c: 'Ejecutivo Prueba',
        Tipo_de_actividad__c: 'Visita',
        Fecha__c: date,
        Estatus__c: status,
        Seguimiento__c: followUp,
        Notas__c: 'Notas originales',
        Prospecto__c: 'Prospecto de prueba'
    };
}

async function openMyActivities(records) {
    getCurrentUser.mockResolvedValue({ Id: '005test', Name: 'Ejecutivo Prueba' });
    getAgendaActivities.mockResolvedValue(records);
    const element = createElement('c-agenda-calendar', { is: AgendaCalendar });
    document.body.appendChild(element);
    await flush();
    element.shadowRoot.querySelector('[data-section="activities"]').click();
    await flush();
    return element;
}

async function openFollowUp(element) {
    element.shadowRoot.querySelector('.activity-subject-button').click();
    await flush();
    element.shadowRoot.querySelector('.activity-complete-button').click();
    await flush();
}

async function selectClient(element, name = 'Cliente de prueba', id = '001cliente') {
    const search = element.shadowRoot.querySelector('.client-picker input');
    search.value = name;
    search.dispatchEvent(new CustomEvent('input'));
    await new Promise(resolve => setTimeout(resolve, 310));
    await flush();
    element.shadowRoot.querySelector(`[data-client-id="${id}"]`).click();
    await flush();
}

async function selectBranch(element, id = 'sucursal-ajena') {
    const input = element.shadowRoot.querySelector('[data-element="activity-branch-search"]');
    input.dispatchEvent(new FocusEvent('focus'));
    await flush();
    element.shadowRoot.querySelector(`[data-branch-id="${id}"]`).click();
    await flush();
}

function fillNewActivity(element) {
    const title = element.shadowRoot.querySelector('.activity-form [name="title"]');
    title.value = 'Comida comercial';
    title.dispatchEvent(new CustomEvent('change'));
    const type = element.shadowRoot.querySelector('[data-element="activity-type"]');
    type.value = 'Visita';
    type.dispatchEvent(new CustomEvent('change'));
}

function clickWithRetargetedPath(target, element) {
    const click = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true });
    const internalPath = click.composedPath.bind(click);
    // Fuera del Shadow DOM, Salesforce puede ocultar los nodos internos del lookup.
    // Dentro del componente se conserva la ruta para sus propios listeners.
    Object.defineProperty(click, 'composedPath', {
        value: () => click.currentTarget === document || click.currentTarget === window
            ? [element, document, window]
            : internalPath()
    });
    target.dispatchEvent(click);
    return click;
}

describe('Mis actividades y resolución de seguimiento', () => {
    let recognition;

    beforeEach(() => {
        searchActivityClients.mockResolvedValue([{ Id: '001cliente', Name: 'Cliente de prueba' }]);
        getActivityClientBranches.mockResolvedValue([{
            Id: 'sucursal-ajena', Name: 'Sucursal de otro ejecutivo',
            Estado__c: 'JA', Ciudad__c: 'Guadalajara'
        }]);
        createAgendaActivity.mockResolvedValue('nueva');
        window.SpeechRecognition = jest.fn().mockImplementation(() => {
            recognition = {
                start: jest.fn(),
                stop: jest.fn(),
                abort: jest.fn()
            };
            return recognition;
        });
        global.FullCalendar = { Calendar: jest.fn().mockImplementation(() => ({
            render: jest.fn(), destroy: jest.fn(), getDate: () => new Date(),
            removeAllEvents: jest.fn(), addEventSource: jest.fn(), updateSize: jest.fn()
        })) };
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        delete window.SpeechRecognition;
        delete global.FullCalendar;
        jest.clearAllMocks();
    });

    it('incluye y cuenta únicamente programadas y conserva la original en Todas como historial', async () => {
        const element = await openMyActivities([
            record('programada', 'Programada'), record('reagendada', 'Reagendada'),
            record('completada', 'Completada'), record('cancelada', 'Cancelada')
        ]);
        const filter = element.shadowRoot.querySelector('[data-filter="Programada"]');
        expect(filter.querySelector('span').textContent).toBe('Programadas');
        expect(filter.querySelector('strong').textContent).toBe('1');
        expect(element.shadowRoot.querySelectorAll('.activities-table tbody tr')).toHaveLength(1);
        expect(element.shadowRoot.querySelector('.activity-subject-button[data-id="reagendada"]')).toBeNull();
        element.shadowRoot.querySelector('[data-filter="Todas"]').click();
        await flush();
        expect(element.shadowRoot.querySelector('.activity-subject-button[data-id="reagendada"]')).not.toBeNull();
    });

    it('completa la nueva actividad programada desde su detalle', async () => {
        const element = await openMyActivities([record('nueva', 'Programada')]);
        element.shadowRoot.querySelector('.activity-subject-button').click();
        await flush();
        element.shadowRoot.querySelector('.activity-complete-button').click();
        await flush();
        expect(completeAgendaActivity).toHaveBeenCalledWith('nueva', null);
    });

    it('cancela la nueva actividad programada con su justificación', async () => {
        const element = await openMyActivities([record('nueva', 'Programada')]);
        element.shadowRoot.querySelector('.activity-subject-button').click();
        await flush();
        element.shadowRoot.querySelector('.activity-cancel-header-button').click();
        await flush();
        const justification = element.shadowRoot.querySelector('[data-element="activity-action-justification"]');
        justification.value = 'El cliente canceló la actividad.';
        justification.dispatchEvent(new Event('input'));
        await flush();
        element.shadowRoot.querySelector('.activity-action-form').dispatchEvent(new Event('submit'));
        await flush();
        expect(cancelAgendaActivity).toHaveBeenCalledWith('nueva', 'El cliente canceló la actividad.');
    });

    it('reagenda nuevamente la actividad programada vigente', async () => {
        const element = await openMyActivities([record('nueva', 'Programada')]);
        element.shadowRoot.querySelector('.activity-subject-button').click();
        await flush();
        element.shadowRoot.querySelector('.activity-reschedule-button').click();
        await flush();
        const newDate = element.shadowRoot.querySelector('[name="newDate"]');
        newDate.value = '2099-12-01';
        newDate.dispatchEvent(new Event('change'));
        const justification = element.shadowRoot.querySelector('[data-element="activity-action-justification"]');
        justification.value = 'El cliente solicitó una nueva fecha.';
        justification.dispatchEvent(new Event('input'));
        await flush();
        element.shadowRoot.querySelector('.activity-action-form').dispatchEvent(new Event('submit'));
        await flush();
        expect(rescheduleAgendaActivity).toHaveBeenCalledWith(
            'nueva', '2099-12-01', 'El cliente solicitó una nueva fecha.'
        );
    });

    it.each(['Completada', 'Cancelada', 'Reagendada'])('mantiene las acciones ocultas en %s', async status => {
        const element = await openMyActivities([record('cerrada', status)]);
        element.shadowRoot.querySelector('[data-filter="Todas"]').click();
        await flush();
        element.shadowRoot.querySelector('.activity-subject-button').click();
        await flush();
        expect(element.shadowRoot.querySelector('.activity-complete-button')).toBeNull();
        expect(element.shadowRoot.querySelector('.activity-reschedule-button')).toBeNull();
        expect(element.shadowRoot.querySelector('.activity-cancel-header-button')).toBeNull();
        expect(element.shadowRoot.querySelector('[data-element="activity-notes"]').readOnly).toBe(true);
    });

    it('no duplica el seguimiento pendiente con la original reagendada', async () => {
        const element = await openMyActivities([
            record('original', 'Reagendada', true), record('nueva', 'Programada', true)
        ]);
        const followUp = element.shadowRoot.querySelector('[data-filter="Seguimiento"]');
        expect(followUp.querySelector('strong').textContent).toBe('1');
        followUp.click();
        await flush();
        expect(element.shadowRoot.querySelectorAll('.activities-table tbody tr')).toHaveLength(1);
        expect(element.shadowRoot.querySelector('.activity-subject-button').dataset.id).toBe('nueva');
    });

    it('dicta el resumen y bloquea completar mientras el reconocimiento esté activo', async () => {
        const element = await openMyActivities([record('seguimiento', 'Programada', true)]);
        await openFollowUp(element);
        const dictation = element.shadowRoot.querySelector('.follow-up-completion-form .notes-speech-button');
        expect(dictation.textContent).toContain('Dictar notas');
        dictation.click();
        recognition.onstart();
        const result = [{ transcript: 'Se entregó la cotización.' }];
        result.isFinal = true;
        recognition.onresult({ results: [result] });
        await flush();
        const summary = element.shadowRoot.querySelector('[data-element="follow-up-resolution"]');
        expect(summary.value).toBe('Se entregó la cotización.');
        expect(summary.readOnly).toBe(true);
        expect(element.shadowRoot.querySelector('.follow-up-completion-form [type="submit"]').disabled).toBe(true);
        recognition.onend();
        await flush();
        element.shadowRoot.querySelector('.follow-up-completion-form').dispatchEvent(new Event('submit'));
        await flush();
        expect(completeAgendaActivity).toHaveBeenCalledWith('seguimiento', 'Se entregó la cotización.');
    });

    it('oculta temporalmente la IA en notas y seguimiento aunque el usuario tenga permiso', async () => {
        const element = await openMyActivities([record('seguimiento', 'Programada', true)]);
        element.shadowRoot.querySelector('.activity-subject-button').click();
        await flush();
        expect(element.shadowRoot.querySelector('.notes-improve-button')).toBeNull();
        expect(element.shadowRoot.querySelector('.notes-speech-button')).not.toBeNull();
        expect(element.shadowRoot.querySelector('[data-element="activity-notes"]').value).toBe('Notas originales');

        element.shadowRoot.querySelector('.activity-complete-button').click();
        await flush();
        const summary = element.shadowRoot.querySelector('[data-element="follow-up-resolution"]');
        summary.value = 'ya se entrego cotizacion y resuelto';
        summary.dispatchEvent(new CustomEvent('input'));
        await flush();
        expect(element.shadowRoot.querySelector('.notes-improve-button')).toBeNull();
        expect(element.shadowRoot.querySelector('.follow-up-completion-form .notes-speech-button')).not.toBeNull();
        expect(improveAgendaText).not.toHaveBeenCalled();
        expect(summary.value).toBe('ya se entrego cotizacion y resuelto');
        element.shadowRoot.querySelector('.follow-up-completion-form').dispatchEvent(new CustomEvent('submit'));
        await flush();
        expect(completeAgendaActivity).toHaveBeenCalledWith('seguimiento', 'ya se entrego cotizacion y resuelto');
    });

    it('oculta la IA en nueva actividad y justificaciones sin quitar el dictado', async () => {
        const element = await openMyActivities([record('programada', 'Programada')]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        expect(element.shadowRoot.querySelector('.notes-improve-button')).toBeNull();
        expect(element.shadowRoot.querySelector('.notes-speech-button')).not.toBeNull();
        await selectClient(element);
        await selectBranch(element);
        const activityType = element.shadowRoot.querySelector('[data-element="activity-type"]');
        activityType.value = 'Llamada';
        activityType.dispatchEvent(new CustomEvent('change'));
        await flush();
        element.shadowRoot.querySelector('[name="callReplacement"][value="yes"]').dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(element.shadowRoot.querySelector('[data-element="activity-exception-justification"]')).not.toBeNull();
        expect(element.shadowRoot.querySelector('.notes-improve-button')).toBeNull();
        expect(element.shadowRoot.querySelector('.notes-speech-button')).not.toBeNull();
        element.shadowRoot.querySelector('.activity-cancel-button').click();
        await flush();
        element.shadowRoot.querySelector('.activity-subject-button').click();
        await flush();
        element.shadowRoot.querySelector('.activity-cancel-header-button').click();
        await flush();
        expect(element.shadowRoot.querySelector('[data-element="activity-action-justification"]')).not.toBeNull();
        expect(element.shadowRoot.querySelector('.notes-improve-button')).toBeNull();
        expect(element.shadowRoot.querySelector('.notes-speech-button')).not.toBeNull();
        expect(improveAgendaText).not.toHaveBeenCalled();
    });

    it('busca clientes en Apex y carga solo sus sucursales disponibles', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        expect(element.shadowRoot.querySelector('[data-element="activity-branch-search"]').disabled).toBe(true);
        expect(getActivityClientBranches).not.toHaveBeenCalled();
        await selectClient(element);
        expect(searchActivityClients).toHaveBeenCalledWith('Cliente de prueba');
        expect(getActivityClientBranches).toHaveBeenCalledWith('001cliente');
        const input = element.shadowRoot.querySelector('[data-element="activity-branch-search"]');
        expect(input.disabled).toBe(false);
        expect(input.value).toBe('');
        expect(element.shadowRoot.querySelector('.branch-picker select')).toBeNull();
        input.dispatchEvent(new FocusEvent('focus'));
        await flush();
        const result = element.shadowRoot.querySelector('[data-branch-id="sucursal-ajena"]');
        expect(result.querySelector('lightning-icon').iconName).toBe('utility:company');
        expect(result.querySelector('small').textContent).toBe('Guadalajara · Jalisco');
        await selectBranch(element);
        expect(element.shadowRoot.querySelector('.activity-form [name="state"]').value).toBe('Jalisco');
    });

    it('guarda Cliente sin sucursal y no cuenta para la frecuencia de una sucursal', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        fillNewActivity(element);
        await flush();
        element.shadowRoot.querySelector('.activity-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await flush();
        expect(createAgendaActivity).toHaveBeenCalledWith(expect.objectContaining({
            clientId: '001cliente', branchId: '', countsTowardFrequency: false
        }));
    });

    it('guarda Cliente y Sucursal cuando se elige una sucursal', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        await selectBranch(element);
        fillNewActivity(element);
        await flush();
        element.shadowRoot.querySelector('.activity-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await flush();
        expect(createAgendaActivity).toHaveBeenCalledWith(expect.objectContaining({
            clientId: '001cliente', branchId: 'sucursal-ajena', countsTowardFrequency: true
        }));
    });

    it('muestra el cliente guardado en el detalle aunque no tenga sucursal', async () => {
        const element = await openMyActivities([{
            ...record('comida', 'Programada'), Prospecto__c: null,
            Cliente__c: '001cliente', Cliente__r: { Name: 'Cliente guardado' }
        }]);
        expect(element.shadowRoot.querySelector('.activity-subject-button').textContent).toContain('Cliente guardado');
        element.shadowRoot.querySelector('.activity-subject-button').click();
        await flush();
        expect(element.shadowRoot.querySelector('input[id^="activity-client-view"]').value).toBe('Cliente guardado');
        expect(element.shadowRoot.querySelector('input[id^="activity-prospect-view"]')).toBeNull();
    });

    it('muestra la sucursal manual en Mis actividades y en su detalle', async () => {
        const element = await openMyActivities([{
            ...record('manual', 'Programada'), Prospecto__c: null,
            Cliente__c: '001cliente', Cliente__r: { Name: 'Cliente guardado' },
            manualBranchName: 'Oficina regional'
        }]);
        expect(element.shadowRoot.querySelector('.activity-subject-button').textContent).toContain('Oficina regional');
        element.shadowRoot.querySelector('.activity-subject-button').click();
        await flush();
        const values = Array.from(element.shadowRoot.querySelectorAll('input')).map(input => input.value);
        expect(values).toContain('Oficina regional');
    });

    it('descarta sucursales en vuelo al cambiar el cliente o cerrar el formulario', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        let resolveBranches;
        getActivityClientBranches.mockReturnValueOnce(new Promise(resolve => { resolveBranches = resolve; }));
        await selectClient(element);
        const search = element.shadowRoot.querySelector('.client-picker input');
        search.value = 'Otro';
        search.dispatchEvent(new CustomEvent('input'));
        resolveBranches([{ Id: 'vieja', Name: 'No debe aparecer' }]);
        await flush();
        expect(element.shadowRoot.querySelector('[data-element="activity-branch-search"]').disabled).toBe(true);
        expect(element.shadowRoot.querySelector('[data-branch-id="vieja"]')).toBeNull();
        element.shadowRoot.querySelector('.activity-cancel-button').click();
        await flush();
        expect(element.shadowRoot.querySelector('.activity-form')).toBeNull();
    });

    it('no acepta texto libre como cliente sin seleccionar una Cuenta', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        fillNewActivity(element);
        const search = element.shadowRoot.querySelector('.client-picker input');
        search.value = 'Nombre no seleccionado';
        search.dispatchEvent(new CustomEvent('input'));
        element.shadowRoot.querySelector('.activity-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await flush();
        expect(createAgendaActivity).not.toHaveBeenCalled();
    });

    it('permite pasar con Tab del buscador a una sugerencia sin cerrar la lista', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        const input = element.shadowRoot.querySelector('.client-picker input');
        input.value = 'Cliente';
        input.dispatchEvent(new CustomEvent('input'));
        await new Promise(resolve => setTimeout(resolve, 310));
        await flush();
        const option = element.shadowRoot.querySelector('[data-client-id="001cliente"]');
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: option }));
        await flush();
        expect(element.shadowRoot.querySelector('[data-client-id="001cliente"]')).not.toBeNull();
        option.click();
        await flush();
        expect(getActivityClientBranches).toHaveBeenCalledWith('001cliente');
    });

    it('filtra sucursales por nombre, ciudad o estado, sin distinguir acentos', async () => {
        getActivityClientBranches.mockResolvedValue([
            { Id: 'mexicali', Name: 'BEBIDAS MUNDIALES MEXICALI-ALMEX', Ciudad__c: 'MEXICALI', Estado__c: 'BC' },
            { Id: 'corporativo', Name: 'CORPORATIVO-ALMEX', Ciudad__c: 'MONTERREY', Estado__c: 'Nuevo León' }
        ]);
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        const input = element.shadowRoot.querySelector('[data-element="activity-branch-search"]');
        for (const [term, expected] of [['mexicali', 'mexicali'], ['baja california', 'mexicali'], ['nuevo leon', 'corporativo']]) {
            input.value = term;
            input.dispatchEvent(new CustomEvent('input'));
            await flush();
            const options = element.shadowRoot.querySelectorAll('.branch-result');
            expect(options).toHaveLength(1);
            expect(options[0].dataset.branchId).toBe(expected);
        }
    });

    it('permite guardar una sucursal escrita aunque no haya coincidencias', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        const input = element.shadowRoot.querySelector('[data-element="activity-branch-search"]');
        input.value = 'Sucursal que no existe';
        input.dispatchEvent(new CustomEvent('input'));
        await flush();
        expect(element.shadowRoot.querySelectorAll('.branch-result')).toHaveLength(0);
        expect(element.shadowRoot.querySelector('.branch-results .account-empty').textContent).toContain('Puedes guardar el nombre escrito');
        fillNewActivity(element);
        await flush();
        element.shadowRoot.querySelector('.activity-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await flush();
        expect(createAgendaActivity).toHaveBeenCalledWith(expect.objectContaining({
            branchId: '', manualBranchName: 'Sucursal que no existe', countsTowardFrequency: false
        }));
    });

    it('quita una sucursal con la X y permite guardar solo al cliente', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        await selectBranch(element);
        expect(element.shadowRoot.querySelector('.branch-selected-location').textContent).toBe('Guadalajara · Jalisco');
        element.shadowRoot.querySelector('[data-element="clear-branch"]').click();
        await flush();
        expect(element.shadowRoot.querySelector('[data-element="activity-branch-search"]').value).toBe('');
        expect(element.shadowRoot.querySelector('.branch-selected-location')).toBeNull();
        fillNewActivity(element);
        await flush();
        element.shadowRoot.querySelector('.activity-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await flush();
        expect(createAgendaActivity).toHaveBeenCalledWith(expect.objectContaining({
            clientId: '001cliente', branchId: '', countsTowardFrequency: false
        }));
    });

    it('borrar el texto elimina la relación y la ubicación de la sucursal anterior', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        await selectBranch(element);
        const input = element.shadowRoot.querySelector('[data-element="activity-branch-search"]');
        input.value = '';
        input.dispatchEvent(new CustomEvent('input'));
        await flush();
        expect(element.shadowRoot.querySelector('.branch-selected-location')).toBeNull();
        expect(element.shadowRoot.querySelector('.activity-form [name="city"]').value).toBe('');
        expect(element.shadowRoot.querySelector('.activity-form [name="state"]').tagName).toBe('SELECT');
        fillNewActivity(element);
        await flush();
        element.shadowRoot.querySelector('.activity-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await flush();
        expect(createAgendaActivity).toHaveBeenCalledWith(expect.objectContaining({ branchId: '' }));
    });

    it('permite guardar el nombre manual al editar una sucursal seleccionada', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        await selectBranch(element);
        const input = element.shadowRoot.querySelector('[data-element="activity-branch-search"]');
        input.value = 'Sucursal de otro';
        input.dispatchEvent(new CustomEvent('input'));
        fillNewActivity(element);
        await flush();
        element.shadowRoot.querySelector('.activity-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await flush();
        expect(createAgendaActivity).toHaveBeenCalledWith(expect.objectContaining({
            clientId: '001cliente', branchId: '', manualBranchName: 'Sucursal de otro',
            countsTowardFrequency: false
        }));
    });

    it('selecciona con flechas y Enter y cierra las sugerencias con Escape', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        const input = element.shadowRoot.querySelector('[data-element="activity-branch-search"]');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
        await flush();
        expect(element.shadowRoot.querySelector('.branch-result.is-active')).not.toBeNull();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
        await flush();
        expect(input.value).toBe('Sucursal de otro ejecutivo');
        expect(element.shadowRoot.querySelector('.branch-results')).toBeNull();
        input.dispatchEvent(new FocusEvent('focus'));
        await flush();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
        await flush();
        expect(element.shadowRoot.querySelector('.branch-results')).toBeNull();
        expect(input.value).toBe('Sucursal de otro ejecutivo');
    });

    it('mantiene las sugerencias al pasar con Tab del input de sucursal a un resultado', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        const input = element.shadowRoot.querySelector('[data-element="activity-branch-search"]');
        input.dispatchEvent(new FocusEvent('focus'));
        await flush();
        const option = element.shadowRoot.querySelector('[data-branch-id="sucursal-ajena"]');
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: option }));
        await flush();
        expect(element.shadowRoot.querySelector('.branch-results')).not.toBeNull();
        option.click();
        await flush();
        expect(input.value).toBe('Sucursal de otro ejecutivo');
    });

    it('mantiene abierta la lista al enfocar y hacer clic con la ruta retargeteada de Salesforce', async () => {
        getActivityClientBranches.mockResolvedValue([
            { Id: 'sucursal-a', Name: 'Sucursal A', Ciudad__c: 'Guadalajara', Estado__c: 'Jalisco' },
            { Id: 'sucursal-b', Name: 'Sucursal B', Ciudad__c: 'Monterrey', Estado__c: 'Nuevo León' }
        ]);
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        const input = element.shadowRoot.querySelector('[data-element="activity-branch-search"]');
        input.dispatchEvent(new FocusEvent('focus'));
        await flush();
        expect(element.shadowRoot.querySelectorAll('.branch-result')).toHaveLength(2);
        clickWithRetargetedPath(input, element);
        await flush();
        expect(element.shadowRoot.querySelectorAll('.branch-result')).toHaveLength(2);
        input.value = 'monterrey';
        input.dispatchEvent(new CustomEvent('input'));
        await flush();
        expect(element.shadowRoot.querySelectorAll('.branch-result')).toHaveLength(1);
        expect(element.shadowRoot.querySelector('.branch-result').dataset.branchId).toBe('sucursal-b');
        input.value = '';
        input.dispatchEvent(new CustomEvent('input'));
        await flush();
        expect(element.shadowRoot.querySelectorAll('.branch-result')).toHaveLength(2);
        clickWithRetargetedPath(input, element);
        await flush();
        expect(element.shadowRoot.querySelectorAll('.branch-result')).toHaveLength(2);
    });

    it('reabre la lista al hacer clic de nuevo aunque el input ya tenga el foco', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        const input = element.shadowRoot.querySelector('[data-element="activity-branch-search"]');
        input.dispatchEvent(new FocusEvent('focus'));
        await flush();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
        await flush();
        expect(element.shadowRoot.querySelector('.branch-results')).toBeNull();
        clickWithRetargetedPath(input, element);
        await flush();
        expect(element.shadowRoot.querySelector('.branch-results')).not.toBeNull();
        document.body.click();
        await flush();
        expect(element.shadowRoot.querySelector('.branch-results')).toBeNull();
    });

    it('la flecha alterna una sola vez y limpiar la selección vuelve a mostrar todas las sucursales', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        const toggle = element.shadowRoot.querySelector('[aria-label="Mostrar sucursales del cliente"]');
        clickWithRetargetedPath(toggle, element);
        await flush();
        expect(element.shadowRoot.querySelector('.branch-results')).not.toBeNull();
        clickWithRetargetedPath(toggle, element);
        await flush();
        expect(element.shadowRoot.querySelector('.branch-results')).toBeNull();
        await selectBranch(element);
        clickWithRetargetedPath(element.shadowRoot.querySelector('[data-element="clear-branch"]'), element);
        await flush();
        expect(element.shadowRoot.querySelector('[data-element="activity-branch-search"]').value).toBe('');
        expect(element.shadowRoot.querySelectorAll('.branch-result')).toHaveLength(1);
    });

    it('los clics internos tampoco cierran las sugerencias del cliente', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        const input = element.shadowRoot.querySelector('.client-picker input');
        input.value = 'Cliente';
        input.dispatchEvent(new CustomEvent('input'));
        await new Promise(resolve => setTimeout(resolve, 310));
        await flush();
        clickWithRetargetedPath(input, element);
        await flush();
        expect(element.shadowRoot.querySelector('[data-client-id="001cliente"]')).not.toBeNull();
        document.body.click();
        await flush();
        expect(element.shadowRoot.querySelector('[data-client-id="001cliente"]')).toBeNull();
    });

    it('cierra el listado al pulsar la etiqueta o el espacio del campo sin reenviar el clic al input', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        const input = element.shadowRoot.querySelector('[data-element="activity-branch-search"]');
        for (const selector of [
            '.branch-picker label', '.branch-picker .optional-field-label',
            '.branch-picker', '.branch-picker .prospect-helper'
        ]) {
            clickWithRetargetedPath(input, element);
            await flush();
            expect(element.shadowRoot.querySelector('.branch-results')).not.toBeNull();
            const click = clickWithRetargetedPath(element.shadowRoot.querySelector(selector), element);
            await flush();
            expect(click.defaultPrevented).toBe(true);
            expect(element.shadowRoot.querySelector('.branch-results')).toBeNull();
            await flush();
            expect(element.shadowRoot.querySelector('.branch-results')).toBeNull();
        }
        clickWithRetargetedPath(input, element);
        await flush();
        expect(element.shadowRoot.querySelector('.branch-results')).not.toBeNull();
        expect(input.value).toBe('');
    });

    it('cerrar desde el encabezado no borra la sucursal seleccionada ni su ubicación', async () => {
        const element = await openMyActivities([]);
        element.shadowRoot.querySelector('.new-activity-button').click();
        await flush();
        await selectClient(element);
        await selectBranch(element);
        const input = element.shadowRoot.querySelector('[data-element="activity-branch-search"]');
        clickWithRetargetedPath(input, element);
        await flush();
        clickWithRetargetedPath(element.shadowRoot.querySelector('.branch-picker label'), element);
        await flush();
        expect(element.shadowRoot.querySelector('.branch-results')).toBeNull();
        expect(input.value).toBe('Sucursal de otro ejecutivo');
        expect(element.shadowRoot.querySelector('.branch-selected-location').textContent).toBe('Guadalajara · Jalisco');
        fillNewActivity(element);
        await flush();
        element.shadowRoot.querySelector('.activity-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await flush();
        expect(createAgendaActivity).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'sucursal-ajena' }));
    });
});
