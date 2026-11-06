import type { Budget, BudgetItem, BudgetMeasurement, BudgetMeasurementItem } from "./types";
import { budgetFamilyKey } from "./budget-revisions";

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
  if (!hasValidPlan(start, end) || !start || !end || date < start) return 0;
  if (date >= end) return 1;
  return Math.max(
    0,
    Math.min(1, (Date.parse(date) - Date.parse(start)) / (Date.parse(end) - Date.parse(start))),
  );
}
export function hasValidPlan(start?: string | null, end?: string | null) {
  const valid = (value?: string | null) =>
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  return valid(start) && valid(end) && start! <= end!;
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
    const key = budgetFamilyKey(budget);
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
    const earlier = new Set(
      budgets
        .filter((b) => b.id !== budget.id && budgetFamilyKey(b) === budgetFamilyKey(budget))
        .map((b) => b.id),
    );
    const unreconciled = measurements.some(
      (m) => earlier.has(m.budget_id) && m.status === "aprovada",
    );
    const allRows = items.filter((i) => i.budget_id === budget.id);
    const rows = allRows.filter(
      (i) =>
        !i.quantity_pending &&
        !i.unit_price_pending &&
        Number.isFinite(i.planned_quantity) &&
        i.planned_quantity >= 0 &&
        Number.isFinite(i.unit_price) &&
        i.unit_price >= 0,
    );
    const pendingCount = allRows.length - rows.length;
    const hasPlan = hasValidPlan(budget.planned_start, budget.planned_end);
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
      hasPlan,
      pendingCount,
      itemCount: allRows.length,
      hasValue: cents > 0,
      unreconciled,
      comparable: hasPlan && cents > 0 && pendingCount === 0 && !unreconciled,
    };
  });
  const total = summaries.reduce((sum, s) => sum + s.total, 0);
  const executed = summaries.reduce((sum, s) => sum + s.executed, 0);
  const plannedValue = summaries.reduce((sum, s) => sum + s.plannedValue, 0);
  const plannedBase = summaries.reduce((sum, s) => sum + (s.hasPlan ? s.total : 0), 0);
  const pendingCount = summaries.reduce((sum, s) => sum + s.pendingCount, 0);
  return {
    summaries,
    total,
    executed,
    actual: total ? (executed / total) * 100 : 0,
    planned: plannedBase ? (plannedValue / plannedBase) * 100 : 0,
    plannedBase,
    planCoverage: total ? (plannedBase / total) * 100 : 0,
    pendingCount,
    hasValue: total > 0,
    hasPlan: plannedBase > 0,
    comparable: total > 0 && summaries.every((s) => s.comparable),
    unreconciled: summaries.some((s) => s.unreconciled),
  };
}
