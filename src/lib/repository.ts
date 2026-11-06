// Data access layer. Holds the snapshot loaded from Supabase after login
// (see cloud-data.ts) and derives the indicators shown on each page.
import { useSyncExternalStore } from "react";
import { measurementProgress, approvedQuantities } from "./measurement-progress";
import { budgetAlerts } from "./budget-alerts";
import { importRevisionProtection } from "./budget-revisions";
import type {
  Activity,
  Budget,
  BudgetItem,
  BudgetMeasurement,
  BudgetMeasurementItem,
  DailyReport,
  DailyReportItem,
  Issue,
  Photo,
  Work,
  WorkService,
  WorkStatus,
} from "./types";

export type DataSnapshot = {
  activities: Activity[];
  budgets: Budget[];
  budgetItems: BudgetItem[];
  dailyReportItems: DailyReportItem[];
  dailyReports: DailyReport[];
  issues: Issue[];
  photos: Photo[];
  services: WorkService[];
  works: Work[];
  measurements?: BudgetMeasurement[];
  measurementItems?: BudgetMeasurementItem[];
};

const brazilToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

let activities: Activity[] = [];
let budgets: Budget[] = [];
let budgetItems: BudgetItem[] = [];
let dailyReportItems: DailyReportItem[] = [];
let dailyReports: DailyReport[] = [];
let issues: Issue[] = [];
let photos: Photo[] = [];
let services: WorkService[] = [];
let works: Work[] = [];
let measurements: BudgetMeasurement[] = [];
let measurementItems: BudgetMeasurementItem[] = [];
let TODAY: string = brazilToday();

/** Loads the account's data. `null` clears it (logout or account switch). */
export function replaceData(data: DataSnapshot | null) {
  ({
    activities,
    budgets,
    budgetItems,
    dailyReportItems,
    dailyReports,
    issues,
    photos,
    services,
    works,
  } = data ?? {
    activities: [],
    budgets: [],
    budgetItems: [],
    dailyReportItems: [],
    dailyReports: [],
    issues: [],
    photos: [],
    services: [],
    works: [],
  });
  measurements = data?.measurements ?? [];
  measurementItems = data?.measurementItems ?? [];
  TODAY = brazilToday();
  emit();
}

let version = 0;
export const getDataRevision = () => version;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
export function useDataVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => version,
  );
}

export const getMeasurementProgress = (workId: string, date = TODAY) =>
  measurementProgress(
    budgets.filter((b) => b.work_id === workId),
    budgetItems,
    measurements,
    measurementItems,
    date,
  );
export const getMeasurements = (budgetId: string) =>
  measurements.filter((m) => m.budget_id === budgetId);
export const getBudgetAlerts = (workId?: string) =>
  budgetAlerts(
    works.filter((w) => !workId || w.id === workId),
    budgets,
    budgetItems,
    measurements,
    measurementItems,
    TODAY,
  );
export const getMeasurementItems = (measurementId: string) =>
  measurementItems.filter((m) => m.measurement_id === measurementId);
export const getApprovedBudgetQuantities = (budgetId: string) =>
  approvedQuantities(
    measurements.filter((m) => m.budget_id === budgetId),
    measurementItems,
    TODAY,
  );
export function getWorkProgressDisplay(work: import("./types").Work) {
  const p = getMeasurementProgress(work.id);
  return {
    actual: p.unreconciled
      ? "Revisão a conferir"
      : p.hasValue
        ? `${work.actual_progress}%`
        : "Sem base de valor",
    planned: p.hasPlan ? `${work.planned_progress}%` : "Não informado",
    actualKnown: p.hasValue && !p.unreconciled,
    comparable: p.comparable,
    coverage: p.unreconciled
      ? "Há medições aprovadas em versões anteriores. Reconcilie a execução antes de usar o avanço geral."
      : !p.summaries.length
        ? "Sem orçamento aprovado"
        : !p.hasValue
          ? "Sem base positiva para ponderar o avanço" +
            (p.pendingCount ? ` · ${p.pendingCount} itens pendentes` : "")
          : `Planejamento cobre ${p.planCoverage.toFixed(1).replace(".", ",")}% do valor conhecido` +
            (p.pendingCount ? ` · ${p.pendingCount} itens pendentes; valores parciais` : "") +
            (!p.comparable ? " · desvio geral indisponível" : ""),
  };
}
function measuredWork(w: Work) {
  const progress = getMeasurementProgress(w.id);
  const actual = Math.round(progress.actual * 10) / 10;
  const planned = Math.round(progress.planned * 10) / 10;
  return {
    ...w,
    actual_progress: actual,
    planned_progress: planned,
    status:
      w.status === "concluida"
        ? w.status
        : progress.comparable && actual + 3 < planned
          ? ("atrasada" as const)
          : w.status,
  };
}
export const getWorks = () => works.map(measuredWork);
export const getWork = (id: string) => {
  const w = works.find((w) => w.id === id);
  return w ? measuredWork(w) : undefined;
};
export const getMeasurementSchedule = (workId: string) =>
  getMeasurementProgress(workId)
    .summaries.filter((s) => s.hasPlan && s.hasValue && !s.unreconciled)
    .map((s) => ({
      id: s.budget.id,
      work_id: workId,
      name: s.budget.name,
      unit: "%",
      planned_quantity: 100,
      planned_start: s.budget.planned_start!,
      planned_end: s.budget.planned_end!,
      executed_quantity: s.actual,
    }));
