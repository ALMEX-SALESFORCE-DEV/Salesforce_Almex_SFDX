import getManagementActivitiesApex from "@salesforce/apex/ALMEX_AgendaDataController.getManagementActivities";
import { getManagementActivities } from "c/agendaServices";

jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.getManagementActivities",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

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
