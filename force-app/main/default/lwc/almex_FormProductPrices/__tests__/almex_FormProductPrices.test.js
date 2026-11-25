import { createElement } from "lwc";
import Form from "c/almex_FormProductPrices";
import savePrice from "@salesforce/apex/ALMEX_FormPricesController.savePrice";
import searchAccounts from "@salesforce/apex/ALMEX_FormPricesController.searchAccounts";
import getBranchesForAccount from "@salesforce/apex/ALMEX_FormPricesController.getBranchesForAccount";

jest.mock(
  "@salesforce/apex/ALMEX_FormPricesController.savePrice",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_FormPricesController.searchAccounts",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ALMEX_FormPricesController.getBranchesForAccount",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock("lightning/platformResourceLoader", () => ({
  loadScript: jest.fn(() => Promise.resolve()),
  loadStyle: jest.fn(() => Promise.resolve())
}));

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const mexican = [
  {
    cve_entidad: "14",
    nom_entidad: "Jalisco",
    cve_completa: "14008",
    nom_municipio: "Arandas",
    nom_cabecera: "Arandas"
  }
];
const american = {
  states: [
    {
      id: "TX",
      code: "TX",
      name: "Texas",
      cities: [{ id: "1", name: "Houston", officialName: "Houston city" }]
    }
  ]
};
const branch = {
  branchId: "a01000000000001AAA",
  name: "Sucursal Arandas",
  state: "Jalisco",
  city: "Arandas"
};
const control = (element, field) =>
  [
    ...element.shadowRoot.querySelectorAll(
      "lightning-combobox, lightning-input, input, select"
    )
  ].find((input) => input.name === field || input.dataset.field === field) ||
  null;
async function mount() {
  const element = createElement("c-almex-form-product-prices", { is: Form });
  document.body.appendChild(element);
  await flush();
  return element;
}
async function change(element, field, value, eventName = "change") {
  const input = control(element, field);
  expect(input).not.toBeNull();
  input.value = value;
  input.dispatchEvent(new CustomEvent(eventName, { detail: { value } }));
  await flush();
  return input;
}
async function selectClient(element, term = "ALMEX") {
  await change(element, "clientAccount", term);
  jest.advanceTimersByTime(250);
  await flush();
  element.shadowRoot
    .querySelector('.client-account-lookup [role="option"]')
    .click();
  await flush();
  element.shadowRoot.querySelector('.branch-lookup [role="option"]').click();
  await flush();
}
async function fill(element, operation = "Spot") {
  await change(element, "productName", "Glucosa 43");
  await change(element, "shipmentSize", "20 Ton");
  await change(element, "commercialOperationType", operation);
  await change(element, "unit", "DOLARES_TON");
  await change(element, "monthlyConsumption", "25");
  await change(element, "price", "780", "input");
  await change(element, "supplier", "N/A");
  await selectClient(element);
  if (operation === "Contrato") {
    await change(element, "contractStartDate", "01012026", "input");
    await change(element, "contractEndDate", "31122026", "input");
  }
}
async function selectLocation(element, field, value) {
  const input = element.shadowRoot.querySelector(`[data-location="${field}"]`);
  input.value = value;
  input.dispatchEvent(new Event("change"));
  await flush();
  const option = [
    ...input.closest(".lookup").querySelectorAll('[role="option"]')
  ].find((item) => item.dataset.value === value || item.dataset.city === value);
  expect(option).toBeDefined();
  option.click();
  await flush();
}
function submit(element) {
  // Los stubs oficiales no implementan validez nativa de los componentes base.
  element.shadowRoot
    .querySelectorAll("lightning-input, lightning-combobox")
    .forEach((input) => {
      input.checkValidity = jest.fn(() => true);
      input.reportValidity = jest.fn(() => true);
    });
  element.shadowRoot
    .querySelector("form")
    .dispatchEvent(new Event("submit", { cancelable: true }));
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  global.fetch = jest.fn((url) =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          url.includes("municipios_completo")
            ? mexican
            : url.includes("localidades")
              ? []
              : american
        )
    })
  );
  searchAccounts.mockResolvedValue([
    { Id: "001000000000001AAA", Name: "Cliente ALMEX" }
  ]);
  getBranchesForAccount.mockResolvedValue([branch]);
  savePrice.mockResolvedValue({ success: true, periodPersisted: true });
  delete window.flatpickr;
});
afterEach(() => {
  document.body.replaceChildren();
  jest.useRealTimers();
  delete window.flatpickr;
});

