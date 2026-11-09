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

/** Agrupa as revisões de cada orçamento: a mais recente primeiro. */
export function groupRevisions(budgets: Budget[]) {
  const families = new Map<string, Budget[]>();
  for (const b of budgets) {
    const key = budgetFamilyKey(b);
    families.set(key, [...(families.get(key) ?? []), b]);
  }
  return [...families.values()]
    .map((list) =>
      list.sort(
        (a, b) => (b.revision ?? 1) - (a.revision ?? 1) || b.updated_at.localeCompare(a.updated_at),
      ),
    )
    .sort((a, b) => a[0]!.name.localeCompare(b[0]!.name, "pt-BR"));
}
