import { buildVisitLogRows } from "../visitLogLogic";

const branch = (overrides = {}) => ({
  branchId: "sucursal",
  branchName: "Sucursal comercial",
  accountName: "Cliente",
  state: "JA",
  city: "Guadalajara",
  annualFrequency: "4 al año",
  activities: [],
  ...overrides
});
const activity = (id, date, overrides = {}) => ({
  activityId: id,
  folio: `ACT-${id}`,
  activityDate: date,
  status: "Programada",
  activityType: "Visita",
  countsTowardFrequency: true,
  ...overrides
});
const row = (overrides = {}, today = "2026-11-19", year = 2026) =>
  buildVisitLogRows({ today, year, branches: [branch(overrides)] })[0];
const events = (value) =>
  Array.from({ length: 12 }, (_, index) => value[`month${index}Events`]).flat();

describe("Frecuencia, historial y sugerencias anuales", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 19, 12));
  });
  afterEach(() => jest.useRealTimers());

  it.each([undefined, null, {}, { branches: null }])(
    "acepta una respuesta vacía",
    (response) => {
      expect(buildVisitLogRows(response)).toEqual([]);
    }
  );

  it("resuelve cliente, sucursal y ubicación sin alterar sus datos", () => {
    const value = row();
    expect(value).toEqual(
      expect.objectContaining({
        id: "sucursal",
        accountName: "Cliente",
        branchName: "Sucursal comercial",
        stateName: "Jalisco",
        location: "Jalisco · Guadalajara",
        frequencyValue: 4,
        completedCount: 0,
        progressValue: 0,
        lastVisitLabel: "Sin visitas",
        statusLabel: "Atrasado"
      })
    );
  });

  it.each([undefined, "", "Sin definir", "0", "-0"])(
    "maneja una frecuencia sin definir: %s",
    (frequency) => {
      const value = row({ annualFrequency: frequency, activities: null });
      expect(value.frequencyValue).toBe(0);
      expect(value.statusLabel).toBe("Sin frecuencia");
      expect(value.nextVisitLabel).toBe("Sin definir");
      expect(value.hasSuggestions).toBe(false);
    }
  );

  it.each([
    "1 al año",
    "4 al año",
    "12 al año",
    "24 al año",
    "366 al año",
    "999 al año"
  ])("distribuye la frecuencia %s sin sugerir fechas pasadas", (frequency) => {
    const value = row({ annualFrequency: frequency });
    const suggestions = events(value).filter((event) => event.isSuggested);
    expect(value.frequencyValue).toBeLessThanOrEqual(366);
    expect(suggestions.length).toBeLessThanOrEqual(value.frequencyValue);
    for (let month = 0; month < 10; month++)
      expect(value[`month${month}Events`]).toEqual([]);
    suggestions.forEach((event) =>
      expect(Number(event.day)).toBeGreaterThan(0)
    );
  });

  it("solo las actividades completadas que cuentan aumentan el cumplimiento", () => {
    const value = row({
      activities: [
        activity("visita", "2026-03-15", { status: "Completada" }),
        activity("llamada-valida", "2026-05-15", {
          status: "Completada",
          activityType: "Llamada"
        }),
        activity("llamada-normal", "2026-06-15", {
          status: "Completada",
          activityType: "Llamada",
          countsTowardFrequency: false
        }),
        activity("urgente", "2026-07-15", {
          status: "Completada",
          activityType: "Visita extraordinaria",
          countsTowardFrequency: false
        }),
        activity("cancelada", "2026-08-15", { status: "Cancelada" }),
        activity("reagendada", "2026-09-15", { status: "Reagendada" }),
        activity("futura", "2026-12-15")
      ]
    });
    expect(value.completedCount).toBe(2);
    expect(value.progressValue).toBe(50);
    expect(value.lastVisitLabel).toBe("15 may 2026");
    expect(value.activityFilterValues).toEqual(
      expect.arrayContaining([
        "completed",
        "call",
        "extraordinary",
        "scheduled"
      ])
    );
    expect(events(value).filter((event) => !event.isSuggested)).toHaveLength(5);
    expect(
      events(value).find((event) => event.activityId === "urgente").title
    ).toContain("No contabiliza");
  });

  it("da la meta por cumplida y limita el avance visual al 100%", () => {
    const value = row({
      annualFrequency: "1",
      activities: [
        activity("uno", "2026-02-01", { status: "Completada" }),
        activity("dos", "2026-03-01", { status: "Completada" })
      ]
    });
    expect(value.progressValue).toBe(100);
    expect(value.completedCount).toBe(2);
    expect(value.statusLabel).toBe("Al corriente");
    expect(value.nextVisitLabel).toBe("Meta cumplida");
    expect(value.hasSuggestions).toBe(false);
  });

  it("distingue por vencer y al corriente según la fecha actual", () => {
    expect(row({ annualFrequency: "1" }, "2026-12-10").statusLabel).toBe(
      "Por vencer"
    );
    expect(row({ annualFrequency: "1" }, "2026-01-01").statusLabel).toBe(
      "Al corriente"
    );
  });

  it("prioriza una visita futura ya programada y evita duplicar sugerencias en ese mes", () => {
    const value = row({
      annualFrequency: "1",
      activities: [activity("futura", "2026-11-25")]
    });
    expect(value.nextVisitSortValue).toBe("2026-11-25");
    expect(value.nextVisitStyle).toContain("#1669d5");
    expect(events(value).filter((event) => event.isSuggested)).toHaveLength(0);
  });

  it("ordena actividades por día, conserva los folios y descarta fechas vacías", () => {
    const value = row({
      annualFrequency: "0",
      activities: [
        activity("tarde", "2026-11-25"),
        activity("temprana", "2026-11-20", { status: "Completada" }),
        activity("sin-fecha", null),
        activity("fecha-incompleta", "2026")
      ]
    });
    expect(value.month10Events.map((event) => event.activityId)).toEqual([
      "temprana",
      "tarde"
    ]);
    expect(value.month10Events[0].title).toContain("ACT-temprana");
  });

  it("resuelve nombres y ubicación ausentes sin fallar", () => {
    const value = row({
      branchName: "",
      accountName: null,
      state: "",
      city: "",
      annualFrequency: ""
    });
    expect(value.branchName).toBe("Sucursal sin nombre");
    expect(value.accountName).toBe("Sin cuenta relacionada");
    expect(value.location).toBeTruthy();
  });

  it("usa el año y la fecha reales cuando el servidor no proporciona referencia", () => {
    const value = buildVisitLogRows({ branches: [branch()] })[0];
    for (let month = 0; month < 10; month++)
      expect(value[`month${month}Events`]).toEqual([]);
    expect(value.statusLabel).toBe("Atrasado");
  });

  it("planea correctamente al cambiar de año y en un año bisiesto", () => {
    expect(
      row({ annualFrequency: "1" }, "2027-01-01", 2027).nextVisitLabel
    ).toContain("2027");
    const leap = row({ annualFrequency: "366" }, "2028-01-01", 2028);
    expect(leap.frequencyValue).toBe(366);
    expect(events(leap).every((event) => event.isSuggested)).toBe(true);
    expect(leap.month1Events.length).toBeGreaterThan(0);
  });
});
