import { describe, expect, it } from "vitest";
import {
  getWorks,
  getBudgetItems,
  getBudgetsByWork,
  getBudget,
  getItemsByBudget,
  getBudgetSummary,
} from "@/lib/repository";
import { filterBudgetItems } from "@/lib/budget-filter";

describe("Budget hierarchy", () => {
  it("assigns every existing item to exactly one budget belonging to its work, preserving totals", () => {
    for (const work of getWorks()) {
      const budgets = getBudgetsByWork(work.id);
      const original = getBudgetItems().filter((item) => item.work_id === work.id);
      const grouped = budgets.flatMap((budget) => getItemsByBudget(budget.id));
      expect(grouped.map((item) => item.id).sort()).toEqual(original.map((item) => item.id).sort());
      expect(new Set(grouped.map((item) => item.id)).size).toBe(original.length);
      expect(budgets.reduce((total, budget) => total + getBudgetSummary(budget.id).total, 0)).toBe(
        original.reduce((total, item) => total + item.total_price, 0),
      );
    }
  });
  it("keeps Meio-fio separate from Pavimentação and retains Paisagismo", () => {
    const budgets = getBudgetsByWork("brisas-do-sul");
    const curb = budgets.find((budget) => budget.name === "Meio-fio")!;
    const paving = budgets.find((budget) => budget.name === "Pavimentação")!;
    expect(getItemsByBudget(curb.id).map((item) => item.description)).toEqual(["Meio-fio"]);
    expect(getItemsByBudget(paving.id).map((item) => item.description)).toEqual(["Pavimentação"]);
    expect(budgets.some((budget) => budget.name === "Paisagismo")).toBe(true);
  });
  it("rejects a budget ID belonging to another work", () => {
    expect(getBudget("flor-da-terra", "brisas-do-sul-drenagem")).toBeUndefined();
    expect(getBudget("missing", "missing")).toBeUndefined();
  });
  it("combines accent-insensitive search with status and unit filters", () => {
    const items = getItemsByBudget("brisas-do-sul-drenagem");
    expect(filterBudgetItems(items, "  DRENAGEM ", "aprovado", "m")).toHaveLength(1);
    expect(filterBudgetItems(items, "04.02", "", "")[0]?.description).toBe("Boca de lobo simples");
    expect(filterBudgetItems(items, "", "em_cotacao", "")).toEqual([]);
    expect(
      filterBudgetItems(getItemsByBudget("brisas-do-sul-rede-de-agua"), "hidrometro", "", ""),
    ).toHaveLength(1);
  });
});
