import { afterEach, describe, expect, it } from "vitest";
import * as demo from "@/test/fixtures";
import { replaceData, getWork, getWorkProgressDisplay, getProgressCurve } from "./repository";
import type { Budget, BudgetItem, BudgetMeasurement } from "./types";
const work = {
  ...demo.works[0]!,
  id: "w",
  status: "em_andamento" as const,
  start_date: "2026-01-01",
  end_date: "2026-12-31",
};
const budget: Budget = {
  id: "b",
  work_id: "w",
  name: "Água",
  status: "aprovado",
  updated_at: "2026-01-01",
  planned_start: "2026-01-01",
  planned_end: "2026-12-31",
};
const item: BudgetItem = {
  id: "i",
  budget_id: "b",
  work_id: "w",
  code: "1",
  group: "Água",
  description: "Tubo",
  unit: "m",
  planned_quantity: 10,
  unit_price: 10,
  total_price: 100,
  executed_quantity: 0,
  status: "aprovado",
};
function load(bs: Budget[], rows: BudgetItem[]) {
  replaceData({
    works: [work],
    budgets: bs,
    budgetItems: rows,
    dailyReports: [],
    dailyReportItems: [],
    activities: [],
    services: [],
    photos: [],
    issues: [],
  });
  return getWork("w")!;
}
afterEach(() => replaceData(null));
describe("leitura dos indicadores da obra", () => {
  it("não apresenta execução zerada quando há medição aprovada em versão anterior", () => {
    replaceData({
      works: [work],
      budgets: [budget, { ...budget, id: "new", revision: 2 }],
      budgetItems: [item, { ...item, id: "new-item", budget_id: "new" }],
      measurements: [
        {
          id: "m",
          budget_id: "b",
          status: "aprovada",
          period_end: "2026-01-01",
        } as BudgetMeasurement,
      ],
      dailyReports: [],
      dailyReportItems: [],
      photos: [],
      issues: [],
      activities: [],
      services: [],
    });
    expect(getWorkProgressDisplay(getWork("w")!)).toMatchObject({
      actual: "Revisão a conferir",
      actualKnown: false,
      comparable: false,
    });
    expect(getProgressCurve("w").every((p) => p.executado === null)).toBe(true);
  });
  it("não exibe zero de avanço ou de planejamento sem orçamento aprovado", () => {
    const w = load([], []);
    expect(getWorkProgressDisplay(w)).toMatchObject({
      actual: "Sem base de valor",
      planned: "Não informado",
      comparable: false,
    });
    expect(getProgressCurve("w").every((p) => p.planejado === null && p.executado === null)).toBe(
      true,
    );
  });
  it("preserva zero aprovado calculável e sinaliza cobertura incompleta sem curva falsa", () => {
    const w = load([{ ...budget, planned_start: null }], [item]);
    expect(getWorkProgressDisplay(w)).toMatchObject({
      actual: "0%",
      planned: "Não informado",
      comparable: false,
    });
    expect(getProgressCurve("w").every((p) => p.planejado === null)).toBe(true);
  });
  it("libera comparação e curva planejada somente com base completa", () => {
    const w = load([budget], [item]);
    expect(getWorkProgressDisplay(w).comparable).toBe(true);
    expect(getProgressCurve("w").some((p) => p.planejado !== null)).toBe(true);
    const partial = load([budget], [item, { ...item, id: "pending", quantity_pending: true }]);
    expect(getWorkProgressDisplay(partial).coverage).toContain("1 itens pendentes");
    expect(getWorkProgressDisplay(partial).comparable).toBe(false);
  });
});
