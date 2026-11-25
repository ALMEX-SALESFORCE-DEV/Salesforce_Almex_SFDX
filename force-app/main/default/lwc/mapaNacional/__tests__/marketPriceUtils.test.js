import {
  normalizePricePerTon,
  normalizeConsumption,
  normalizePeriodPrice,
  formatRegisteredPrice,
  getRecordPeriod,
  getRecordYears,
  normalizeProvider,
  normalizeProductName,
  normalizeStateName,
  getHighmapsStateName,
  productUsesShipmentSize,
  toExcelRegistrationDate
} from "../marketPriceUtils";

jest.mock(
  "@salesforce/i18n/timeZone",
  () => ({ default: "America/Mexico_City" }),
  { virtual: true }
);

describe("Normalización comercial anual y USD/Ton", () => {
  test.each([
    ["MXN_Kg", 20, 1000],
    ["MXN/Klg", 20, 1000],
    ["MXN_25KG_BULTO", 500, 1000],
    ["MXN 25 kg/bulto", 500, 1000],
    ["MXN_50KG_BULTO", 980, 980],
    ["MXN 50 kg/bulto", 980, 980],
    ["DOLARES_TON", 780, 780],
    ["USD/Tonelada", 780, 780],
    ["DOLARES_KILO", 0.78, 780],
    ["USD/kg", 0.78, 780]
  ])(
    "%s se convierte a USD/Ton sin redondear antes de tiempo",
    (unit, price, expected) => {
      expect(normalizePricePerTon(price, unit, 20)).toBeCloseTo(expected, 8);
    }
  );
  test.each([null, 0, -1, NaN, Infinity])(
    "sin FIX válido (%s), MXN no participa en promedios",
    (rate) => {
      expect(normalizePricePerTon(20, "MXN_Kg", rate)).toBeNull();
      expect(normalizePricePerTon(780, "DOLARES_TON", rate)).toBe(780);
    }
  );
  test.each([null, "", 0, -1, "inválido", Infinity])(
    "precio inválido %s no se trata como cero comparable",
    (price) => {
      expect(normalizePricePerTon(price, "USD_TON", 20)).toBeNull();
    }
  );
  it("rechaza unidades desconocidas", () => {
    expect(normalizePricePerTon(100, "saco sin peso", 20)).toBeNull();
  });
  test.each([
    ["M", 120, 9360],
    ["A", 10, 780],
    ["", 120, 9360],
    [" a ", 10, 780]
  ])(
    "tipo %s: consumo y precio se homologan a anual",
    (type, consumption, price) => {
      const record = Object.freeze({
        Consumo_mensual__c: 10,
        Precio_producto__c: 780,
        Unidad__c: "DOLARES_TON",
        Tipo_consumo_toneladas__c: type
      });
      expect(normalizeConsumption(record)).toBe(consumption);
      expect(normalizePeriodPrice(record, null)).toBe(price);
      expect(record.Precio_producto__c).toBe(780);
      expect(record.Consumo_mensual__c).toBe(10);
    }
  );
  it("conserva precisión de bultos y periodicidad antes del promedio", () => {
    const record = {
      Precio_producto__c: 980,
      Unidad__c: "MXN_50KG_BULTO",
      Tipo_consumo_toneladas__c: "M"
    };
    expect(normalizePeriodPrice(record, 18.5798)).toBeCloseTo(
      (((980 / 50) * 1000) / 18.5798) * 12,
      10
    );
  });
  it("un precio MXN sin FIX sigue siendo no comparable tras anualizar", () => {
    expect(
      normalizePeriodPrice(
        { Precio_producto__c: 20, Unidad__c: "MXN_Kg" },
        null
      )
    ).toBeNull();
  });
  test.each([
    [14.73, "MXN/Klg", "MXN 14.73"],
    [2966, "DOLARES_TON", "USD 2,966.00"],
    [0, "USD_TON", "USD 0.00"],
    [null, "USD_TON", ""],
    ["", "USD_TON", ""],
    ["abc", "USD_TON", ""],
    [10, "unidad antigua", "10.00 (unidad antigua)"]
  ])("conserva el precio registrado %s %s", (price, unit, expected) => {
    expect(formatRegisteredPrice(price, unit)).toBe(expected);
  });
});

describe("Año del registro, catálogos y exportación", () => {
  it("usa únicamente Periodo_Anio__c y nunca vigencia contractual ni CreatedDate", () => {
    const record = {
      Periodo_Anio__c: 2026,
      Fecha_inicio_contrato__c: "2027-01-01",
      Fecha_fin_contrato__c: "2027-12-31",
      CreatedDate: "2028-01-01T12:00:00Z"
    };
    expect(getRecordYears(record)).toEqual([2026]);
    expect(getRecordPeriod(record)).toEqual({
      year: 2026,
      key: 2026,
      label: "2026"
    });
    delete record.Periodo_Anio__c;
    expect(getRecordYears(record)).toEqual([]);
  });
  test.each([null, "", 1999, 2101, 2026.5, "abc"])(
    "año inválido %s no genera filtro ficticio",
    (year) => {
      expect(getRecordPeriod({ Periodo_Anio__c: year })).toBeNull();
    }
  );
  test.each([
    ["Ingredion", "Ingredion México"],
    [" ADM ", "ADM México"],
    ["gam", "Grupo Azucarero México"],
    ["ALMEX", "ALMEX"],
    ["", "N/A"],
    ["Proveedor nuevo", "Proveedor nuevo"]
  ])("homologa proveedor %s", (input, expected) => {
    expect(normalizeProvider(input)).toBe(expected);
  });
  it("homologa productos y nombres geográficos sin cambiar la geometría histórica", () => {
    expect(normalizeProductName("Almidon")).toBe("Almidón");
    expect(normalizeProductName("Dextrosa Liquida")).toBe(
      "Dextrosa 95% líquida"
    );
    expect(normalizeStateName("Distrito Federal")).toBe("Ciudad de México");
    expect(getHighmapsStateName("Ciudad de México")).toBe("Distrito Federal");
    expect(getHighmapsStateName("Estado de México")).toBe("México");
  });
  test.each([
    "Almidón",
    "Glucosa 43",
    "Fructosa 55",
    "KRYSTAR líquido",
    "Dextrosa monohidratada",
    "Dextrosa 95% líquida"
  ])("%s requiere columna de embarque", (product) =>
    expect(productUsesShipmentSize(product)).toBe(true)
  );
  it("azúcar no requiere embarque por defecto", () =>
    expect(productUsesShipmentSize("Azúcar")).toBe(false));
  it("exporta CreatedDate como fecha/hora de Excel en zona del usuario, no fecha contractual", () => {
    const cell = toExcelRegistrationDate("2026-11-19T15:30:00Z");
    const expected =
      (Date.UTC(2026, 10, 19, 9, 30) - Date.UTC(1899, 11, 30)) / 86400000;
    expect(cell).toEqual({ t: "n", v: expected, z: "dd/mm/yyyy hh:mm:ss" });
    expect(toExcelRegistrationDate("invalida")).toBe("");
    expect(toExcelRegistrationDate(null)).toBe("");
  });
});