describe("Captura comercial", () => {
  it("solo captura año y consumo anual, con autocompletado del navegador desactivado", async () => {
    const element = await mount();
    expect(control(element, "periodMonth")).toBeNull();
    expect(
      element.shadowRoot.querySelector("form").getAttribute("autocomplete")
    ).toBe("off");
    expect(element.shadowRoot.textContent).toContain("Consumo anual");
  });
  test.each([
    "Almidón",
    "Azúcar",
    "Glucosa 43",
    "Glucosa 44",
    "Glucosa 63",
    "Glucosa alta en maltosa",
    "Fructosa 42",
    "Fructosa 55",
    "Fructosa cristalina 99",
    "Dextrosa monohidratada",
    "KRYSTAR líquido",
    "Dextrosa 95% líquida"
  ])(
    "catálogo dependiente y proveedores disponibles para %s",
    async (product) => {
      const element = await mount();
      await change(element, "productName", product);
      const suppliers = [...control(element, "supplier").options].map(
        (option) => option.value
      );
      expect(suppliers).toEqual(
        expect.arrayContaining([
          product === "Azúcar" ? "Zucarmex" : "ALMEX",
          "N/A",
          "__OTHER__"
        ])
      );
      expect(Boolean(control(element, "subproductType"))).toBe(
        ["Almidón", "Azúcar"].includes(product)
      );
      expect(Boolean(control(element, "shipmentSize"))).toBe(
        product !== "Azúcar"
      );
    }
  );
  it("almidón ofrece presentaciones vigentes y embarques exclusivos 3/10/25/N/A/Otro", async () => {
    const element = await mount();
    await change(element, "productName", "Almidón");
    expect(
      control(element, "subproductType").options.map((o) => o.value)
    ).toEqual([
      "25 kilos",
      "Granel",
      "Super saco (500 kilos)",
      "Super saco (1000 kilos)"
    ]);
    expect(
      control(element, "shipmentSize").options.map((o) => o.value)
    ).toEqual(["3 Ton", "10 Ton", "25 Ton", "N/A", "Otro"]);
  });
  it("azúcar líquida solicita embarque pero las presentaciones secas no", async () => {
    const element = await mount();
    await change(element, "productName", "Azúcar");
    await change(element, "subproductType", "Azúcar líquida");
    expect(control(element, "shipmentSize")).not.toBeNull();
    await change(element, "subproductType", "Refinada");
    expect(control(element, "shipmentSize")).toBeNull();
  });
  it("Otro acepta solo dígitos y lo envía con sufijo Ton", async () => {
    const element = await mount();
    await fill(element);
    await change(element, "shipmentSize", "Otro");
    await change(element, "otherShipmentSize", "15x", "input");
    expect(control(element, "otherShipmentSize").value).toBe("");
    await change(element, "otherShipmentSize", "15", "input");
    expect(control(element, "otherShipmentSize").value).toBe("15");
    submit(element);
    await flush();
    expect(savePrice.mock.calls[0][0].input.shipmentSize).toBe("15 Ton");
  });
  it("origen nacional/importado es mutuamente excluyente", async () => {
    const element = await mount();
    const imported = element.shadowRoot.querySelector(
      '[data-origin="imported"]'
    );
    imported.checked = true;
    imported.dispatchEvent(new Event("change"));
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-origin="national"]').checked
    ).toBe(false);
    const national = element.shadowRoot.querySelector(
      '[data-origin="national"]'
    );
    national.checked = true;
    national.dispatchEvent(new Event("change"));
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-origin="imported"]').checked
    ).toBe(false);
  });
  test.each(["Contrato", "Spot", "Propuesta"])(
    "guarda %s con datos anuales, sin periodo_mes ni campos auxiliares",
    async (operation) => {
      const element = await mount();
      await fill(element, operation);
      submit(element);
      await flush();
      expect(savePrice).toHaveBeenCalledTimes(1);
      const input = savePrice.mock.calls[0][0].input;
      expect(input).toMatchObject({
        commercialOperationType: operation,
        consumptionType: "A",
        monthlyConsumption: 25,
        price: 780,
        commercialName: "Sucursal Arandas",
        branchId: branch.branchId,
        clientAccountId: "001000000000001AAA"
      });
      expect(input).not.toHaveProperty("periodMonth");
      expect(input).not.toHaveProperty("otherShipmentSize");
      expect(input.contractStartDate).toBe(
        operation === "Contrato" ? "2026-01-01" : null
      );
      expect(input.contractEndDate).toBe(
        operation === "Contrato" ? "2026-12-31" : null
      );
      expect(control(element, "productName").value).toBe("");
    }
  );
  it("Contrato exige fechas válidas ordenadas y Spot elimina fechas anteriores", async () => {
    const element = await mount();
    await fill(element, "Contrato");
    await change(element, "contractStartDate", "31122026", "input");
    await change(element, "contractEndDate", "01012026", "input");
    submit(element);
    await flush();
    expect(savePrice).not.toHaveBeenCalled();
    await change(element, "commercialOperationType", "Spot");
    expect(control(element, "contractStartDate")).toBeNull();
    submit(element);
    await flush();
    expect(savePrice.mock.calls[0][0].input.contractStartDate).toBeNull();
  });
  it("fechas agregan diagonales sin exigir el calendario", async () => {
    const element = await mount();
    await change(element, "commercialOperationType", "Contrato");
    await change(element, "contractStartDate", "01012026", "input");
    expect(control(element, "contractStartDate").value).toBe("01/01/2026");
    await change(element, "contractEndDate", "29022026", "input");
    expect(control(element, "contractEndDate").checkValidity()).toBe(false);
  });
  it("cuentas se consultan con debounce y sucursales únicamente para la cuenta seleccionada", async () => {
    const element = await mount();
    await change(element, "clientAccount", "A");
    jest.advanceTimersByTime(250);
    await flush();
    expect(searchAccounts).not.toHaveBeenCalled();
    await selectClient(element, "AL");
    expect(searchAccounts).toHaveBeenCalledWith({ searchTerm: "AL" });
    expect(getBranchesForAccount).toHaveBeenCalledWith({
      accountId: "001000000000001AAA"
    });
    expect(control(element, "state").value).toBe("Jalisco");
    expect(control(element, "city").value).toBe("Arandas");
  });
  it("cambiar la búsqueda de cuenta borra la sucursal anterior y no permite guardarla por error", async () => {
    const element = await mount();
    await fill(element);
    await change(element, "clientAccount", "Otra");
    submit(element);
    await flush();
    expect(savePrice).not.toHaveBeenCalled();
    expect(control(element, "city").value).toBe("");
  });
  it("consulta fallida de cuentas muestra el error sin permitir selección ficticia", async () => {
    searchAccounts.mockRejectedValue({
      body: { message: "Sin acceso a cuentas" }
    });
    const element = await mount();
    await change(element, "clientAccount", "AL");
    jest.advanceTimersByTime(250);
    await flush();
    expect(element.shadowRoot.textContent).toContain("Sin acceso a cuentas");
    expect(
      element.shadowRoot.querySelector('.client-account-lookup [role="option"]')
    ).toBeNull();
  });
  it("una búsqueda tardía no reemplaza las sugerencias del término nuevo", async () => {
    let resolveOld;
    searchAccounts.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    );
    const element = await mount();
    await change(element, "clientAccount", "Anterior");
    jest.advanceTimersByTime(250);
    await flush();
    await change(element, "clientAccount", "Actual");
    jest.advanceTimersByTime(250);
    await flush();
    resolveOld([{ Id: "001OLD", Name: "Cuenta obsoleta" }]);
    await flush();
    expect(element.shadowRoot.textContent).not.toContain("Cuenta obsoleta");
    expect(element.shadowRoot.textContent).toContain("Cliente ALMEX");
  });
  it("permite prospecto y proveedor personalizado con ubicación de México y EEUU sin Account ficticia", async () => {
    const element = await mount();
    await fill(element);
    element.shadowRoot.querySelector('[data-mode="prospect"]').click();
    await flush();
    await change(element, "commercialName", "Prospecto válido");
    await selectLocation(element, "state", "Jalisco");
    await selectLocation(element, "municipality", "Arandas");
    await change(element, "supplier", "__OTHER__");
    await change(element, "otherSupplier", "Proveedor especial");
    await selectLocation(element, "factoryState", "Texas");
    await selectLocation(element, "factoryCity", "Houston");
    element.shadowRoot
      .querySelector('[data-origin="imported"]')
      .dispatchEvent(new Event("change"));
    await flush();
    submit(element);
    await flush();
    expect(savePrice.mock.calls[0][0].input).toMatchObject({
      commercialName: "Prospecto válido",
      supplier: "Proveedor especial",
      factoryState: "Texas",
      factoryCity: "Houston",
      municipality: "Arandas",
      clientAccountId: null,
      branchId: null,
      importedProduct: true
    });
  });
  it("no permite un embarque Otro vacío ni cero", async () => {
    const element = await mount();
    await fill(element);
    await change(element, "shipmentSize", "Otro");
    submit(element);
    await flush();
    expect(savePrice).not.toHaveBeenCalled();
    await change(element, "otherShipmentSize", "0", "input");
    submit(element);
    await flush();
    expect(savePrice).not.toHaveBeenCalled();
  });
  it("formatea miles en el precio y bloquea texto o separadores duplicados sin cambiar el valor anterior", async () => {
    const element = await mount();
    const input = await change(element, "price", "2966.50", "input");
    expect(input.value).toBe("2,966.50");
    await change(element, "price", "abc", "input");
    expect(input.value).toBe("2,966.50");
    const key = new KeyboardEvent("keydown", { key: ".", cancelable: true });
    input.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    const paste = new Event("paste", { cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: () => "MXN 20" }
    });
    input.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
  });
  it("no anuncia éxito si Apex devuelve success falso", async () => {
    savePrice.mockResolvedValue({ success: false, message: "No guardado" });
    const element = await mount();
    const toast = jest.fn();
    element.addEventListener("lightning__showtoast", toast);
    await fill(element);
    submit(element);
    await flush();
    expect(toast.mock.calls.at(-1)[0].detail).toMatchObject({
      variant: "error",
      message: "No guardado"
    });
    expect(control(element, "productName").value).toBe("Glucosa 43");
  });
  it("no duplica envíos y conserva formulario cuando Apex rechaza la inserción", async () => {
    let reject;
    savePrice.mockImplementation(
      () =>
        new Promise((resolve, rejectPromise) => {
          reject = rejectPromise;
        })
    );
    const element = await mount();
    const toast = jest.fn();
    element.addEventListener("lightning__showtoast", toast);
    await fill(element);
    submit(element);
    submit(element);
    await flush();
    expect(savePrice).toHaveBeenCalledTimes(1);
    reject({ body: { message: "Validación de negocio" } });
    await flush();
    expect(control(element, "productName").value).toBe("Glucosa 43");
    expect(toast.mock.calls.at(-1)[0].detail).toMatchObject({
      variant: "error",
      message: "Validación de negocio"
    });
  });
  it("catálogo EEUU convive con México en el selector de ubicaciones", async () => {
    const element = await mount();
    element.shadowRoot.querySelector('[data-mode="prospect"]').click();
    await flush();
    const state = element.shadowRoot.querySelector('[data-location="state"]');
    state.dispatchEvent(new Event("focus"));
    await flush();
    expect(element.shadowRoot.textContent).toContain("Texas");
    expect(element.shadowRoot.textContent).toContain("Jalisco");
  });
  it("si falla EEUU conserva México y advierte el catálogo faltante", async () => {
    global.fetch.mockImplementation((url) =>
      url.includes("municipios_completo")
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(mexican) })
        : url.includes("localidades")
          ? Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
          : Promise.reject(new Error("offline"))
    );
    const element = await mount();
    expect(element.shadowRoot.textContent).toContain("México sigue disponible");
  });
  it("el calendario conserva abierto el selector de mes y cierra al interactuar fuera del campo", async () => {
    const pickers = [];
    window.flatpickr = jest.fn((input, options) => {
      const calendarContainer = document.createElement("div");
      const months = document.createElement("select");
      calendarContainer.appendChild(months);
      options.appendTo.appendChild(calendarContainer);
      const picker = {
        calendarContainer,
        isOpen: false,
        setDate: jest.fn(),
        open: jest.fn(() => {
          picker.isOpen = true;
        }),
        close: jest.fn(() => {
          picker.isOpen = false;
        }),
        destroy: jest.fn(),
        formatDate: jest.fn(() => "2026-06-01"),
        options
      };
      pickers.push(picker);
      return picker;
    });
    const element = await mount();
    await change(element, "commercialOperationType", "Contrato");
    expect(pickers).toHaveLength(2);
    element.shadowRoot
      .querySelector('[data-date-field="contractStartDate"]')
      .click();
    await flush();
    expect(pickers[0].isOpen).toBe(true);
    pickers[0].calendarContainer
      .querySelector("select")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(pickers[0].isOpen).toBe(true);
    expect(pickers[0].calendarContainer.style.backgroundColor).toBe(
      "rgb(255, 255, 255)"
    );
    pickers[0].options.onChange(
      [new Date(2026, 5, 1)],
      "01/06/2026",
      pickers[0]
    );
    await flush();
    expect(control(element, "contractStartDate").value).toBe("01/06/2026");
    element.shadowRoot
      .querySelector(".hero")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(pickers[0].isOpen).toBe(false);
    await change(element, "commercialOperationType", "Spot");
    expect(pickers[0].destroy).toHaveBeenCalled();
  });
});
