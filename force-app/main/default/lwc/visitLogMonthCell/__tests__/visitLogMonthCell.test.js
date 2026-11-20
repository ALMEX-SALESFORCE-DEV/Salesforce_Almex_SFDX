import { createElement } from "lwc";
import VisitLogMonthCell from "c/visitLogMonthCell";

describe("Marcadores de actividad de la bitácora", () => {
  afterEach(() => document.body.replaceChildren());
  it("permite abrir actividades reales pero no las sugerencias", async () => {
    const element = createElement("c-visit-log-month-cell", {
      is: VisitLogMonthCell
    });
    element.events = [
      {
        key: "real",
        activityId: "actividad",
        day: "19",
        className: "real",
        title: "Visita",
        isSuggested: false
      },
      {
        key: "sugerida",
        day: "25",
        className: "suggestion",
        title: "Sugerencia",
        isSuggested: true
      },
      {
        key: "sin-id",
        day: "20",
        className: "sin-id",
        title: "Sin identificador",
        isSuggested: false
      }
    ];
    const listener = jest.fn();
    element.addEventListener("activityselect", listener);
    document.body.appendChild(element);
    await Promise.resolve();
    const buttons = element.shadowRoot.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(element.shadowRoot.querySelector(".suggestion").tagName).toBe(
      "SPAN"
    );
    buttons[0].click();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({
      activityId: "actividad"
    });
    expect(listener.mock.calls[0][0].bubbles).toBe(true);
    expect(listener.mock.calls[0][0].composed).toBe(true);
    buttons[1].click();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
