import { createElement } from 'lwc';
import AgendaCalendar from 'c/agendaCalendar';
import getCurrentUser from '@salesforce/apex/ALMEX_AgendaDataController.getCurrentUser';
import {
    getAgendaActivities, getAssignedBranches, improveAgendaText, completeAgendaActivity,
    cancelAgendaActivity, rescheduleAgendaActivity
} from 'c/agendaServices';

jest.mock('@salesforce/apex/ALMEX_AgendaDataController.getCurrentUser', () => ({
    default: jest.fn()
}), { virtual: true });
jest.mock('@salesforce/customPermission/ALMEX_Agendas_IA', () => ({
    default: true
}), { virtual: true });
jest.mock('c/agendaServices', () => ({
    getAgendaActivities: jest.fn(),
    getAssignedBranches: jest.fn(),
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
    getAssignedBranches.mockResolvedValue([]);
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

describe('Mis actividades y resolución de seguimiento', () => {
    let recognition;

    beforeEach(() => {
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
});
