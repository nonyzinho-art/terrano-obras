import { describe, expect, it } from "vitest";
import { approvedQuantities, measurementProgress, plannedFraction } from "./measurement-progress";
import type { Budget, BudgetItem, BudgetMeasurement, BudgetMeasurementItem } from "./types";
const budgets: Budget[] = [
  {
    id: "b",
    name: "Drenagem",
    work_id: "w",
    status: "aprovado",
    revision: 1,
    updated_at: "2026-10-01",
    planned_start: "2026-10-01",
    planned_end: "2026-10-11",
  },
];
const items: BudgetItem[] = [
  {
    id: "i",
    budget_id: "b",
    work_id: "w",
    code: "1",
    group: "Rede",
    description: "Tubo",
    unit: "m",
    planned_quantity: 10,
    unit_price: 10,
    total_price: 100,
    executed_quantity: 0,
    status: "aprovado",
  },
];
const measurement = (
  id: string,
  status: BudgetMeasurement["status"],
  date: string,
): BudgetMeasurement => ({
  id,
  budget_id: "b",
  work_id: "w",
  status,
  period_start: date,
  period_end: date,
  notes: "",
  revision: 1,
  created_by: "u",
  created_at: date,
  approved_by: null,
  approved_at: null,
});
const line = (id: string, quantity: number): BudgetMeasurementItem => ({
  id,
  measurement_id: id,
  budget_id: "b",
  work_id: "w",
  budget_item_id: "i",
  quantity,
  unit_price: 10,
  planned_quantity: 10,
});
describe("execução baseada em medições", () => {
  it("sinaliza execução aprovada na revisão anterior sem copiar quantidades para a nova", () => {
    const revised = { ...budgets[0]!, id: "new", revision: 2 };
    const result = measurementProgress(
      [...budgets, revised],
      [...items, { ...items[0]!, id: "new-item", budget_id: "new" }],
      [measurement("old-production", "aprovada", "2026-10-03")],
      [line("old-production", 4)],
      "2026-10-06",
    );
    expect(result).toMatchObject({ unreconciled: true, comparable: false, executed: 0 });
    expect(result.summaries[0]?.unreconciled).toBe(true);
    const cancelled = measurementProgress(
      [...budgets, revised],
      items,
      [measurement("old-production", "cancelada", "2026-10-03")],
      [],
      "2026-10-06",
    );
    expect(cancelled.unreconciled).toBe(false);
  });
  it("não dilui o planejado com orçamento sem datas e informa cobertura parcial", () => {
    const result = measurementProgress(
      [
        ...budgets,
        { ...budgets[0]!, id: "other", name: "Água", planned_start: null, planned_end: null },
      ],
      [...items, { ...items[0]!, id: "other-item", budget_id: "other", unit_price: 30 }],
      [],
      [],
      "2026-10-06",
    );
    expect(result).toMatchObject({
      total: 400,
      planned: 50,
      plannedBase: 100,
      planCoverage: 25,
      comparable: false,
    });
  });
  it("distingue planejamento válido antes do início de planejamento ausente", () => {
    const valid = measurementProgress(budgets, items, [], [], "2026-09-01");
    expect(valid).toMatchObject({ planned: 0, hasPlan: true, comparable: true, planCoverage: 100 });
    for (const [start, end] of [
      [null, null],
      ["2026-10-20", "2026-10-01"],
      ["2026-02-30", "2026-03-10"],
    ] as const) {
      const missing = measurementProgress(
        [{ ...budgets[0]!, planned_start: start, planned_end: end }],
        items,
        [],
        [],
        "2026-10-06",
      );
      expect(missing).toMatchObject({ hasPlan: false, comparable: false, planCoverage: 0 });
    }
  });
  it("preserva zero explícito e identifica pendências sem produzir NaN", () => {
    const zero = measurementProgress(
      budgets,
      [{ ...items[0]!, unit_price: 0 }],
      [],
      [],
      "2026-10-06",
    );
    expect(zero).toMatchObject({ total: 0, pendingCount: 0, hasValue: false, comparable: false });
    const partial = measurementProgress(
      budgets,
      [...items, { ...items[0]!, id: "pending", unit_price_pending: true }],
      [],
      [],
      "2026-10-06",
    );
    expect(partial).toMatchObject({
      total: 100,
      pendingCount: 1,
      hasValue: true,
      comparable: false,
    });
    const invalid = measurementProgress(
      budgets,
      [{ ...items[0]!, unit_price: NaN }],
      [],
      [],
      "2026-10-06",
    );
    expect(invalid).toMatchObject({ total: 0, actual: 0, pendingCount: 1 });
  });
  it("recalcula com a revisão aprovada sem somar a versão substituída", () => {
    const original = measurement("old", "substituida", "2026-10-03");
    const corrected = { ...measurement("new", "aprovada", "2026-10-03"), replaces_id: "old" };
    const quantities = approvedQuantities(
      [original, corrected],
      [line("old", 6), line("new", 3)],
      "2026-10-15",
    );
    expect(quantities.get("i")).toBe(3);
  });
  it("só soma aprovações até a data consultada, excluindo rascunhos e canceladas", () => {
    const headers = [
      measurement("a", "aprovada", "2026-10-03"),
      measurement("b", "rascunho", "2026-10-04"),
      measurement("c", "cancelada", "2026-10-04"),
      measurement("d", "aprovada", "2026-10-10"),
    ];
    const lines = [line("a", 2), line("b", 9), line("c", 8), line("d", 3)];
    expect(approvedQuantities(headers, lines, "2026-10-06").get("i")).toBe(2);
    const progress = measurementProgress(budgets, items, headers, lines, "2026-10-06");
    expect(progress).toMatchObject({ total: 100, executed: 20, actual: 20, planned: 50 });
    expect(measurementProgress(budgets, items, headers, lines, "2026-10-11").actual).toBe(50);
  });
  it("pondera valores e não soma unidades incompatíveis", () => {
    const second = {
      ...items[0]!,
      id: "j",
      unit: "un",
      planned_quantity: 1,
      unit_price: 900,
      total_price: 900,
    };
    const result = measurementProgress(
      budgets,
      [...items, second],
      [measurement("a", "aprovada", "2026-10-03")],
      [line("a", 10)],
      "2026-10-06",
    );
    expect(result.actual).toBe(10);
    expect(result.executed).toBe(100);
  });
  it("considera apenas a revisão aprovada mais recente na base da obra", () => {
    const revised = { ...budgets[0]!, id: "new", revision: 2, updated_at: "2026-10-10" };
    const result = measurementProgress(
      [...budgets, revised],
      [...items, { ...items[0]!, id: "new-item", budget_id: "new", planned_quantity: 20 }],
      [],
      [],
      "2026-10-11",
    );
    expect(result.total).toBe(200);
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]?.budget.id).toBe("new");
  });
  it("não inventa planejamento ou produção e ignora pendências", () => {
    const result = measurementProgress(
      [{ ...budgets[0]!, planned_start: null, planned_end: null }],
      [...items, { ...items[0]!, id: "pending", unit_price_pending: true, unit_price: 999 }],
      [],
      [],
      "2026-10-11",
    );
    expect(result).toMatchObject({ total: 100, executed: 0, actual: 0, planned: 0 });
    expect(measurementProgress([], [], [], [], "2026-10-11")).toMatchObject({
      total: 0,
      actual: 0,
      planned: 0,
    });
    expect(plannedFraction("2026-10-01", "2026-10-01", "2026-10-01")).toBe(1);
    expect(plannedFraction("2026-10-01", "2026-10-11", "2026-09-01")).toBe(0);
  });
});
