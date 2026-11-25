import { createElement } from "lwc";
import MapaNacional from "c/mapaNacional";
import getPrices from "@salesforce/apex/ALMEX_MapDataController.getPrices";
import getExchangeRate from "@salesforce/apex/ALMEX_MapDataController.getExchangeRate";

jest.mock(
  "@salesforce/apex/ALMEX_MapDataController.getPrices",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_MapDataController.getExchangeRate",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock("lightning/platformResourceLoader", () => ({
  loadScript: jest.fn(() => Promise.resolve())
}));

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const record = (id, overrides = {}) => ({
  Id: id,
  Nombre_producto__c: "Glucosa 43",
  Estado__c: "Jalisco",
  Ciudad__c: "Arandas",
  Nombre_comercial__c: `Sucursal ${id}`,
  Proveedor__c: "Ingredion",
  Periodo_Anio__c: 2026,
  Tipo_consumo_toneladas__c: "A",
  Consumo_mensual__c: 100,
  Precio_producto__c: 780,
  Unidad__c: "DOLARES_TON",
  Tipo_operacion_comercial__c: "Contrato",
  Fecha_inicio_contrato__c: "2027-01-01",
  Fecha_fin_contrato__c: "2027-12-31",
  CreatedDate: "2026-10-22T18:30:00Z",
  Producto_importado__c: false,
  ...overrides
});
const fixtures = [
  record("1"),
  record("2", {
    Tipo_operacion_comercial__c: "Spot",
    Proveedor__c: "ALMEX",
    Tipo_consumo_toneladas__c: "M",
    Consumo_mensual__c: 10,
    Precio_producto__c: 100
  }),
  record("3", {
    Tipo_operacion_comercial__c: "Propuesta",
    Precio_producto__c: 800,
    Producto_importado__c: true
  }),
  record("4", {
    Periodo_Anio__c: 2027,
    Tipo_operacion_comercial__c: "Propuesta",
    Proveedor__c: "ALMEX"
  }),
  record("5", {
    Nombre_producto__c: "Almidón",
    Tipo_subproducto__c: "Granel",
    Tama_o_embarque__c: "3 Ton"
  })
];

async function mount(records = fixtures) {
  getPrices.mockResolvedValue(records);
  const element = createElement("c-mapa-nacional", { is: MapaNacional });
  document.body.appendChild(element);
  await flush();
  return element;
}
async function choose(element, selector, value) {
  const control = element.shadowRoot.querySelector(selector);
  control.value = value;
  control.dispatchEvent(new CustomEvent("change", { detail: { value } }));
  await flush();
}
const table = (element, name) =>
  element.shadowRoot.querySelector(`[data-table="${name}"]`);
async function glucosa(element) {
  await choose(element, ".product-select", "Glucosa 43");
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ features: [] }) })
  );
  getExchangeRate.mockResolvedValue({ mxnPerUsd: 20, rateDate: "2026-11-19" });
  delete window.Highcharts;
});
afterEach(() => {
  document.body.replaceChildren();
  delete global.XLSX;
});

