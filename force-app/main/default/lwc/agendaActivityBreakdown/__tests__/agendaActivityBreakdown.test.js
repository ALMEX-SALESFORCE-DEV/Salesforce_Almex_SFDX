import { createElement } from "lwc";
import AgendaActivityBreakdown from "c/agendaActivityBreakdown";
import {
  getManagementActivities,
  searchManagementClients,
  searchManagementBranches,
  searchManagementProspects
} from "c/agendaServices";

jest.mock("c/agendaServices", () => ({
  getManagementActivities: jest.fn(),
  searchManagementClients: jest.fn(),
  searchManagementBranches: jest.fn(),
  searchManagementProspects: jest.fn()
}));

const page = () => ({
  records: [],
  totalRecords: 0,
  hasNext: false,
  executiveOptions: ["Ana", "Juan"]
});
const flush = async () => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
};
const root = (element) => element.shadowRoot;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const record = (id, title) => ({
  Id: id,
  Name: id,
  Titulo__c: title,
  Fecha__c: "2026-10-28",
  Estatus__c: "Programada"
});
async function mount() {
  const element = createElement("c-agenda-activity-breakdown", {
    is: AgendaActivityBreakdown
  });
  element.monthDate = "2026-10-01";
  document.body.appendChild(element);
  element.refreshToken = 1;
  await flush();
  return element;
}
async function apply() {
  jest.advanceTimersByTime(250);
  await flush();
}
function check(element, field, value, checked = true) {
  const input = root(element).querySelector(
    `[name="${field}"][value="${value}"]`
  );
  input.checked = checked;
  input.dispatchEvent(new Event("change"));
}
function date(element, name, value) {
  const input = root(element).querySelector(`[name="${name}"]`);
  input.value = value;
  input.dispatchEvent(new Event("change"));
}
async function type(element, value) {
  check(element, "managementPartyType", value);
  await flush();
}
async function selectParty(element, name) {
  const input = root(element).querySelector('input[type="search"]');
  input.value = name;
  input.dispatchEvent(new Event("input"));
  jest.advanceTimersByTime(300);
  await flush();
  root(element).querySelector(".management-party-result").click();
  await flush();
  await apply();
}
function remove(element, field, value) {
  root(element)
    .querySelector(
      `.filter-chip-remove[data-field="${field}"]${value === undefined ? "" : `[data-value="${value}"]`}`
    )
    .click();
}

