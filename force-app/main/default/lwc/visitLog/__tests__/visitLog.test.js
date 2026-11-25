/* eslint-disable no-await-in-loop -- Las interacciones simuladas son secuenciales, como las de un usuario. */
import { createElement } from "lwc";
import VisitLog from "c/visitLog";
import getVisitLogApex from "@salesforce/apex/ALMEX_AgendaDataController.getCurrentUserVisitLog";
import getActivityDetailApex from "@salesforce/apex/ALMEX_AgendaDataController.getActivityDetail";

jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.getCurrentUserVisitLog",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.getActivityDetail",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
// eslint-disable-next-line @lwc/lwc/no-async-operation -- Esperar las promesas de Apex y el render de LWC en Jest.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const activity = (id, date, status = "Programada", extra = {}) => ({
  activityId: id,
  title: id,
  activityDate: date,
  status,
  activityType: "Visita",
  countsTowardFrequency: true,
  executiveName: "Ejecutivo de prueba",
  ...extra
});
const response = () => ({
  today: "2026-11-19",
  year: 2026,
  branches: [
    {
      branchId: "a",
      branchName: "Sucursal Guadalajara",
      accountName: "Sabritas",
      state: "JA",
      city: "Guadalajara",
      annualFrequency: "4 al año",
      activities: [
        activity("pasada", "2026-10-01"),
        activity("completada", "2026-03-20", "Completada"),
        activity("proxima", "2026-11-25")
      ]
    },
    {
      branchId: "b",
      branchName: "Sucursal San Juán",
      accountName: "Bimbo",
      state: "SO",
      city: "Navojoa",
      annualFrequency: "4",
      activities: [activity("sonora", "2026-12-01")]
    },
    {
      branchId: "c",
      branchName: "Sucursal sin frecuencia",
      accountName: "Mondelez",
      state: "NL",
      city: "Monterrey",
      annualFrequency: null,
      activities: [
        activity("llamada", "2026-11-20", "Programada", {
          activityType: "Llamada",
          countsTowardFrequency: false
        })
      ]
    }
  ]
});
async function mount(data = response()) {
  getVisitLogApex.mockResolvedValue(data);
  const element = createElement("c-visit-log", { is: VisitLog });
  document.body.appendChild(element);
  element.refreshToken = 1;
  await flush();
  await flush();
  return element;
}
const table = (element) =>
  element.shadowRoot.querySelector("c-visit-log-datatable");
async function filter(element, name, value) {
  const select = element.shadowRoot.querySelector(`[data-filter="${name}"]`);
  select.value = value;
  select.dispatchEvent(new CustomEvent("change"));
  await flush();
}

