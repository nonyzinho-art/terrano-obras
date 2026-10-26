import type { Budget, BudgetItem, BudgetMeasurement, BudgetMeasurementItem } from "./types";

export function approvedQuantities(
  measurements: BudgetMeasurement[],
  lines: BudgetMeasurementItem[],
  date: string,
) {
  const ids = new Set(
    measurements.filter((m) => m.status === "aprovada" && m.period_end <= date).map((m) => m.id),
  );
  const quantities = new Map<string, number>();
  for (const line of lines)
    if (ids.has(line.measurement_id))
      quantities.set(
        line.budget_item_id,
        (quantities.get(line.budget_item_id) ?? 0) + Number(line.quantity),
      );
  return quantities;
}
export function plannedFraction(
  start: string | null | undefined,
  end: string | null | undefined,
  date: string,
) {
  if (!start || !end || date < start) return 0;
  if (date >= end) return 1;
  return Math.max(
    0,
    Math.min(1, (Date.parse(date) - Date.parse(start)) / (Date.parse(end) - Date.parse(start))),
  );
}
export function measurementProgress(
  budgets: Budget[],
  items: BudgetItem[],
  measurements: BudgetMeasurement[],
  lines: BudgetMeasurementItem[],
  date: string,
) {
  const quantities = approvedQuantities(measurements, lines, date);
  // Earlier imported revisions remain in history but must not duplicate the work's baseline.
  const latest = new Map<string, Budget>();
  for (const budget of budgets.filter((b) => b.status === "aprovado")) {
    const key = `${budget.work_id}:${budget.name.trim().toLocaleLowerCase("pt-BR")}`;
    const previous = latest.get(key);
    if (
      !previous ||
      (budget.revision ?? 1) > (previous.revision ?? 1) ||
      ((budget.revision ?? 1) === (previous.revision ?? 1) &&
        budget.updated_at > previous.updated_at)
    )
      latest.set(key, budget);
  }
  const approved = [...latest.values()];
  const summaries = approved.map((budget) => {
    const rows = items.filter(
      (i) => i.budget_id === budget.id && !i.quantity_pending && !i.unit_price_pending,
    );
    const cents = rows.reduce(
      (sum, i) => sum + Math.round(i.planned_quantity * i.unit_price * 100),
      0,
    );
    const executed = rows.reduce(
      (sum, i) =>
        sum +
        Math.round(Math.min(i.planned_quantity, quantities.get(i.id) ?? 0) * i.unit_price * 100),
      0,
    );
    const planned = plannedFraction(budget.planned_start, budget.planned_end, date);
    return {
      budget,
      total: cents / 100,
      executed: executed / 100,
      actual: cents ? (executed / cents) * 100 : 0,
      planned: planned * 100,
      plannedValue: (cents / 100) * planned,
    };
  });
  const total = summaries.reduce((sum, s) => sum + s.total, 0);
  const executed = summaries.reduce((sum, s) => sum + s.executed, 0);
  const plannedValue = summaries.reduce((sum, s) => sum + s.plannedValue, 0);
  return {
    summaries,
    total,
    executed,
    actual: total ? (executed / total) * 100 : 0,
    planned: total ? (plannedValue / total) * 100 : 0,
  };
}
