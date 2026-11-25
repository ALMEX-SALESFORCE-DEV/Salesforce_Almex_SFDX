import USER_TIME_ZONE from "@salesforce/i18n/timeZone";

export function toExcelRegistrationDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: USER_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  // Excel no almacena zona horaria: conservar la fecha/hora local del usuario de Salesforce.
  const localTime = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return {
    t: "n",
    v: (localTime - Date.UTC(1899, 11, 30)) / 86400000,
    z: "dd/mm/yyyy hh:mm:ss"
  };
}

export const PRICE_UNITS = Object.freeze({
  MXN_PER_KG: "MXN_Kg",
  MXN_25_KG_BAG: "MXN_25KG_BULTO",
  MXN_50_KG_BAG: "MXN_50KG_BULTO",
  USD_PER_TON: "DOLARES_TON",
  USD_PER_KG: "DOLARES_KILO"
});

export const CURRENCIES = Object.freeze({
  MXN: "MXN",
  USD: "USD"
});

export const PRICE_UNIT_CONFIG = Object.freeze({
  [PRICE_UNITS.MXN_PER_KG]: Object.freeze({
    currency: CURRENCIES.MXN,
    divisor: 1
  }),
  [PRICE_UNITS.MXN_25_KG_BAG]: Object.freeze({
    currency: CURRENCIES.MXN,
    divisor: 25
  }),
  [PRICE_UNITS.MXN_50_KG_BAG]: Object.freeze({
    currency: CURRENCIES.MXN,
    divisor: 50
  }),
  [PRICE_UNITS.USD_PER_TON]: Object.freeze({
    currency: CURRENCIES.USD,
    divisor: 1000
  }),
  [PRICE_UNITS.USD_PER_KG]: Object.freeze({
    currency: CURRENCIES.USD,
    divisor: 1
  })
});

export const STATE_NAME_ALIASES = Object.freeze({
  México: "Estado de México",
  "Estado de Mexico": "Estado de México",
  "Estado de México": "Estado de México",
  "Distrito Federal": "Ciudad de México",
  "Ciudad de Mexico": "Ciudad de México",
  "Ciudad de México": "Ciudad de México",
  Michoacan: "Michoacán",
  Queretaro: "Querétaro",
  "San Luis Potosi": "San Luis Potosí",
  Yucatan: "Yucatán",
  "Nuevo Leon": "Nuevo León"
});

// Highmaps conserva estos nombres históricos dentro de su geometría.
// Se usan solo para localizar el polígono; nunca se muestran al usuario.
export const HIGHMAPS_STATE_NAMES = Object.freeze({
  "Estado de México": "México",
  "Ciudad de México": "Distrito Federal"
});

export const PRODUCT_NAME_ALIASES = Object.freeze({
  Almidon: "Almidón",
  Azucar: "Azúcar",
  "Fructuosa 42": "Fructosa 42",
  // Compatibilidad de lectura: el nombre anterior corresponde al mismo producto.
  "Dextrosa líquida": "Dextrosa 95% líquida",
  "Dextrosa Líquida": "Dextrosa 95% líquida",
  "Dextrosa Liquida": "Dextrosa 95% líquida",
  "Dextrosa liquida": "Dextrosa 95% líquida",
  "Glucosa Alta Maltosa": "Glucosa alta en maltosa",
  "Glucosa alta maltosa": "Glucosa alta en maltosa",
  "Fructosa Cristalina 99": "Fructosa cristalina 99",
  "Krystar Liquido": "KRYSTAR líquido",
  "Krystar líquido": "KRYSTAR líquido",
  "KRYSTAR Liquido": "KRYSTAR líquido",
  "Dextrosa 95% liquida": "Dextrosa 95% líquida",
  "Dextrosa 95% Líquida": "Dextrosa 95% líquida"
});

export const DEFAULT_PROVIDER_COLOR = "#5B6573";
// Una sola definición de identidad y color, compartida por mapa, leyendas,
// filtros, tablas y exportación. Conservar los colores existentes de PIASA/BSM.
export const PROVIDER_CATALOG = Object.freeze([
  { name: "ALMEX", color: "#D32F2F" },
  { name: "Ingredion México", color: "#6CB33E", aliases: ["Ingredion"] },
  { name: "Cargill México", color: "#00843D", aliases: ["Cargill"] },
  { name: "ADM México", color: "#012169", aliases: ["ADM"] },
  { name: "Tate & Lyle México", color: "#4D6987", aliases: ["Tate & Lyle"] },
  { name: "Roquette México", color: "#0052D2", aliases: ["Roquette"] },
  { name: "Primient", color: "#757575" },
  { name: "PIASA", color: "#B71C1C" },
  { name: "Mill Foods", color: "#7ACDE2" },
  { name: "Beta San Miguel", color: "#3949AB" },
  {
    name: "Grupo Azucarero México",
    color: "#795548",
    aliases: ["Grupo Azucarero Mexico", "GAM"]
  },
  { name: "Grupo Porres", color: "#009633" },
  { name: "Zucarmex", color: "#0D662C" },
  { name: "Ingenio La Gloria", color: "#F57C00" },
  { name: "MC Sugar", color: "#37B1E0" },
  { name: "N/A", color: DEFAULT_PROVIDER_COLOR }
]);