export const getServices = (workId: string) => services.filter((s) => s.work_id === workId);
export const getScheduleServicesCount = (workId: string) => getMeasurementSchedule(workId).length;
export const getService = (id: string | null) => services.find((s) => s.id === id);
export const getBudgetItems = () => budgetItems;
export const getBudgetsByWork = (workId: string) => budgets.filter((b) => b.work_id === workId);
export const getImportRevisionProtection = (workId: string, name: string) =>
  importRevisionProtection(budgets, measurements, dailyReports, photos, workId, name);
export const getBudget = (workId: string, budgetId: string) =>
  budgets.find((b) => b.work_id === workId && b.id === budgetId);
export const getItemsByBudget = (budgetId: string) =>
  budgetItems.filter((b) => b.budget_id === budgetId);
export const getBudgetSummary = (budgetId: string) => {
  const items = getItemsByBudget(budgetId);
  return {
    itemCount: items.length,
    pendingCount: items.filter((i) => i.quantity_pending || i.unit_price_pending).length,
    total: items.reduce(
      (sum, item) => sum + Math.round(item.planned_quantity * item.unit_price * 100) / 100,
      0,
    ),
  };
};
export const getReports = () => dailyReports;
export const getReportsByWork = (workId: string) =>
  dailyReports.filter((r) => r.work_id === workId);
export const getReportService = (item: DailyReportItem) =>
  item.budget_item_id
    ? (() => {
        const row = budgetItems.find((b) => b.id === item.budget_item_id);
        return row ? { name: row.description, unit: row.unit } : undefined;
      })()
    : getService(item.service_id);
export const getReportItems = (reportId: string) =>
  dailyReportItems.filter((i) => i.daily_report_id === reportId);
export const getReportPhotos = (reportId: string) =>
  photos.filter((p) => p.daily_report_id === reportId);
export const getReportIssues = (reportId: string) =>
  issues.filter((i) => i.daily_report_id === reportId);
export const getWorkPhotos = (workId: string) => {
  const ids = new Set(getReportsByWork(workId).map((r) => r.id));
  return photos
    .filter((p) => ids.has(p.daily_report_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
};
export const getOpenIssues = (workId?: string) =>
  issues.filter((i) => i.status === "aberta" && (!workId || i.work_id === workId));
export const getActivities = (workId?: string) =>
  activities.filter((a) => !workId || a.work_id === workId);
export const getLastReportDate = (workId: string) =>
  getReportsByWork(workId)
    .map((r) => r.date)
    .sort()
    .at(-1) ?? null;
export const getRunningServicesCount = (workId: string) =>
  getMeasurementSchedule(workId).filter(
    (s) =>
      s.planned_start <= TODAY &&
      s.executed_quantity > 0 &&
      s.executed_quantity < s.planned_quantity,
  ).length;

export type DiarySaveInput = {
  id?: string;
  requestId?: string;
  expectedRevision?: number;
  report: Omit<DailyReport, "id">;
  items: Omit<DailyReportItem, "id" | "daily_report_id">[];
  photoUrls: string[];
  issues: string[];
};
export function createDailyReport(input: DiarySaveInput) {
  return import("./cloud-data").then(({ saveCloudReport }) => saveCloudReport(input));
}

export const STATUS_LABEL: Record<WorkStatus, string> = {
  em_andamento: "Em andamento",
  atencao: "Atenção",
  atrasada: "Atrasada",
  concluida: "Concluída",
};
export { TODAY };

export type ServiceSituation = "concluido" | "em_andamento" | "atrasado" | "nao_iniciado";
export const SITUATION_LABEL: Record<ServiceSituation, string> = {
  concluido: "Concluído",
  em_andamento: "No prazo",
  atrasado: "Atrasado",
  nao_iniciado: "Não iniciado",
};
export function serviceMetrics(s: import("./types").WorkService) {
  const now = Date.parse(TODAY),
    ps = Date.parse(s.planned_start),
    pe = Date.parse(s.planned_end);
  const pct = s.planned_quantity > 0 ? (s.executed_quantity / s.planned_quantity) * 100 : 0;
  const expected =
    pe === ps ? (now >= pe ? 100 : 0) : Math.min(100, Math.max(0, ((now - ps) / (pe - ps)) * 100));
  let situation: ServiceSituation = "em_andamento";
  if (pct >= 99.9) situation = "concluido";
  else if (pct + 3 < expected) situation = "atrasado";
  else if (s.executed_quantity === 0 && ps > now) situation = "nao_iniciado";
  return { pct: Math.min(100, pct), expected, situation };
}

/** Planned vs executed S-curve (monthly), derived from the work's schedule. */
export function getProgressCurve(workId: string) {
  const work = getWork(workId)!;
  const end = new Date((work.end_date > TODAY ? work.end_date : TODAY) + "T00:00:00Z");
  const cursor = new Date(work.start_date + "T00:00:00Z");
  cursor.setUTCDate(1);
  const result: { mes: string; planejado: number | null; executado: number | null }[] = [];
  while (cursor <= end && result.length < 600) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    const date = monthEnd > TODAY ? TODAY : monthEnd;
    const plannedDate = monthEnd > work.end_date ? work.end_date : monthEnd;
    const planned = getMeasurementProgress(workId, plannedDate);
    const actual = getMeasurementProgress(workId, date);
    result.push({
      mes: cursor.toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      planejado: planned.comparable ? planned.planned : null,
      executado:
        cursor.toISOString().slice(0, 10) <= TODAY && actual.hasValue && !actual.unreconciled
          ? actual.actual
          : null,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}
