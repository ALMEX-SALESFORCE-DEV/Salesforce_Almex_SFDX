import {
  buildExecutivePalette,
  resolveMexicanState,
  normalizeAgendaSearchText,
  normalizeAgendaActivityType
} from "c/agendaUtils";

describe("Utilidades compartidas de Agendas", () => {
  it.each([
    ["JA", "Jalisco"],
    ["jal", "Jalisco"],
    ["NL", "Nuevo León"],
    ["CDMX", "Ciudad de México"],
    ["Jalisco", "Jalisco"],
    [null, ""],
    ["", ""]
  ])("normaliza el estado %s", (input, expected) =>
    expect(resolveMexicanState(input)).toBe(expected)
  );

  it.each([
    ["Reunión", "Reunión Teams"],
    [" reunion teams ", "Reunión Teams"],
    ["Visita extraordinaria", "Visitas urgentes"],
    ["Visitas extraordinarias", "Visitas urgentes"],
    ["Visita urgente", "Visitas urgentes"],
    ["Visitas urgentes", "Visitas urgentes"],
    ["Llamada", "Llamada"],
    [undefined, ""]
  ])("mantiene compatibles los tipos históricos %s", (input, expected) =>
    expect(normalizeAgendaActivityType(input)).toBe(expected)
  );

  it("normaliza acentos y espacios para las búsquedas", () => {
    expect(normalizeAgendaSearchText("  SAN JUÁN DEL RÍO  ")).toBe(
      "san juan del rio"
    );
    expect(normalizeAgendaSearchText(null)).toBe("");
  });

  it.each(["Ana Torres", "Érick", "", null, "9 usuario", "A"])(
    "asigna una paleta estable a %s",
    (name) => {
      const palette = buildExecutivePalette(name);
      expect(palette).toEqual(buildExecutivePalette(name));
      ["backgroundColor", "borderColor", "textColor", "dotColor"].forEach(
        (key) => expect(palette[key]).toMatch(/^#[a-f0-9]{6}$/)
      );
    }
  );
});
