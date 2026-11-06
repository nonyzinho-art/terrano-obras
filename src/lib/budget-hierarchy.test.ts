import { describe, it, expect } from "vitest";
import { parseBudgetRows } from "./budget-import";
import { budgetHierarchy, hiddenByGroup } from "./budget-hierarchy";
describe("hierarquia do orçamento aprovado", () => {
  it("preserva os grupos e calcula apenas as folhas", () => {
    const p = parseBudgetRows([
      ["ITEM", "DESCRIÇÃO", "UNID.", "QUANT.", "CUSTO UNITÁRIO (R$)", "CUSTO TOTAL (R$)"],
      [1, "RATEIO", null, null, null, 100],
      ["1.1", "ADMINISTRAÇÃO", null, null, null, 100],
      ["1.1.1", "Engenheiro", "H", 2, 50, 100],
      ["1.2", "CANTEIRO", null, null, null, 0],
      ["1.2.1", "Placa", "UN", 1, null, 0],
      ["TOTAL GERAL", null, null, null, null, 100],
      ["Instruções", null],
    ]);
    expect(p.errors).toEqual([]);
    expect(p.items).toHaveLength(2);
    expect(p.groups).toBe(3);
    expect(p.total).toBe(100);
    expect(p.pending).toBe(1);
    expect(p.items[0]?.hierarchy).toEqual([
      { code: "1", name: "RATEIO" },
      { code: "1.1", name: "ADMINISTRAÇÃO" },
    ]);
    const rows = budgetHierarchy(p.items);
    expect(rows.map((r) => (r.kind === "group" ? r.code : r.item.code))).toEqual([
      "1",
      "1.1",
      "1.1.1",
      "1.2",
      "1.2.1",
    ]);
    expect(hiddenByGroup("1.2.1", new Set(["1.2"]))).toBe(true);
    expect(hiddenByGroup("1.20.1", new Set(["1.2"]))).toBe(false);
  });
});
