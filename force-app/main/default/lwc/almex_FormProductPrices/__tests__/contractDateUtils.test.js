import {
  formatContractDateEntry,
  parseContractDate
} from "../contractDateUtils";

describe("Captura de vigencia dd/mm/aaaa", () => {
  test.each([
    ["0", "0"],
    ["01", "01/"],
    ["0101", "01/01/"],
    ["01012026", "01/01/2026"],
    ["01/01/2026", "01/01/2026"],
    ["01012026123", "01/01/2026"],
    ["", ""]
  ])("%s agrega diagonales automáticamente", (input, expected) =>
    expect(formatContractDateEntry(input, false)).toBe(expected)
  );
  it("permite borrar separadores sin reinsertarlos inmediatamente", () => {
    expect(formatContractDateEntry("01", true)).toBe("01");
    expect(formatContractDateEntry("01/01", true)).toBe("01/01");
    expect(formatContractDateEntry("01/", true)).toBe("01/");
  });
  it("no interpreta texto libre como una fecha válida", () => {
    expect(formatContractDateEntry("ene-26", false)).toBe("ene-26");
    expect(parseContractDate("ene-26")).toBeUndefined();
  });
  test.each(["01/01/2026", "29/02/2024", "31/12/2100", "01/01/1900"])(
    "acepta fecha válida %s",
    (input) => expect(parseContractDate(input)).toBeInstanceOf(Date)
  );
  test.each([
    "29/02/2026",
    "31/04/2026",
    "00/01/2026",
    "01/13/2026",
    "01/01/1899",
    "01/01/2101",
    "2026-01-01",
    "1/1/2026",
    ""
  ])("rechaza fecha inválida %s", (input) =>
    expect(parseContractDate(input)).toBeUndefined()
  );
});
