import { measurementProgress } from "./measurement-progress";
import type { Budget, BudgetItem, BudgetMeasurement, BudgetMeasurementItem, Work } from "./types";
export type BudgetTab =
  "orcamento" | "analise" | "acompanhamento" | "medicoes" | "registros" | "documentos";
export interface BudgetAlert {
  id: string;
  workId: string;
  budgetId: string;
  measurementId?: string;
  tab: BudgetTab;
  title: string;
  detail: string;
  action: string;
  priority: number;
}
export function budgetAlerts(
  works: Work[],
  budgets: Budget[],
  items: BudgetItem[],
  measurements: BudgetMeasurement[],
  lines: BudgetMeasurementItem[],
  date: string,
): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  for (const work of works.filter((w) => w.status !== "concluida")) {
    const progress = measurementProgress(
      budgets.filter((b) => b.work_id === work.id),
      items,
      measurements,
      lines,
      date,
    );
    for (const summary of progress.summaries.filter(
      (s) => s.budget.execution_status !== "concluido",
    )) {
      const budget = summary.budget;
      const base = { workId: work.id, budgetId: budget.id };
      const detail = `${work.name} · ${budget.name}`;
      for (const measurement of measurements.filter(
        (m) => m.budget_id === budget.id && m.status === "rascunho",
      ))
        alerts.push({
          ...base,
          id: `measurement-${measurement.id}`,
          measurementId: measurement.id,
          tab: "medicoes",
          title: measurement.replaces_id
            ? "Revisão de medição em conferência"
            : "Medição aguardando conferência e aprovação",
          detail: `${detail} · ${measurement.period_start.split("-").reverse().join("/")} a ${measurement.period_end.split("-").reverse().join("/")}`,
          action: "Conferir medição",
          priority: 1,
        });
      const pending = items.filter(
        (i) => i.budget_id === budget.id && (i.quantity_pending || i.unit_price_pending),
      ).length;
      if (pending)
        alerts.push({
          ...base,
          id: `pending-${budget.id}`,
          tab: "orcamento",
          title: `${pending} itens do orçamento com quantidade ou preço pendente`,
          detail,
          action: "Conferir itens",
          priority: 2,
        });
      if (!budget.planned_start || !budget.planned_end)
        alerts.push({
          ...base,
          id: `plan-${budget.id}`,
          tab: "medicoes",
          title: "Orçamento aprovado sem datas planejadas",
          detail,
          action: "Definir planejamento",
          priority: 3,
        });
      else if (summary.total > 0 && summary.actual + 3 < summary.planned)
        alerts.push({
          ...base,
          id: `delay-${budget.id}`,
          tab: "acompanhamento",
          title: "Execução abaixo do planejado",
          detail: `${detail} · ${summary.actual.toFixed(1).replace(".", ",")}% aprovado / ${summary.planned.toFixed(1).replace(".", ",")}% previsto`,
          action: "Ver acompanhamento",
          priority: 2,
        });
    }
  }
  return alerts.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.detail.localeCompare(b.detail, "pt-BR") ||
      a.id.localeCompare(b.id),
  );
}
