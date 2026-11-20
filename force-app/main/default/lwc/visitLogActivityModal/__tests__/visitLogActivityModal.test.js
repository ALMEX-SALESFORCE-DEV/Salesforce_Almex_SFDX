import { createElement } from 'lwc';
import VisitLogActivityModal from 'c/visitLogActivityModal';
import { getAgendaActivityDetail } from 'c/agendaServices';

jest.mock('c/agendaServices', () => ({ getAgendaActivityDetail: jest.fn() }));

describe('Detalle: cliente guardado en la actividad', () => {
    afterEach(() => {
        document.body.replaceChildren();
        jest.clearAllMocks();
    });

    it('muestra la Cuenta seleccionada aunque la actividad no tenga sucursal', async () => {
        getAgendaActivityDetail.mockResolvedValue({
            Id: 'actividad', Cliente__c: '001cliente', Cliente__r: { Name: 'Cliente sin sucursal' },
            Titulo__c: 'Comida de trabajo', Estatus__c: 'Programada'
        });
        const element = createElement('c-visit-log-activity-modal', { is: VisitLogActivityModal });
        element.activityId = 'actividad';
        document.body.appendChild(element);
        await Promise.resolve();
        await Promise.resolve();
        const values = Array.from(element.shadowRoot.querySelectorAll('input')).map(input => input.value);
        expect(values).toContain('Cliente sin sucursal');
    });
});
