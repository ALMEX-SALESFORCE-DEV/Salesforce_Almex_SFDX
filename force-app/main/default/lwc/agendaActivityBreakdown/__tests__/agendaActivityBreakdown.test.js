import { createElement } from 'lwc';
import AgendaActivityBreakdown from 'c/agendaActivityBreakdown';
import {
    getManagementActivities, searchManagementClients, searchManagementBranches,
    searchManagementProspects
} from 'c/agendaServices';

jest.mock('c/agendaServices', () => ({
    getManagementActivities: jest.fn(),
    searchManagementClients: jest.fn(),
    searchManagementBranches: jest.fn(),
    searchManagementProspects: jest.fn()
}));

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

async function mount() {
    const element = createElement('c-agenda-activity-breakdown', { is: AgendaActivityBreakdown });
    document.body.appendChild(element);
    await flush();
    return element;
}

async function changeType(element, type) {
    const radio = element.shadowRoot.querySelector(`[name="managementPartyType"][value="${type}"]`);
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    await flush();
}

async function searchAndSelect(element, name) {
    const input = element.shadowRoot.querySelector('input[type="search"]');
    input.value = name;
    input.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(300);
    await flush();
    element.shadowRoot.querySelector('.management-party-result').click();
    await flush();
}

describe('Filtro por cliente en Consulta de actividades', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        getManagementActivities.mockResolvedValue({ records: [], totalRecords: 0, hasNext: false });
        searchManagementClients.mockResolvedValue([{ Id: '001cliente', Name: 'Cliente X' }]);
        searchManagementBranches.mockResolvedValue([{
            Id: 'a01sucursal', Name: 'Sucursal A', Cuenta__r: { Name: 'Cliente X' }, Estado__c: 'JA'
        }]);
        searchManagementProspects.mockResolvedValue([{ Id: '00Qprospecto', Name: 'Prospecto Y' }]);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    it('busca y consulta por Id de Cuenta conservando el periodo y el estado seleccionados', async () => {
        const element = await mount();
        await changeType(element, 'client');
        expect(element.shadowRoot.querySelector('input[type="search"]').placeholder).toBe('Buscar cliente...');
        await searchAndSelect(element, 'Cliente');
        expect(searchManagementClients).toHaveBeenCalledWith('Cliente');
        const from = element.shadowRoot.querySelector('[name="dateFrom"]');
        from.value = '2026-01-01';
        from.dispatchEvent(new Event('change'));
        const to = element.shadowRoot.querySelector('[name="dateTo"]');
        to.value = '2026-12-31';
        to.dispatchEvent(new Event('change'));
        const state = element.shadowRoot.querySelector('[name="state"]');
        state.value = 'Jalisco';
        state.dispatchEvent(new Event('change'));
        await flush();
        element.shadowRoot.querySelector('.table-filter-apply').click();
        await flush();
        expect(getManagementActivities).toHaveBeenLastCalledWith(expect.objectContaining({
            accountId: '001cliente', branchId: '', prospect: '',
            dateFrom: '2026-01-01', dateTo: '2026-12-31', state: 'Jalisco'
        }));
    });

    it('limpia cliente al cambiar a sucursal y elimina el estado autocompletado al volver a cliente', async () => {
        const element = await mount();
        await changeType(element, 'client');
        await searchAndSelect(element, 'Cliente');
        await changeType(element, 'branch');
        await searchAndSelect(element, 'Sucursal');
        element.shadowRoot.querySelector('.table-filter-apply').click();
        await flush();
        expect(getManagementActivities).toHaveBeenLastCalledWith(expect.objectContaining({
            accountId: '', branchId: 'a01sucursal', state: 'Jalisco'
        }));
        await changeType(element, 'client');
        await searchAndSelect(element, 'Cliente');
        element.shadowRoot.querySelector('.table-filter-apply').click();
        await flush();
        expect(getManagementActivities).toHaveBeenLastCalledWith(expect.objectContaining({
            accountId: '001cliente', branchId: '', state: ''
        }));
    });

    it('descarta un cliente anterior si se vuelve a escribir y restablece la búsqueda con Limpiar', async () => {
        const element = await mount();
        await changeType(element, 'client');
        await searchAndSelect(element, 'Cliente');
        const input = element.shadowRoot.querySelector('input[type="search"]');
        input.value = 'Otro cliente';
        input.dispatchEvent(new Event('input'));
        await flush();
        element.shadowRoot.querySelector('.table-filter-apply').click();
        await flush();
        expect(getManagementActivities).not.toHaveBeenCalled();
        element.shadowRoot.querySelector('.table-filter-clear').click();
        await flush();
        expect(getManagementActivities).toHaveBeenLastCalledWith(expect.objectContaining({
            accountId: '', branchId: '', prospect: ''
        }));
        expect(element.shadowRoot.querySelector('[value="branch"]').checked).toBe(true);
    });
});