export function providerIdentityKey(provider) {
  return String(provider || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export const PROVIDERS_BY_KEY = Object.freeze(
  Object.fromEntries(
    PROVIDER_CATALOG.flatMap((provider) =>
      [provider.name, ...(provider.aliases || [])].map((name) => [
        providerIdentityKey(name),
        provider
      ])
    )
  )
);
export const PROVIDER_COLORS = Object.freeze(
  Object.fromEntries(PROVIDER_CATALOG.map(({ name, color }) => [name, color]))
);

export function normalizeStateName(state) {
  const normalizedState = String(state || "").trim();
  return STATE_NAME_ALIASES[normalizedState] || normalizedState;
}

export function getHighmapsStateName(state) {
  const displayState = normalizeStateName(state);
  return HIGHMAPS_STATE_NAMES[displayState] || displayState;
}

export function normalizeProductName(product) {
  return PRODUCT_NAME_ALIASES[product] || product;
}

export function normalizeProvider(provider) {
  const normalizedProvider = String(provider || "").trim();

  if (!normalizedProvider) {
    return "N/A";
  }

  return (
    PROVIDERS_BY_KEY[providerIdentityKey(normalizedProvider)]?.name ||
    normalizedProvider
  );
}

export function normalizeUnitKey(unit) {
  return String(unit || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getPriceUnitConfig(unit) {
  switch (normalizeUnitKey(unit)) {
    case "MXN_KG":
    case "MXN_KLG":
    case "MXN_KILO":
      return PRICE_UNIT_CONFIG[PRICE_UNITS.MXN_PER_KG];

    case "MXN_25KG_BULTO":
    case "MXN_25_KG_BULTO":
      return PRICE_UNIT_CONFIG[PRICE_UNITS.MXN_25_KG_BAG];

    case "MXN_50KG_BULTO":
    case "MXN_50_KG_BULTO":
      return PRICE_UNIT_CONFIG[PRICE_UNITS.MXN_50_KG_BAG];

    case "DOLARES_TON":
    case "DOLARES_TONELADA":
    case "USD_TON":
    case "USD_TONELADA":
      return PRICE_UNIT_CONFIG[PRICE_UNITS.USD_PER_TON];

    case "DOLARES_KILO":
    case "DOLARES_KG":
    case "USD_KILO":
    case "USD_KG":
      return PRICE_UNIT_CONFIG[PRICE_UNITS.USD_PER_KG];

    default:
      return null;
  }
}

export function getRecordConsumptionType(record) {
  return (
    String(record?.Tipo_consumo_toneladas__c || "")
      .trim()
      .toUpperCase() || "M"
  );
}

export function normalizePricePerTon(price, unit, mxnPerUsd) {
  const numericPrice = Number(price);
  const unitConfig = getPriceUnitConfig(unit);

  if (!Number.isFinite(numericPrice) || numericPrice <= 0 || !unitConfig) {
    return null;
  }

  const perTon = (numericPrice / unitConfig.divisor) * 1000;
  if (unitConfig.currency === CURRENCIES.USD) return perTon;
  return Number.isFinite(mxnPerUsd) && mxnPerUsd > 0
    ? perTon / mxnPerUsd
    : null;
}

export function normalizePeriodValue(value, record) {
  return getRecordConsumptionType(record) === "A" ? value : value * 12;
}

export function normalizeConsumption(record) {
  return normalizePeriodValue(Number(record.Consumo_mensual__c) || 0, record);
}

export function normalizePeriodPrice(record, mxnPerUsd) {
  const pricePerTon = normalizePricePerTon(
    record.Precio_producto__c,
    record.Unidad__c,
    mxnPerUsd
  );
  // Regla comercial: homologar cada precio al periodo elegido ANTES de promediar.
  // No redondear aquí ni modificar el precio registrado en Salesforce.
  return pricePerTon === null
    ? null
    : normalizePeriodValue(pricePerTon, record);
}

export function formatRegisteredPrice(price, unit) {
  if (
    price === null ||
    price === undefined ||
    price === "" ||
    !Number.isFinite(Number(price))
  )
    return "";
  const amount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(price));
  const currency = getPriceUnitConfig(unit)?.currency;
  return currency
    ? `${currency} ${amount}`
    : `${amount} (${unit || "Sin unidad"})`;
}

export function productUsesShipmentSize(product) {
  const normalizedProduct = String(product || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  return (
    normalizedProduct === "almidon" ||
    normalizedProduct.includes("glucosa") ||
    normalizedProduct.includes("fructosa") ||
    normalizedProduct.includes("fructuosa") ||
    normalizedProduct === "krystar liquido" ||
    normalizedProduct === "dextrosa monohidratada" ||
    (normalizedProduct.includes("dextrosa") &&
      normalizedProduct.includes("liquida"))
  );
}

export function getRecordYears(record) {
  const period = getRecordPeriod(record);
  return period ? [period.year] : [];
}

export function getRecordPeriod(record) {
  const periodYear = Number(record?.Periodo_Anio__c);

  if (
    Number.isInteger(periodYear) &&
    periodYear >= 2000 &&
    periodYear <= 2100
  ) {
    return {
      year: periodYear,
      key: periodYear,
      label: String(periodYear)
    };
  }

  return null;
}