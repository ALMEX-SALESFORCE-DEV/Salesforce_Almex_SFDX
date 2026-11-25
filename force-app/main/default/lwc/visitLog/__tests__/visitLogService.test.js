import getVisitLogApex from "@salesforce/apex/ALMEX_AgendaDataController.getCurrentUserVisitLog";
import { getCurrentUserVisitLog } from "../visitLogService";

jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.getCurrentUserVisitLog",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

describe("Servicio Apex de la bitácora", () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });
  it("conserva la fecha y año enviados por Apex", async () => {
    const response = { today: "2027-02-15", year: 2027, branches: [] };
    getVisitLogApex.mockResolvedValue(response);
    expect(await getCurrentUserVisitLog()).toBe(response);
  });
  it("devuelve una estructura vacía del año actual si Apex responde null", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2028, 1, 29));
    getVisitLogApex.mockResolvedValue(null);
    expect(await getCurrentUserVisitLog()).toEqual({
      year: 2028,
      today: "",
      branches: []
    });
  });
  it.each([
    [
      { body: [{ message: "Primero" }, { message: "Segundo" }] },
      "Primero, Segundo"
    ],
    [{ body: { message: "Sin permiso" } }, "Sin permiso"],
    [new Error("Sin conexión"), "Sin conexión"],
    [{}, "No fue posible cargar la bitácora de visitas."]
  ])("normaliza los errores sin ocultarlos", async (error, message) => {
    getVisitLogApex.mockRejectedValue(error);
    await expect(getCurrentUserVisitLog()).rejects.toThrow(message);
  });
});
