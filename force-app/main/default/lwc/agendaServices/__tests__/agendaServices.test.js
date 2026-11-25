import getManagementActivitiesApex from "@salesforce/apex/ALMEX_AgendaDataController.getManagementActivities";
import { getManagementActivities, createAgendaActivity, searchActivityClients, getActivityClientBranches } from "c/agendaServices";
import createActivityApex from '@salesforce/apex/ALMEX_AgendaDataController.createActivity';
import searchActivityClientsApex from '@salesforce/apex/ALMEX_AgendaDataController.searchActivityClients';
import getActivityClientBranchesApex from '@salesforce/apex/ALMEX_AgendaDataController.getActivityClientBranches';

jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.getManagementActivities",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

jest.mock('@salesforce/apex/ALMEX_AgendaDataController.createActivity', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ALMEX_AgendaDataController.searchActivityClients', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ALMEX_AgendaDataController.getActivityClientBranches', () => ({ default: jest.fn() }), { virtual: true });

describe('Cliente y sucursal opcional', () => {
  afterEach(() => jest.clearAllMocks());
  it('envía el Id de Cuenta al guardar, incluso sin sucursal', async () => {
    await createAgendaActivity({ title: 'Comida', activityType: 'Otro', date: '2026-11-04', clientId: '001cliente' });
    expect(createActivityApex).toHaveBeenCalledWith(expect.objectContaining({
      clientId: '001cliente', branchId: null, prospectId: null
    }));
  });
  it('consulta clientes por texto y sucursales por Cuenta', async () => {
    searchActivityClientsApex.mockResolvedValue([{ Id: '001cliente', Name: 'Cliente' }]);
    getActivityClientBranchesApex.mockResolvedValue([]);
    expect(await searchActivityClients('Cliente')).toHaveLength(1);
    expect(searchActivityClientsApex).toHaveBeenCalledWith({ searchTerm: 'Cliente' });
    expect(await getActivityClientBranches('001cliente')).toEqual([]);
    expect(getActivityClientBranchesApex).toHaveBeenCalledWith({ clientId: '001cliente' });
  });
  it('conserva el nombre manual en Notas sin enviar campos nuevos a Apex', async () => {
    await createAgendaActivity({
      title: 'Visita', clientId: '001cliente', manualBranchName: '  Oficina regional  ', notes: 'Acuerdos de la visita.'
    });
    expect(createActivityApex).toHaveBeenCalledWith(expect.objectContaining({
      clientId: '001cliente', branchId: null,
      notes: 'Sucursal (captura manual): Oficina regional\n\nAcuerdos de la visita.'
    }));
    expect(createActivityApex.mock.calls[0][0]).not.toHaveProperty('manualBranchName');
  });
  it('separa la sucursal manual de las notas al recuperar la tabla', async () => {
    getManagementActivitiesApex.mockResolvedValue({ records: [{
      Cliente__c: '001cliente', Sucursal__c: null,
      Notas__c: 'Sucursal (captura manual): Oficina regional\n\nNotas conservadas.'
    }] });
    const result = await getManagementActivities({});
    expect(result.records[0]).toEqual(expect.objectContaining({
      manualBranchName: 'Oficina regional', Notas__c: 'Notas conservadas.'
    }));
  });
  it('la selección de una sucursal existente tiene prioridad sobre el texto manual', async () => {
    await createAgendaActivity({ clientId: '001cliente', branchId: 'sucursal', manualBranchName: 'Ignorar', notes: 'Notas.' });
    expect(createActivityApex).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'sucursal', notes: 'Notas.' }));
  });
});


describe("Contrato de filtros entre JavaScript y Apex", () => {
  afterEach(() => jest.resetAllMocks());

  it("envía listas tipadas y conserva el cliente, periodo y cursor de la consulta", async () => {
    getManagementActivitiesApex.mockResolvedValue({
      records: [],
      totalRecords: 0
    });
    await getManagementActivities({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      executives: ["Ana"],
      activityTypes: ["Visita", "Llamada"],
      states: ["Jalisco", "Sonora"],
      followUps: [false, true],
      statuses: ["Programada", "Completada"],
      accountId: "001cliente",
      cursor: {
        date: "2026-10-20",
        createdDate: "2026-10-01T00:00:00Z",
        id: "a01registro"
      },
      pageSize: 50
    });
    expect(getManagementActivitiesApex).toHaveBeenCalledWith({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      executives: ["Ana"],
      activityTypes: ["Visita", "Llamada"],
      states: ["Jalisco", "Sonora"],
      followUps: [false, true],
      statuses: ["Programada", "Completada"],
      accountId: "001cliente",
      branchId: null,
      prospect: null,
      cursorDate: "2026-10-20",
      cursorCreatedDate: "2026-10-01T00:00:00Z",
      cursorId: "a01registro",
      pageSize: 50
    });
  });

  it("usa listas vacías para filtros no seleccionados y normaliza tipos históricos de la respuesta", async () => {
    getManagementActivitiesApex.mockResolvedValue({
      records: [{ Tipo_de_actividad__c: "Reunión" }],
      totalRecords: 1
    });
    const result = await getManagementActivities({});
    expect(getManagementActivitiesApex).toHaveBeenCalledWith(
      expect.objectContaining({
        activityTypes: [],
        states: [],
        followUps: [],
        statuses: [],
        executives: [],
        cursorId: null
      })
    );
    expect(result.records[0].Tipo_de_actividad__c).toBe("Reunión Teams");
  });

  it("propaga los errores controlados del servidor para mostrarlos en el filtro", async () => {
    getManagementActivitiesApex.mockRejectedValue({
      body: { message: "Sin acceso al Desglose" }
    });
    await expect(getManagementActivities({})).rejects.toThrow(
      "Sin acceso al Desglose"
    );
  });
});
