import VisitLogDatatable from "c/visitLogDatatable";

describe("Celdas del historial y cumplimiento de visitas", () => {
  it.each([
    ["visitMonth", ["events"]],
    ["visitNextDate", ["label", "textStyle"]],
    ["visitProgress", ["label", "progressStyle"]],
    ["visitStatus", ["label", "pillStyle"]]
  ])(
    "registra el tipo %s con su plantilla y sus atributos",
    (name, attributes) => {
      const definition = VisitLogDatatable.customTypes[name];
      expect(definition.template).toBeDefined();
      expect(definition.standardCellLayout).toBe(true);
      expect(definition.typeAttributes).toEqual(attributes);
    }
  );
});
