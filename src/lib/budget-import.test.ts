import { describe, expect, it } from "vitest";
import { parseAmount, parseBudgetRows } from "./budget-import";
const header = [
  "Código EAP",
  "Descrição",
  "Unidade",
  "QTD (calculada)",
  "Preço Unit. (R$)",
  "Total Real (R$)",
];
describe("importação de orçamento", () => {
  it("lê valores brasileiros e preserva vazio diferente de zero", () => {
    expect(parseAmount("R$ 1.234,56")).toBe(1234.56);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(0)).toBe(0);
    expect(() => parseAmount(-1)).toThrow();
    expect(() => parseAmount(Infinity)).toThrow();
  });
  it("separa grupos sem somar subtotais e identifica pendências", () => {
    const p = parseBudgetRows([
      header,
      ["1", "Rede de água", "-", "", "", 100],
      ["1.1", "Tubo", "m", 2, 3, 6],
      ["1.2", "Conexão", "un", "", 0, 0],
    ]);
    expect(p.errors).toEqual([]);
    expect(p.groups).toBe(1);
    expect(p.items).toHaveLength(2);
    expect(p.total).toBe(6);
    expect(p.pending).toBe(1);
    expect(p.items[0]?.group).toBe("Rede de água");
  });
  it("bloqueia códigos repetidos e campos inválidos", () => {
    const p = parseBudgetRows([
      header,
      ["1", "A", "m", 1, 2, 2],
      ["1", "B", "m", 1, 2, 2],
      ["2", "C", "m", "abc", 2, 2],
    ]);
    expect(p.errors).toHaveLength(2);
  });
  it("avisa quando o total não corresponde à quantidade e ao preço", () => {
    const p = parseBudgetRows([header, ["1", "A", "m", 2, 3, 99]]);
    expect(p.warnings).toHaveLength(1);
    expect(p.total).toBe(6);
  });
});