describe("Consulta de actividades: filtros múltiples asíncronos", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    getManagementActivities.mockResolvedValue(page());
    searchManagementClients.mockResolvedValue([
      { Id: "001cliente", Name: "Cliente X" }
    ]);
    searchManagementBranches.mockResolvedValue([
      {
        Id: "a01sucursal",
        Name: "Sucursal A",
        Cuenta__r: { Name: "Cliente X" },
        Estado__c: "JA"
      }
    ]);
    searchManagementProspects.mockResolvedValue([
      { Id: "00Qprospecto", Name: "Prospecto Y" }
    ]);
  });
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllTimers();
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  it("consulta el mes del calendario sin botón Aplicar filtros", async () => {
    const element = await mount();
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dateFrom: "2026-10-01",
        dateTo: "2026-10-31",
        activityTypes: [],
        states: [],
        followUps: [],
        statuses: []
      })
    );
    expect(root(element).querySelector(".table-filter-apply")).toBeNull();
    expect(root(element).textContent).toContain("01/10/2026");
  });

  it("agrupa clics rápidos y envía todas las opciones en una sola consulta", async () => {
    const element = await mount();
    getManagementActivities.mockClear();
    check(element, "activityTypes", "Visita");
    check(element, "activityTypes", "Llamada");
    check(element, "states", "Jalisco");
    check(element, "states", "Sonora");
    check(element, "followUps", "true");
    check(element, "statuses", "Programada");
    check(element, "statuses", "Completada");
    check(element, "executive", "Ana");
    expect(getManagementActivities).not.toHaveBeenCalled();
    await apply();
    expect(getManagementActivities).toHaveBeenCalledTimes(1);
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityTypes: ["Visita", "Llamada"],
        states: ["Jalisco", "Sonora"],
        followUps: [true],
        statuses: ["Programada", "Completada"],
        executives: ["Ana"]
      })
    );
    expect(root(element).querySelectorAll(".filter-chip")).toHaveLength(8);
  });

  it("la x elimina solo ese valor y sincroniza el checkbox", async () => {
    const element = await mount();
    check(element, "activityTypes", "Visita");
    check(element, "activityTypes", "Llamada");
    check(element, "states", "Jalisco");
    await apply();
    remove(element, "activityTypes", "Visita");
    await apply();
    expect(
      root(element).querySelector('[name="activityTypes"][value="Visita"]')
        .checked
    ).toBe(false);
    expect(
      root(element).querySelector('[name="activityTypes"][value="Llamada"]')
        .checked
    ).toBe(true);
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityTypes: ["Llamada"],
        states: ["Jalisco"]
      })
    );
  });

  it("Todos limpia su categoría; desmarcar el último valor vuelve a Todos", async () => {
    const element = await mount();
    check(element, "activityTypes", "Visita");
    check(element, "statuses", "Programada");
    check(element, "statuses", "Completada");
    await apply();
    check(element, "statuses", "");
    check(element, "activityTypes", "Visita", false);
    await apply();
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({ activityTypes: [], statuses: [] })
    );
    expect(
      root(element).querySelector('[name="statuses"][value=""]').checked
    ).toBe(true);
    expect(root(element).querySelectorAll(".filter-chip")).toHaveLength(0);
  });

  it("admite ambos booleanos sin confundir false con ausencia de filtro", async () => {
    const element = await mount();
    check(element, "followUps", "false");
    await apply();
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({ followUps: [false] })
    );
    check(element, "followUps", "true");
    await apply();
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({ followUps: [false, true] })
    );
    expect(
      root(element).querySelectorAll(".filter-group--followUps .filter-chip")
    ).toHaveLength(2);
  });

  it("consulta por Cuenta automáticamente y conserva periodo y estado al quitar cliente", async () => {
    const element = await mount();
    await type(element, "client");
    expect(
      root(element).querySelector('input[type="search"]').placeholder
    ).toBe("Buscar cliente...");
    await selectParty(element, "Cliente");
    expect(searchManagementClients).toHaveBeenCalledWith("Cliente");
    date(element, "dateFrom", "2026-01-01");
    date(element, "dateTo", "2026-12-31");
    check(element, "states", "Jalisco");
    await apply();
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountId: "001cliente",
        branchId: "",
        prospect: "",
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
        states: ["Jalisco"]
      })
    );
    remove(element, "party");
    await apply();
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({ accountId: "", states: ["Jalisco"] })
    );
  });

  it("cambiar relación limpia el estado autocompletado, pero conserva estados manuales", async () => {
    const element = await mount();
    await selectParty(element, "Sucursal");
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({ branchId: "a01sucursal", states: ["Jalisco"] })
    );
    await type(element, "client");
    await selectParty(element, "Cliente");
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountId: "001cliente",
        branchId: "",
        states: []
      })
    );
    check(element, "states", "Sonora");
    await type(element, "prospect");
    await selectParty(element, "Prospecto");
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountId: "",
        prospect: "Prospecto Y",
        states: ["Sonora"]
      })
    );
  });

  it("no consulta texto no seleccionado y Limpiar restablece los criterios", async () => {
    const element = await mount();
    await type(element, "client");
    await selectParty(element, "Cliente");
    getManagementActivities.mockClear();
    const input = root(element).querySelector('input[type="search"]');
    input.value = "Otro cliente";
    input.dispatchEvent(new Event("input"));
    await apply();
    expect(getManagementActivities).not.toHaveBeenCalled();
    expect(root(element).querySelector('[role="alert"]').textContent).toContain(
      "sugerencias"
    );
    root(element).querySelector(".table-filter-clear").click();
    await apply();
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountId: "",
        branchId: "",
        prospect: "",
        activityTypes: [],
        states: [],
        followUps: [],
        statuses: []
      })
    );
    expect(root(element).querySelector('[value="branch"]').checked).toBe(true);
    expect(root(element).querySelector('[role="alert"]')).toBeNull();
  });

  it("valida fechas y quitar el periodo restaura el mes sin perder otras selecciones", async () => {
    const element = await mount();
    date(element, "dateFrom", "2026-10-20");
    date(element, "dateTo", "2026-10-10");
    await apply();
    expect(getManagementActivities).toHaveBeenCalledTimes(1);
    expect(root(element).querySelector('[role="alert"]').textContent).toContain(
      "posterior"
    );
    date(element, "dateTo", "2026-10-31");
    check(element, "statuses", "Programada");
    await apply();
    remove(element, "period");
    await apply();
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dateFrom: "2026-10-01",
        dateTo: "2026-10-31",
        statuses: ["Programada"]
      })
    );
    expect(root(element).querySelector('[name="dateTo"]').disabled).toBe(true);
  });

  it("descarta una respuesta vieja que llega después de la más reciente", async () => {
    const element = await mount();
    const older = deferred();
    const newer = deferred();
    getManagementActivities
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    check(element, "activityTypes", "Visita");
    await apply();
    check(element, "activityTypes", "Llamada");
    await apply();
    newer.resolve({
      ...page(),
      records: [record("nueva", "Resultado actual")],
      totalRecords: 1
    });
    await flush();
    older.resolve({
      ...page(),
      records: [record("vieja", "Resultado obsoleto")],
      totalRecords: 1
    });
    await flush();
    expect(
      root(element).querySelector("c-activity-breakdown-datatable").data[0]
        .title
    ).toBe("Resultado actual");
  });

  it("invalida respuestas desde el clic, incluso durante la espera de 250 ms", async () => {
    const element = await mount();
    const pending = deferred();
    getManagementActivities.mockReturnValueOnce(pending.promise);
    check(element, "states", "Jalisco");
    await apply();
    check(element, "states", "Sonora");
    pending.resolve({
      ...page(),
      records: [record("vieja", "Obsoleta")],
      totalRecords: 1
    });
    await flush();
    expect(
      root(element).querySelector("c-activity-breakdown-datatable")
    ).toBeNull();
    expect(root(element).querySelector("lightning-spinner")).not.toBeNull();
    await apply();
    expect(root(element).querySelector("lightning-spinner")).toBeNull();
  });

  it("un error antiguo no muestra mensajes ni reemplaza el resultado vigente", async () => {
    const element = await mount();
    const older = deferred();
    getManagementActivities.mockReturnValueOnce(older.promise);
    check(element, "statuses", "Programada");
    await apply();
    check(element, "statuses", "Completada");
    await apply();
    older.reject(new Error("Error de consulta anterior"));
    await flush();
    expect(root(element).querySelector('[role="alert"]')).toBeNull();
    expect(root(element).querySelector("lightning-spinner")).toBeNull();
  });

  it("paginar conserva criterios; cambiar un filtro reinicia cursor y página", async () => {
    getManagementActivities.mockResolvedValue({
      ...page(),
      records: [record("registro1", "Visita")],
      totalRecords: 51,
      hasNext: true,
      nextCursorDate: "2026-10-20",
      nextCursorCreatedDate: "2026-10-01T00:00:00Z",
      nextCursorId: "registro1"
    });
    const element = await mount();
    check(element, "activityTypes", "Visita");
    await apply();
    root(element).querySelectorAll(".table-pagination-button")[1].click();
    await flush();
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityTypes: ["Visita"],
        cursor: expect.objectContaining({ id: "registro1" })
      })
    );
    check(element, "activityTypes", "Llamada");
    await apply();
    expect(getManagementActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityTypes: ["Visita", "Llamada"],
        cursor: null
      })
    );
    expect(
      root(element).querySelector(".table-pagination-page").textContent
    ).toContain("Página 1");
  });

  it("una respuesta vacía conserva las selecciones y etiquetas", async () => {
    const element = await mount();
    check(element, "executive", "Ana");
    check(element, "states", "Jalisco");
    await apply();
    expect(
      root(element).querySelector('[name="executive"][value="Ana"]').checked
    ).toBe(true);
    expect(root(element).querySelectorAll(".filter-chip")).toHaveLength(2);
    expect(root(element).querySelector(".activities-empty")).not.toBeNull();
  });

  it("muestra un error vigente sin datos antiguos y reintenta al cambiar un criterio", async () => {
    const element = await mount();
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      getManagementActivities.mockRejectedValueOnce(
        new Error("No fue posible consultar Apex")
      );
      check(element, "states", "Jalisco");
      await apply();
      expect(
        root(element).querySelector('[role="alert"]').textContent
      ).toContain("consultar Apex");
      expect(
        root(element).querySelector("c-activity-breakdown-datatable")
      ).toBeNull();
      expect(root(element).querySelector("lightning-spinner")).toBeNull();
      expect(root(element).querySelectorAll(".filter-chip")).toHaveLength(1);
      check(element, "states", "Sonora");
      await apply();
      expect(root(element).querySelector('[role="alert"]')).toBeNull();
      expect(getManagementActivities).toHaveBeenLastCalledWith(
        expect.objectContaining({ states: ["Jalisco", "Sonora"] })
      );
    } finally {
      log.mockRestore();
    }
  });

  it("desmontar descarta respuestas en vuelo, no solo consultas pendientes", async () => {
    const element = await mount();
    const pending = deferred();
    getManagementActivities.mockReturnValueOnce(pending.promise);
    check(element, "states", "Jalisco");
    await apply();
    document.body.removeChild(element);
    pending.resolve({
      ...page(),
      records: [record("vieja", "No debe renderizar")],
      totalRecords: 1
    });
    await flush();
    expect(
      root(element).querySelector("c-activity-breakdown-datatable")
    ).toBeNull();
  });

  it("desmontar el componente cancela la consulta programada", async () => {
    const element = await mount();
    check(element, "activityTypes", "Visita");
    document.body.removeChild(element);
    await apply();
    expect(getManagementActivities).toHaveBeenCalledTimes(1);
  });

  it('muestra Cliente guardado, no la Cuenta actual de la sucursal', async () => {
    getManagementActivities.mockResolvedValue({ ...page(), totalRecords: 1, records: [{
      ...record('visita', 'Visita'), Cliente__c: '001original', Cliente__r: { Name: 'Cliente guardado' },
      Sucursal__c: 'sucursal', Sucursal__r: { Name: 'Sucursal A', Cuenta__r: { Name: 'Cuenta distinta' } }
    }] });
    const element = await mount();
    const rows = root(element).querySelector('c-activity-breakdown-datatable').data;
    expect(rows[0].partyName).toBe('Cliente guardado');
    expect(rows[0].branchName).toBe('Sucursal A');
  });

  it('incluye el cliente sin sucursal como Cliente, no como Prospecto', async () => {
    getManagementActivities.mockResolvedValue({ ...page(), totalRecords: 1, records: [{
      ...record('comida', 'Comida'), Cliente__c: '001cliente', Cliente__r: { Name: 'Cliente sin sucursal' }
    }] });
    const element = await mount();
    const rows = root(element).querySelector('c-activity-breakdown-datatable').data;
    expect(rows[0].partyName).toBe('Cliente sin sucursal');
    expect(rows[0].partyType).toBe('Cliente');
    expect(rows[0].branchName).toBe('');
  });
});