describe("Mapa, indicadores y tablas con el mismo alcance", () => {
  it("carga precios y tipo de cambio, y ofrece años reales sin meses", async () => {
    const element = await mount();
    expect(getPrices).toHaveBeenCalledTimes(1);
    expect(getExchangeRate).toHaveBeenCalledTimes(1);
    expect(
      [
        ...element.shadowRoot.querySelector('[name="periodFilterYear"]').options
      ].map((o) => o.value)
    ).toEqual(["", "2027", "2026"]);
    expect(
      element.shadowRoot.querySelector('[name="periodFilterMonth"]')
    ).toBeNull();
    expect(
      element.shadowRoot.querySelector(".exchange-rate-context").textContent
    ).toContain("20 MXN");
  });
  it("el año usa el dato del registro e incluye Contrato, Spot y Propuesta aunque la vigencia diga 2027", async () => {
    const element = await mount();
    await glucosa(element);
    expect(table(element, "city").data).toHaveLength(4);
    await choose(element, '[name="periodFilterYear"]', "2026");
    expect(table(element, "city").data.map((r) => r.operationType)).toEqual([
      "Contrato",
      "Spot",
      "Propuesta"
    ]);
    expect(table(element, "city").data[0].contractStartDate).toBe("2027-01-01");
    await choose(element, '[name="periodFilterYear"]', "2027");
    expect(table(element, "city").data).toHaveLength(1);
    element.shadowRoot
      .querySelector(".period-clear:not(.provider-clear)")
      .click();
    await flush();
    expect(table(element, "city").data).toHaveLength(4);
  });
  it("anualiza cada registro antes de promediar y coincide con resumen y detalle", async () => {
    const element = await mount();
    await glucosa(element);
    await choose(element, '[name="periodFilterYear"]', "2026");
    const rows = table(element, "city").data;
    expect(rows.map((r) => r.price)).toEqual([780, 1200, 800]);
    expect(rows.map((r) => r.consumption)).toEqual([100, 120, 100]);
    expect(rows[1].registeredPrice).toBe("USD 100.00");
    const summary = table(element, "state").data[0];
    expect(summary.consumption).toBe(320);
    expect(summary.averagePrice).toBe(790);
    expect(summary.Nuestro_precio).toBe(1200);
    expect(
      element.shadowRoot.querySelector(".stat-card-price .stat-value")
        .textContent
    ).toContain("926.67");
    expect(summary.productOrigin).toBe("Nacional e importado");
  });
  it("el proveedor filtra detalle, historial e indicadores y puede limpiarse", async () => {
    const element = await mount();
    await glucosa(element);
    await choose(element, '[name="providerFilter"]', "ALMEX");
    expect(table(element, "city").data).toHaveLength(2);
    expect(
      table(element, "city").data.every((r) => r.provider === "ALMEX")
    ).toBe(true);
    expect(table(element, "history").data).toHaveLength(1);
    element.shadowRoot.querySelector(".provider-clear").click();
    await flush();
    expect(table(element, "city").data).toHaveLength(4);
  });
  it("historial solo contiene propuestas del producto, año y proveedor seleccionados, sin fechas contractuales", async () => {
    const element = await mount();
    await glucosa(element);
    expect(table(element, "history").data).toHaveLength(2);
    expect(
      table(element, "history").columns.map((c) => c.fieldName)
    ).not.toEqual(
      expect.arrayContaining([
        "contractStartDate",
        "contractEndDate",
        "operationType"
      ])
    );
    await choose(element, '[name="historyProvider"]', "Ingredion México");
    expect(table(element, "history").data).toHaveLength(1);
    expect(table(element, "history").data[0].productOrigin).toBe("Importado");
    await choose(element, '[name="periodFilterYear"]', "2027");
    expect(table(element, "history").data).toHaveLength(1);
    expect(table(element, "history").data[0].provider).toBe("ALMEX");
  });
  it("las columnas dependientes muestran subproducto solo donde aplica y conservan la vigencia en ciudad", async () => {
    const element = await mount();
    await glucosa(element);
    expect(
      table(element, "city").columns.map((c) => c.fieldName)
    ).not.toContain("subproduct");
    expect(table(element, "city").columns.map((c) => c.fieldName)).toContain(
      "contractStartDate"
    );
    await choose(element, ".product-select", "Almidón");
    expect(table(element, "city").columns.map((c) => c.fieldName)).toEqual(
      expect.arrayContaining(["subproduct", "shipmentSize", "productOrigin"])
    );
    expect(table(element, "city").data[0].subproduct).toBe("Granel");
  });
  it("seleccionar un estado limita ciudad y quitar la selección restaura los registros", async () => {
    const element = await mount([
      record("1"),
      record("2", { Estado__c: "Sonora" })
    ]);
    await glucosa(element);
    table(element, "state").dispatchEvent(
      new CustomEvent("rowselection", {
        detail: { selectedRows: [table(element, "state").data[0]] }
      })
    );
    await flush();
    expect(table(element, "city").data).toHaveLength(1);
    table(element, "state").dispatchEvent(
      new CustomEvent("rowselection", { detail: { selectedRows: [] } })
    );
    await flush();
    expect(table(element, "city").data).toHaveLength(2);
  });
  it("sin Banxico no mezcla MXN sin convertir con precios USD y mantiene el detalle", async () => {
    getExchangeRate.mockRejectedValue(new Error("sin permiso"));
    const element = await mount([
      record("1"),
      record("2", { Precio_producto__c: 20, Unidad__c: "MXN_Kg" })
    ]);
    await glucosa(element);
    expect(table(element, "city").data.map((r) => r.price)).toEqual([
      780,
      null
    ]);
    expect(
      element.shadowRoot.querySelector(".stat-card-price .stat-value")
        .textContent
    ).toContain("780.00");
    expect(element.shadowRoot.textContent).toContain(
      "No se pudo consultar Banxico"
    );
  });
  it("no inventa promedio si todos los precios son inválidos", async () => {
    const element = await mount([record("1", { Precio_producto__c: 0 })]);
    await glucosa(element);
    expect(
      element.shadowRoot.querySelector(".stat-card-price .stat-value")
        .textContent
    ).toBe("—");
  });
  it("mapa y gráfica usan los mismos datos anuales; clic de estado filtra proveedores igual que la leyenda", async () => {
    window.Highcharts = {
      mapChart: jest.fn(),
      chart: jest.fn(() => ({ destroy: jest.fn() }))
    };
    global.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [{ properties: { name: "Jalisco", "hc-key": "mx-ja" } }]
        })
    });
    const element = await mount();
    await glucosa(element);
    await choose(element, '[name="periodFilterYear"]', "2026");
    const chart = window.Highcharts.chart.mock.calls.at(-1)[1];
    expect(chart.xAxis.categories).toEqual(["2026"]);
    expect(chart.series[0].data).toEqual([926.67]);
    const map = window.Highcharts.mapChart.mock.calls.at(-1)[1];
    const leader = map.series.find((series) =>
      series.name.startsWith("Ingredion México")
    );
    expect(leader.color).toBe("#6CB33E");
    expect(leader.data[0].custom.consumption).toBe(320);
    expect(leader.tooltip.pointFormatter.call(leader.data[0])).toContain(
      "Consumo anual"
    );
    leader.point.events.click({
      originalEvent: { preventDefault: jest.fn(), stopPropagation: jest.fn() }
    });
    await flush();
    expect(
      table(element, "city").data.every(
        (row) => row.provider === "Ingredion México"
      )
    ).toBe(true);
    expect(table(element, "city").data).toHaveLength(2);
    expect(element.shadowRoot.querySelector(".provider-clear")).not.toBeNull();
  });
  it("muestra error de Apex sin conservar datos parciales", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    getPrices.mockRejectedValue({ body: { message: "Sin acceso al objeto" } });
    const element = createElement("c-mapa-nacional", { is: MapaNacional });
    document.body.appendChild(element);
    await flush();
    expect(element.shadowRoot.textContent).toContain("Sin acceso al objeto");
    expect(table(element, "city").data).toEqual([]);
    log.mockRestore();
  });
  it("modal usa tabla nativa única, permite ampliar/restablecer columnas y cerrar con Escape", async () => {
    const element = await mount();
    await glucosa(element);
    element.shadowRoot
      .querySelector(".summary-city-table")
      .dispatchEvent(new MouseEvent("dblclick"));
    await flush();
    const dialog = element.shadowRoot.querySelector('[role="dialog"]');
    expect(dialog.querySelectorAll(".table-expanded-content")).toHaveLength(1);
    expect(dialog.querySelector("lightning-datatable")).toBeNull();
    const resizer = dialog.querySelector('[role="separator"]');
    const before = Number(resizer.getAttribute("aria-valuenow"));
    resizer.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await flush();
    expect(
      Number(
        dialog.querySelector('[role="separator"]').getAttribute("aria-valuenow")
      )
    ).toBe(before + 20);
    dialog.querySelector(".reset-column-widths").click();
    await flush();
    expect(
      Number(
        dialog.querySelector('[role="separator"]').getAttribute("aria-valuenow")
      )
    ).toBe(before);
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flush();
    expect(element.shadowRoot.querySelector('[role="dialog"]')).toBeNull();
  });
  it("exporta una hoja anual con filtros, origen, vigencia, precio original y CreatedDate con hora", async () => {
    const sheet = {};
    const workbook = {};
    global.XLSX = {
      utils: {
        book_new: jest.fn(() => workbook),
        aoa_to_sheet: jest.fn(() => sheet),
        book_append_sheet: jest.fn()
      },
      writeFile: jest.fn()
    };
    const element = await mount();
    await glucosa(element);
    await choose(element, '[name="periodFilterYear"]', "2026");
    element.shadowRoot
      .querySelector(".summary-actions lightning-button")
      .click();
    await flush();
    expect(global.XLSX.utils.book_append_sheet).toHaveBeenCalledTimes(1);
    expect(global.XLSX.utils.book_append_sheet.mock.calls[0][2]).toBe(
      "Resumen por consumo anual"
    );
    const data = global.XLSX.utils.aoa_to_sheet.mock.calls[0][0];
    const headers = data.find((row) => row.includes("Fecha de registro"));
    expect(headers).toEqual(
      expect.arrayContaining([
        "Precio (USD/Ton)",
        "Precio registrado",
        "Origen del producto",
        "Contrato: De",
        "Contrato: A"
      ])
    );
    const createdIndex = headers.indexOf("Fecha de registro");
    const detail = data.slice(data.indexOf(headers) + 1);
    expect(detail).toHaveLength(3);
    expect(detail[0][createdIndex]).toMatchObject({
      t: "n",
      z: "dd/mm/yyyy hh:mm:ss"
    });
    expect(global.XLSX.writeFile).toHaveBeenCalledWith(
      workbook,
      expect.stringContaining("Glucosa 43")
    );
  });
  it("redimensionar el datatable adapta el ancho del contenedor y el modal respeta límites con ratón y teclado", async () => {
    const element = await mount();
    await glucosa(element);
    const city = table(element, "city");
    city.dispatchEvent(
      new CustomEvent("resize", {
        detail: {
          isUserTriggered: true,
          columnWidths: city.columns.map(() => 200)
        }
      })
    );
    await flush();
    expect(city.getAttribute("style")).toContain(
      `width: ${city.columns.length * 200 + 2}px`
    );
    element.shadowRoot
      .querySelector(".summary-city-table")
      .dispatchEvent(new MouseEvent("dblclick"));
    await flush();
    const resizer = element.shadowRoot.querySelector('[role="separator"]');
    resizer.dispatchEvent(
      new MouseEvent("pointerdown", { button: 0, clientX: 100 })
    );
    resizer.dispatchEvent(new MouseEvent("pointermove", { clientX: 150 }));
    resizer.dispatchEvent(new MouseEvent("pointerup", { clientX: 150 }));
    await flush();
    expect(
      Number(
        element.shadowRoot
          .querySelector('[role="separator"]')
          .getAttribute("aria-valuenow")
      )
    ).toBe(220);
    resizer.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    await flush();
    expect(
      Number(
        element.shadowRoot
          .querySelector('[role="separator"]')
          .getAttribute("aria-valuenow")
      )
    ).toBe(1000);
    resizer.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    await flush();
    expect(
      Number(
        element.shadowRoot
          .querySelector('[role="separator"]')
          .getAttribute("aria-valuenow")
      )
    ).toBe(90);
  });
  it("fallo de SheetJS libera el botón y no exporta contenido parcial", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const element = await mount();
    const button = element.shadowRoot.querySelector(
      ".summary-actions lightning-button"
    );
    button.click();
    await flush();
    expect(button.disabled).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "Error descargando Excel:",
      expect.any(Error)
    );
    log.mockRestore();
  });
});
