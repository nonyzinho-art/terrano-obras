import type { Budget, BudgetMeasurement, DailyReport, Photo } from "./types";
// Compatibility grouping; a durable identity/map is still required for reconciliation.
export const budgetFamilyKey = (b: Pick<Budget, "work_id" | "name">) =>
  `${b.work_id}:${b.name.trim().toLocaleLowerCase("pt-BR")}`;
export function importRevisionProtection(
  budgets: Budget[],
  measurements: BudgetMeasurement[],
  reports: DailyReport[],
  photos: Photo[],
  workId: string,
  name: string,
) {
  const key = budgetFamilyKey({ work_id: workId, name });
  const family = budgets.filter((b) => budgetFamilyKey(b) === key);
  const ids = new Set(family.map((b) => b.id));
  const measurementCount = measurements.filter((m) => ids.has(m.budget_id)).length;
  const reportCount = reports.filter((r) => !!r.budget_id && ids.has(r.budget_id)).length;
  const photoCount = photos.filter((p) => !!p.budget_id && ids.has(p.budget_id)).length;
  return {
    blocked: measurementCount + reportCount + photoCount > 0,
    measurementCount,
    reportCount,
    photoCount,
    family,
  };
}
