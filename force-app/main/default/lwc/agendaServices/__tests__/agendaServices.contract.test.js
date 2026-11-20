import * as service from "c/agendaServices";
import completeApex from "@salesforce/apex/ALMEX_AgendaDataController.completeActivity";
import updateApex from "@salesforce/apex/ALMEX_AgendaDataController.updateActivityDetails";
import cancelApex from "@salesforce/apex/ALMEX_AgendaDataController.cancelActivity";
import rescheduleApex from "@salesforce/apex/ALMEX_AgendaDataController.rescheduleActivity";
import activitiesApex from "@salesforce/apex/ALMEX_AgendaDataController.getCurrentUserActivities";
import detailApex from "@salesforce/apex/ALMEX_AgendaDataController.getActivityDetail";
import agreementsApex from "@salesforce/apex/ALMEX_AgendaDataController.getAlmexSupplyAgreements";
import branchesApex from "@salesforce/apex/ALMEX_AgendaDataController.getCurrentUserBranches";
import prospectsApex from "@salesforce/apex/ALMEX_AgendaDataController.searchCurrentUserProspects";
import managementBranchesApex from "@salesforce/apex/ALMEX_AgendaDataController.searchManagementBranches";
import managementProspectsApex from "@salesforce/apex/ALMEX_AgendaDataController.searchManagementProspects";
import clientsApex from "@salesforce/apex/ALMEX_AgendaDataController.searchManagementClients";
import managementApex from "@salesforce/apex/ALMEX_AgendaDataController.getManagementActivities";

jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.completeActivity",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.updateActivityDetails",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.cancelActivity",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.rescheduleActivity",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.getCurrentUserActivities",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.getActivityDetail",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.getAlmexSupplyAgreements",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.getCurrentUserBranches",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.searchCurrentUserProspects",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.searchManagementBranches",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.searchManagementProspects",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.searchManagementClients",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.getManagementActivities",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

describe("Operaciones de Agendas y contrato con Apex", () => {
  afterEach(() => jest.resetAllMocks());
  it("completa, edita, cancela y reagenda sin perder sus parámetros", async () => {
    await service.completeAgendaActivity("actividad");
    expect(completeApex).toHaveBeenCalledWith({
      activityId: "actividad",
      followUpResolution: null
    });
    await service.completeAgendaActivity("actividad", "Resuelto");
    expect(completeApex).toHaveBeenLastCalledWith({
      activityId: "actividad",
      followUpResolution: "Resuelto"
    });
    await service.updateAgendaActivityDetails(
      "actividad",
      true,
      "Notas",
      "Excepción"
    );
    expect(updateApex).toHaveBeenCalledWith({
      activityId: "actividad",
      followUp: true,
      notes: "Notas",
      exceptionJustification: "Excepción"
    });
    await service.updateAgendaActivityDetails("actividad", false, "", "");
    expect(updateApex).toHaveBeenLastCalledWith({
      activityId: "actividad",
      followUp: false,
      notes: null,
      exceptionJustification: null
    });
    await service.cancelAgendaActivity("actividad", "Cancelación");
    expect(cancelApex).toHaveBeenCalledWith({
      activityId: "actividad",
      justification: "Cancelación"
    });
    await service.rescheduleAgendaActivity(
      "actividad",
      "2027-01-20",
      "Reagendación"
    );
    expect(rescheduleApex).toHaveBeenCalledWith({
      activityId: "actividad",
      newDate: "2027-01-20",
      justification: "Reagendación"
    });
  });

  it.each([
    ["getAlmexSupplyAgreements", agreementsApex, []],
    ["getAssignedBranches", branchesApex, []],
    ["searchAssignedProspects", prospectsApex, ["Texto"]],
    ["searchManagementBranches", managementBranchesApex, ["Texto"]],
    ["searchManagementProspects", managementProspectsApex, ["Texto"]],
    ["searchManagementClients", clientsApex, ["Texto"]]
  ])(
    "%s conserva registros y resuelve listas vacías",
    async (name, mock, args) => {
      const records = [{ Id: "registro" }];
      mock.mockResolvedValueOnce(records).mockResolvedValueOnce(null);
      expect(await service[name](...args)).toBe(records);
      expect(await service[name](...args)).toEqual([]);
    }
  );

  it("normaliza tipos históricos y nombres manuales al recuperar calendario y detalle", async () => {
    const record = {
      Cliente__c: "cliente",
      Tipo_de_actividad__c: "Visita extraordinaria",
      Notas__c: "Sucursal (captura manual): Oficina"
    };
    activitiesApex.mockResolvedValueOnce([record]).mockResolvedValueOnce(null);
    expect((await service.getAgendaActivities("2027-01-01"))[0]).toEqual(
      expect.objectContaining({
        Tipo_de_actividad__c: "Visitas urgentes",
        manualBranchName: "Oficina",
        Notas__c: ""
      })
    );
    expect(await service.getAgendaActivities("2027-01-01")).toEqual([]);
    detailApex.mockResolvedValueOnce(record).mockResolvedValueOnce(null);
    expect(
      (await service.getAgendaActivityDetail("actividad")).manualBranchName
    ).toBe("Oficina");
    expect(await service.getAgendaActivityDetail("ausente")).toBeNull();
  });

  it("resuelve una consulta gerencial vacía", async () => {
    managementApex.mockResolvedValue(null);
    expect(await service.getManagementActivities({})).toEqual({
      records: [],
      executiveOptions: [],
      totalRecords: 0,
      hasNext: false
    });
  });

  it.each([
    [{ body: [{ message: "Uno" }, { message: "Dos" }] }, "Uno, Dos"],
    [new Error("Desconectado"), "Desconectado"],
    [{}, "Ocurrió un error procesando las actividades."]
  ])(
    "normaliza las distintas respuestas de error de Apex",
    async (error, expected) => {
      detailApex.mockRejectedValue(error);
      await expect(
        service.getAgendaActivityDetail("actividad")
      ).rejects.toThrow(expected);
    }
  );

  it("rechaza notas demasiado largas antes de enviar la actividad", () => {
    expect(() =>
      service.createAgendaActivity({
        clientId: "cliente",
        manualBranchName: "Oficina",
        notes: "x".repeat(32768)
      })
    ).toThrow("32768");
  });
});
