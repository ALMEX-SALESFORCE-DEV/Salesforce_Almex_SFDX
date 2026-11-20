import { createElement } from "lwc";
import Agendas from "c/agendas";
import canViewActivityBreakdown from "@salesforce/apex/ALMEX_AgendaDataController.canViewActivityBreakdown";

jest.mock(
  "@salesforce/apex/ALMEX_AgendaDataController.canViewActivityBreakdown",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock("c/agendaCalendar", () => {
  const { LightningElement } = require("lwc");
  return {
    __esModule: true,
    default: class AgendaCalendarStub extends LightningElement {}
  };
});
jest.mock("c/agendaActivityBreakdown", () => {
  const { LightningElement, registerDecorators } = require("lwc");
  class ActivityBreakdownStub extends LightningElement {}
  registerDecorators(ActivityBreakdownStub, {
    publicProps: { monthDate: { config: 0 }, refreshToken: { config: 0 } }
  });
  return { __esModule: true, default: ActivityBreakdownStub };
});
jest.mock("c/visitLog", () => {
  const { LightningElement, registerDecorators } = require("lwc");
  class VisitLogStub extends LightningElement {}
  registerDecorators(VisitLogStub, {
    publicProps: { refreshToken: { config: 0 } }
  });
  return { __esModule: true, default: VisitLogStub };
});

// eslint-disable-next-line @lwc/lwc/no-async-operation -- Esperar las promesas de Apex y el render de LWC en Jest.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const tab = (element, name) =>
  element.shadowRoot.querySelector(`[data-tab="${name}"]`);
async function mount(access = true) {
  canViewActivityBreakdown.mockResolvedValue(access);
  const element = createElement("c-agendas", { is: Agendas });
  document.body.appendChild(element);
  await flush();
  return element;
}
async function select(element, name) {
  tab(element, name).click();
  await flush();
}

describe("Navegación y acceso del módulo Agendas", () => {
  afterEach(() => {
    document.body.replaceChildren();
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  it("abre el calendario sin cargar las otras dos vistas hasta necesitarlas", async () => {
    const element = await mount();
    expect(canViewActivityBreakdown).toHaveBeenCalledTimes(1);
    expect(tab(element, "calendar").getAttribute("aria-selected")).toBe("true");
    expect(tab(element, "activities").getAttribute("aria-selected")).toBe(
      "false"
    );
    expect(tab(element, "suggestions").getAttribute("aria-selected")).toBe(
      "false"
    );
    expect(
      element.shadowRoot.querySelector("c-agenda-calendar")
    ).not.toBeNull();
    expect(
      element.shadowRoot.querySelector("c-agenda-activity-breakdown")
    ).toBeNull();
    expect(element.shadowRoot.querySelector("c-visit-log")).toBeNull();
  });

  it("oculta el desglose a los ejecutivos y rechaza un cambio de pestaña no autorizado", async () => {
    const element = await mount(false);
    expect(tab(element, "activities")).toBeNull();
    const calendar = tab(element, "calendar");
    calendar.dataset.tab = "activities";
    calendar.click();
    await flush();
    expect(calendar.getAttribute("aria-selected")).toBe("true");
    expect(
      element.shadowRoot.querySelector("c-agenda-activity-breakdown")
    ).toBeNull();
  });

  it("mantiene el acceso gerencial cerrado si Apex falla", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    canViewActivityBreakdown.mockRejectedValue(new Error("Sin conexión"));
    const element = createElement("c-agendas", { is: Agendas });
    document.body.appendChild(element);
    await flush();
    expect(tab(element, "activities")).toBeNull();
    expect(tab(element, "calendar").getAttribute("aria-selected")).toBe("true");
    expect(console.error).toHaveBeenCalled();
  });

  it("propaga el mes del calendario y refresca el desglose cada vez que se consulta", async () => {
    const element = await mount();
    element.shadowRoot
      .querySelector("c-agenda-calendar")
      .dispatchEvent(
        new CustomEvent("monthchange", { detail: { monthDate: "2027-03-01" } })
      );
    await select(element, "activities");
    const breakdown = element.shadowRoot.querySelector(
      "c-agenda-activity-breakdown"
    );
    expect(breakdown.monthDate).toBe("2027-03-01");
    expect(breakdown.refreshToken).toBe(1);
    expect(breakdown.closest("section").hidden).toBe(false);
    expect(tab(element, "activities").classList.contains("is-active")).toBe(
      true
    );
    expect(
      element.shadowRoot.querySelector("c-agenda-calendar").closest("section")
        .hidden
    ).toBe(true);
    await select(element, "calendar");
    expect(breakdown.closest("section").hidden).toBe(true);
    await select(element, "activities");
    expect(
      element.shadowRoot.querySelector("c-agenda-activity-breakdown")
    ).toBe(breakdown);
    expect(breakdown.refreshToken).toBe(2);
    element.shadowRoot
      .querySelector("c-agenda-calendar")
      .dispatchEvent(new CustomEvent("monthchange"));
    await flush();
    expect(breakdown.monthDate).toBe("");
  });

  it("conserva la bitácora montada y la refresca al volver a abrirla", async () => {
    const element = await mount();
    await select(element, "suggestions");
    const log = element.shadowRoot.querySelector("c-visit-log");
    expect(log.refreshToken).toBe(1);
    expect(log.closest("section").hidden).toBe(false);
    expect(tab(element, "suggestions").classList.contains("is-active")).toBe(
      true
    );
    await select(element, "calendar");
    expect(log.closest("section").hidden).toBe(true);
    await select(element, "suggestions");
    expect(element.shadowRoot.querySelector("c-visit-log")).toBe(log);
    expect(log.refreshToken).toBe(2);
  });

  it.each([
    [true, "calendar", "ArrowRight", "activities"],
    [true, "calendar", "ArrowLeft", "suggestions"],
    [true, "suggestions", "ArrowRight", "calendar"],
    [true, "activities", "Home", "calendar"],
    [true, "calendar", "End", "suggestions"],
    [false, "calendar", "ArrowRight", "suggestions"],
    [false, "suggestions", "ArrowLeft", "calendar"],
    [false, "suggestions", "Home", "calendar"],
    [false, "calendar", "End", "suggestions"]
  ])(
    "permite navegación accesible (gerencial=%s, %s, %s → %s)",
    async (access, initial, key, expected) => {
      jest
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((callback) => {
          callback();
          return 1;
        });
      const element = await mount(access);
      await select(element, initial);
      const event = new KeyboardEvent("keydown", { key, cancelable: true });
      tab(element, initial).dispatchEvent(event);
      await flush();
      expect(event.defaultPrevented).toBe(true);
      expect(tab(element, expected).getAttribute("aria-selected")).toBe("true");
      expect(element.shadowRoot.activeElement).toBe(tab(element, expected));
    }
  );

  it("no intercepta teclas que no son de navegación", async () => {
    const element = await mount();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true
    });
    tab(element, "calendar").dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(false);
    expect(tab(element, "calendar").getAttribute("aria-selected")).toBe("true");
  });
});