describe("Bitácora: fecha real, filtros, sugerencias y paginación", () => {
  afterEach(() => {
    document.body.replaceChildren();
    jest.resetAllMocks();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("usa la fecha de Apex y excluye visitas anteriores de Próxima visita", async () => {
    const element = await mount();
    const options =
      element.shadowRoot.querySelector("lightning-combobox").options;
    expect(options.map((option) => option.value)).toEqual([
      "proxima",
      "sonora"
    ]);
    expect(
      table(element).data.find((item) => item.id === "a").statusLabel
    ).toBe("Atrasado");
    expect(
      element.shadowRoot.querySelectorAll(".visit-log-kpi-copy strong")[0]
        .textContent
    ).toBe("3");
    expect(
      element.shadowRoot.querySelectorAll(".visit-log-kpi-copy strong")[1]
        .textContent
    ).toBe("1");
    expect(
      element.shadowRoot.querySelectorAll(".visit-log-kpi-copy strong")[2]
        .textContent
    ).toBe("13%");
  });

  it("no conserva 2026 al cambiar de año", async () => {
    const element = await mount({
      today: "2027-02-01",
      year: 2027,
      branches: [
        {
          ...response().branches[0],
          activities: [
            activity("anterior", "2027-01-15"),
            activity("futura", "2027-03-01")
          ]
        }
      ]
    });
    expect(
      element.shadowRoot
        .querySelector("lightning-combobox")
        .options.map((option) => option.value)
    ).toEqual(["futura"]);
    expect(table(element).data[0].nextVisitLabel).toContain("2027");
  });

  it("usa la fecha local actual únicamente como respaldo si Apex no envía referencia", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2027, 1, 1, 12));
    getVisitLogApex.mockResolvedValue({
      branches: [
        {
          ...response().branches[0],
          activities: [
            activity("vieja", "2027-01-01"),
            activity("nueva", "2027-02-02")
          ]
        }
      ]
    });
    const element = createElement("c-visit-log", { is: VisitLog });
    document.body.appendChild(element);
    element.refreshToken = 1;
    await jest.runAllTimersAsync();
    expect(
      element.shadowRoot
        .querySelector("lightning-combobox")
        .options.map((option) => option.value)
    ).toEqual(["nueva"]);
  });

  it.each([
    ["state", "Jalisco", ["a"]],
    ["progress", "with", ["a"]],
    ["progress", "none", ["c", "b"]],
    ["status", "Sin frecuencia", ["c"]]
  ])("filtra por %s = %s", async (name, value, ids) => {
    const element = await mount();
    await filter(element, name, value);
    expect(
      table(element)
        .data.map((item) => item.id)
        .sort()
    ).toEqual([...ids].sort());
  });

  it("busca cliente, sucursal y ubicación sin distinguir acentos", async () => {
    const element = await mount();
    const input = element.shadowRoot.querySelector('input[type="search"]');
    for (const [search, expected] of [
      ["sabritas", "a"],
      ["san juan", "b"],
      ["monterrey", "c"]
    ]) {
      input.value = search;
      input.dispatchEvent(new CustomEvent("input"));
      await flush();
      expect(table(element).data[0].id).toBe(expected);
    }
    input.value = "sin coincidencias";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect(table(element)).toBeNull();
    expect(
      element.shadowRoot.querySelector(".visit-log-search-empty").textContent
    ).toContain("No se encontraron");
  });

  it("combina y retira varios tipos de actividad", async () => {
    const element = await mount();
    element.shadowRoot
      .querySelector(".visit-log-activity-filter-button")
      .click();
    await flush();
    for (const value of ["completed", "call"]) {
      const input = element.shadowRoot.querySelector(`input[value="${value}"]`);
      input.checked = true;
      input.dispatchEvent(new CustomEvent("change"));
      await flush();
    }
    expect(
      table(element)
        .data.map((item) => item.id)
        .sort()
    ).toEqual(["a", "c"]);
    expect(
      element.shadowRoot.querySelector(".visit-log-activity-filter-button")
        .textContent
    ).toContain("2 actividades");
    const input = element.shadowRoot.querySelector('input[value="call"]');
    input.checked = false;
    input.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect(table(element).data.map((item) => item.id)).toEqual(["a"]);
    element.shadowRoot
      .querySelector(".visit-log-activity-filter")
      .dispatchEvent(new FocusEvent("focusout"));
    await flush();
    expect(
      element.shadowRoot.querySelector(".visit-log-activity-filter-options")
    ).toBeNull();
  });

  it("limita sugerencias al estado seleccionado y permite volver al control anual", async () => {
    const element = await mount();
    element.shadowRoot.querySelector(".visit-log-suggestions-button").click();
    await flush();
    expect(table(element).data.map((item) => item.id)).toEqual(["a"]);
    expect(
      element.shadowRoot.querySelector(".visit-log-table-heading h3")
        .textContent
    ).toContain("Jalisco");
    element.shadowRoot
      .querySelector("lightning-combobox")
      .dispatchEvent(
        new CustomEvent("change", { detail: { value: "sonora" } })
      );
    await flush();
    expect(table(element).data.map((item) => item.id)).toEqual(["b"]);
    element.shadowRoot.querySelector(".visit-log-clear-suggestions").click();
    await flush();
    expect(table(element).data).toHaveLength(3);
    expect(
      element.shadowRoot.querySelector(".visit-log-table-heading h3")
        .textContent
    ).toBe("Control anual por cliente");
  });

  it.each([
    "frequencyLabel",
    "progressLabel",
    "lastVisitLabel",
    "nextVisitLabel",
    "statusLabel",
    "month10Events",
    "branchClientLabel"
  ])("ordena %s en ambas direcciones", async (fieldName) => {
    const element = await mount();
    for (const sortDirection of ["asc", "desc"]) {
      table(element).dispatchEvent(
        new CustomEvent("sort", { detail: { fieldName, sortDirection } })
      );
      await flush();
      expect(table(element).data).toHaveLength(3);
      expect(table(element).sortedBy).toBe(fieldName);
    }
  });

  it("pagina de 50 en 50 y restablece la página al filtrar", async () => {
    const data = response();
    data.branches = Array.from({ length: 51 }, (_, index) => ({
      ...data.branches[0],
      branchId: `s${index}`,
      branchName: `Sucursal ${String(index).padStart(2, "0")}`
    }));
    const element = await mount(data);
    expect(table(element).data).toHaveLength(50);
    const buttons = element.shadowRoot.querySelectorAll(
      ".visit-log-pagination-button"
    );
    expect(buttons[0].disabled).toBe(true);
    buttons[1].click();
    await flush();
    expect(table(element).data).toHaveLength(1);
    expect(
      element.shadowRoot.querySelector(".visit-log-pagination-summary")
        .textContent
    ).toContain("51-51 de 51");
    buttons[0].click();
    await flush();
    expect(table(element).data).toHaveLength(50);
    const input = element.shadowRoot.querySelector('input[type="search"]');
    input.value = "Sucursal 50";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect(table(element).data).toHaveLength(1);
    expect(
      element.shadowRoot.querySelector(".visit-log-pagination-page").textContent
    ).toContain("Página 1 de 1");
  });

  it("abre el detalle de una actividad y permite cerrarlo", async () => {
    const element = await mount();
    getActivityDetailApex.mockResolvedValue({
      Id: "actividad",
      Titulo__c: "Visita",
      Estatus__c: "Completada"
    });
    table(element).dispatchEvent(
      new CustomEvent("activityselect", { detail: {} })
    );
    await flush();
    expect(
      element.shadowRoot.querySelector("c-visit-log-activity-modal")
    ).toBeNull();
    table(element).dispatchEvent(
      new CustomEvent("activityselect", { detail: { activityId: "actividad" } })
    );
    await flush();
    const modal = element.shadowRoot.querySelector(
      "c-visit-log-activity-modal"
    );
    expect(modal.activityId).toBe("actividad");
    modal.dispatchEvent(new CustomEvent("close"));
    await flush();
    expect(
      element.shadowRoot.querySelector("c-visit-log-activity-modal")
    ).toBeNull();
  });

  it("muestra el error de Apex y permite reintentar", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    getVisitLogApex.mockRejectedValueOnce({
      body: { message: "Sin permiso de lectura" }
    });
    const element = createElement("c-visit-log", { is: VisitLog });
    document.body.appendChild(element);
    element.refreshToken = 1;
    await flush();
    await flush();
    expect(
      element.shadowRoot.querySelector(".visit-log-state-error").textContent
    ).toContain("Sin permiso de lectura");
    getVisitLogApex.mockResolvedValue(response());
    element.shadowRoot.querySelector(".visit-log-state-error button").click();
    await flush();
    await flush();
    expect(table(element).data).toHaveLength(3);
  });

  it("maneja una bitácora sin sucursales ni visitas futuras", async () => {
    const element = await mount({
      today: "2027-01-01",
      year: 2027,
      branches: []
    });
    expect(
      element.shadowRoot.querySelector(".visit-log-state-empty")
    ).not.toBeNull();
    expect(
      element.shadowRoot.querySelector("lightning-combobox").options[0].value
    ).toBe("");
    expect(
      element.shadowRoot.querySelector(".visit-log-suggestions-button").disabled
    ).toBe(true);
  });

  it("acumula una sola recarga pendiente si cambia el token durante una consulta", async () => {
    let finish;
    getVisitLogApex.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    getVisitLogApex.mockResolvedValue({
      today: "2027-01-01",
      year: 2027,
      branches: []
    });
    const element = createElement("c-visit-log", { is: VisitLog });
    document.body.appendChild(element);
    element.refreshToken = 1;
    await flush();
    element.refreshToken = 2;
    element.refreshToken = 3;
    finish(response());
    await flush();
    await flush();
    await flush();
    expect(getVisitLogApex).toHaveBeenCalledTimes(2);
    expect(
      element.shadowRoot.querySelector(".visit-log-state-empty")
    ).not.toBeNull();
    element.refreshToken = 3;
    await flush();
    expect(getVisitLogApex).toHaveBeenCalledTimes(2);
  });
});
