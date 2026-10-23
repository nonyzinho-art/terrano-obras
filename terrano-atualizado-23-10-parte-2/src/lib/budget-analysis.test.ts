import { describe, expect, it } from "vitest";
import { analyzeBudget } from "./budget-analysis";
import type { BudgetItem } from "./types";

const item = (id: string, value: number, patch: Partial<BudgetItem> = {}): BudgetItem => ({
  id,
  code: id,
  budget_id: "budget",
  work_id: "work",
  group: "Grupo",
  description: id,
  unit: "un",
  planned_quantity: 1,
  unit_price: value,
  total_price: value,
  executed_quantity: 0,
  status: "aprovado",
  ...patch,
});

describe("análise financeira do orçamento", () => {
  it("soma cada item uma vez no grupo principal, sem duplicar subgrupos", () => {
    const analysis = analyzeBudget([
      item("1.1.1", 85, {
        hierarchy: [
          { code: "1", name: "Rateio" },
          { code: "1.1", name: "Administração" },
        ],
      }),
      item("1.2.1", 10, {
        hierarchy: [
          { code: "1", name: "Rateio" },
          { code: "1.2", name: "Canteiro" },
        ],
      }),
      item("2.1", 5, { hierarchy: [{ code: "2", name: "Drenagem" }] }),
    ]);
    expect(analysis.total).toBe(100);
    expect(analysis.groups.map((g) => [g.name, g.value, g.count])).toEqual([
      ["Rateio", 95, 2],
      ["Drenagem", 5, 1],
    ]);
    expect(analysis.abc.map((r) => [r.item.code, r.category, r.cumulative])).toEqual([
      ["1.1.1", "A", 85],
      ["1.2.1", "B", 95],
      ["2.1", "C", 100],
    ]);
  });
  it("exclui pendências da base de percentuais e preserva itens zerados nos grupos", () => {
    const analysis = analyzeBudget([
      item("1", 20),
      item("2", 999, { quantity_pending: true }),
      item("3", 0),
    ]);
    expect(analysis.total).toBe(20);
    expect(analysis.pendingCount).toBe(1);
    expect(analysis.zeroCount).toBe(1);
    expect(analysis.groups[0]).toMatchObject({ count: 3, pending: 1, value: 20, share: 100 });
    expect(analysis.abc).toHaveLength(1);
    expect(analysis.abc[0]).toMatchObject({ category: "A", share: 100, cumulative: 100 });
  });
  it("arredonda por item em centavos, ordena empates por código e não altera a entrada", () => {
    const items = [
      item("10", 0.2, { planned_quantity: 0.1 }),
      item("2", 0.2, { planned_quantity: 0.1 }),
      item("1", 0.2, { planned_quantity: 0.1 }),
    ];
    const analysis = analyzeBudget(items);
    expect(analysis.total).toBe(0.06);
    expect(analysis.abc.map((r) => r.item.code)).toEqual(["1", "2", "10"]);
    expect(items.map((i) => i.code)).toEqual(["10", "2", "1"]);
    expect(analysis.abc.at(-1)?.cumulative).toBe(100);
  });
  it("trata orçamento vazio ou sem valores sem produzir percentuais inválidos", () => {
    expect(analyzeBudget([])).toMatchObject({ total: 0, abc: [], groups: [] });
    const analysis = analyzeBudget([item("1", 0), item("2", 10, { unit_price_pending: true })]);
    expect(analysis.abc).toEqual([]);
    expect(analysis.groups[0]?.share).toBe(0);
    expect(analysis.classes.every((c) => c.share === 0)).toBe(true);
  });
});
