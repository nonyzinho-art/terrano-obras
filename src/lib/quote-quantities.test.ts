import { describe, it, expect } from "vitest";
import { parseBudgetRows } from "./budget-import";
import { prepareQuoteItems } from "./quote-quantities";
const items = parseBudgetRows(
  [
    ["ITEM", "DESCRIÇÃO", "UNID.", "QUANT."],
    ["1.1", "Tubo", "m", 0],
    ["1.2", "Conexão", "un", null],
    ["1.3", "Serviço", "m", 2],
  ],
  { quotation: true },
).items;
describe("quantidades da cotação", () => {
  it("mantém zero e vazio destacados até uma decisão explícita", () => {
    const p = prepareQuoteItems(items, {}, false);
    expect(p.invalid.map((i) => i.code)).toEqual(["1.1", "1.2"]);
    expect(p.excluded).toEqual([]);
  });
  it("exclui somente zeros quando solicitado e aceita correções brasileiras", () => {
    const p = prepareQuoteItems(items, { "1.2": "1.250,50" }, true);
    expect(p.excluded.map((i) => i.code)).toEqual(["1.1"]);
    expect(p.invalid).toEqual([]);
    expect(p.included[0]?.quantity).toBe(1250.5);
  });
  it("bloqueia valores inválidos sem modificar a planilha original", () => {
    const p = prepareQuoteItems(items, { "1.1": "-2", "1.2": "abc" }, true);
    expect(p.invalid).toHaveLength(2);
    expect(items[0]?.quantity).toBe(0);
  });
});
