import getManagementActivitiesApex from "@salesforce/apex/ALMEX_AgendaDataController.getManagementActivities";
import { getManagementActivities } from "c/agendaServices";
import improveAgendaTextApex from '@salesforce/apex/ALMEX_AgendaDataController.improveAgendaText';
import getAgendaAiCandidatesApex from '@salesforce/apex/ALMEX_AgendaDataController.getAgendaAiCandidates';
import { improveAgendaText } from 'c/agendaServices';

jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.getManagementActivities",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

jest.mock('@salesforce/apex/ALMEX_AgendaDataController.improveAgendaText', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ALMEX_AgendaDataController.getAgendaAiCandidates', () => ({ default: jest.fn() }), { virtual: true });

describe('IA: catálogo temporal y un solo envío del texto', () => {
  let now = 1000000000000;
  beforeEach(() => {
    now += 60 * 60 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    getAgendaAiCandidatesApex.mockResolvedValue(['mock/alpha:free', 'mock/beta:free']);
    improveAgendaTextApex.mockResolvedValue('Propuesta corregida.');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('reutiliza los identificadores, pero nunca las notas ni las respuestas', async () => {
    await improveAgendaText('Primera nota', 'notes');
    await improveAgendaText('Segunda nota', 'followUpResolution');
    expect(getAgendaAiCandidatesApex).toHaveBeenCalledTimes(1);
    expect(improveAgendaTextApex).toHaveBeenCalledTimes(2);
    expect(improveAgendaTextApex).toHaveBeenLastCalledWith({
      originalText: 'Segunda nota', context: 'followUpResolution',
      candidateModels: ['mock/alpha:free', 'mock/beta:free']
    });
  });

  it('actualiza el catálogo automáticamente después de quince minutos', async () => {
    await improveAgendaText('Nota', 'notes');
    Date.now.mockReturnValue(now + 15 * 60 * 1000);
    await improveAgendaText('Otra nota', 'notes');
    expect(getAgendaAiCandidatesApex).toHaveBeenCalledTimes(2);
  });

  it('un fallo invalida el plan para el próximo clic, sin reintentar la inferencia', async () => {
    improveAgendaTextApex.mockRejectedValueOnce(new Error('Proveedor no disponible'));
    await expect(improveAgendaText('Nota', 'notes')).rejects.toThrow('Proveedor no disponible');
    expect(improveAgendaTextApex).toHaveBeenCalledTimes(1);
    getAgendaAiCandidatesApex.mockResolvedValue(['mock/gamma:free']);
    await improveAgendaText('Nota', 'notes');
    expect(getAgendaAiCandidatesApex).toHaveBeenCalledTimes(2);
    expect(improveAgendaTextApex).toHaveBeenLastCalledWith(expect.objectContaining({ candidateModels: ['mock/gamma:free'] }));
  });

  it('no envía notas si falla el catálogo y comparte la siguiente consulta concurrente', async () => {
    getAgendaAiCandidatesApex.mockRejectedValueOnce(new Error('Catálogo no disponible'));
    await expect(improveAgendaText('Nota', 'notes')).rejects.toThrow('Catálogo no disponible');
    expect(improveAgendaTextApex).not.toHaveBeenCalled();
    await Promise.all([improveAgendaText('A', 'notes'), improveAgendaText('B', 'notes')]);
    expect(getAgendaAiCandidatesApex).toHaveBeenCalledTimes(2);
    expect(improveAgendaTextApex).toHaveBeenCalledTimes(2);
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
