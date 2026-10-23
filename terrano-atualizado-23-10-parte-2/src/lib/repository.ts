// Data access layer. Today it reads in-memory mock data; later these functions
// can be swapped for database/server calls (and reused by a Telegram bot).
import { useSyncExternalStore } from "react";
import * as demo from "./mock-data";
import { measurementProgress } from "./measurement-progress";
import { budgetAlerts } from "./budget-alerts";
import type { BudgetMeasurement, BudgetMeasurementItem } from "./types";
let measurements: BudgetMeasurement[] = [];
let measurementItems: BudgetMeasurementItem[] = [];
let {
  activities,
  budgets,
  budgetItems,
  dailyReportItems,
  dailyReports,
  issues,
  photos,
  services,
  works,
} = demo;
let TODAY: string = demo.TODAY;
let cloudMode = false;
export type DataSnapshot = Pick<
  typeof demo,
  | "activities"
  | "budgets"
  | "budgetItems"
  | "dailyReportItems"
  | "dailyReports"
  | "issues"
  | "photos"
  | "services"
  | "works"
> & { measurements?: BudgetMeasurement[]; measurementItems?: BudgetMeasurementItem[] };
export function replaceData(data: DataSnapshot | null) {
  measurements = data?.measurements ?? [];
  measurementItems = data?.measurementItems ?? [];
  cloudMode = data !== null;
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
  } = data ?? demo);
  if (cloudMode) {
    const date = new Date();
    TODAY = date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  } else TODAY = demo.TODAY;
  emit();
}
import type { DailyReport, DailyReportItem, Issue, Photo, WorkStatus } from "./types";

let version = 0;
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

export const isCloudMode = () => cloudMode;
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
function measuredWork(w: import("./types").Work) {
  if (!cloudMode) return w;
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
        : progress.total > 0 && actual + 3 < planned
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
    .summaries.filter((s) => s.budget.planned_start && s.budget.planned_end)
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
export const getService = (id: string) => services.find((s) => s.id === id);
export const getBudgetItems = () => budgetItems;
export const getBudgetsByWork = (workId: string) => budgets.filter((b) => b.work_id === workId);
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
  (cloudMode ? getMeasurementSchedule(workId) : getServices(workId)).filter(
    (s) =>
      s.planned_start <= TODAY &&
      s.executed_quantity > 0 &&
      s.executed_quantity < s.planned_quantity,
  ).length;

export function createDailyReport(input: {
  report: Omit<DailyReport, "id">;
  items: Omit<DailyReportItem, "id" | "daily_report_id">[];
  photoUrls: string[];
  issues: string[];
}) {
  if (cloudMode)
    return import("./cloud-data").then(({ saveCloudReport }) => saveCloudReport(input));
  const id = `dr-new-${Date.now()}`;
  dailyReports.push({ ...input.report, id });
  input.items.forEach((it, k) => {
    dailyReportItems.push({ ...it, id: `${id}-i${k}`, daily_report_id: id });
    const svc = services.find((s) => s.id === it.service_id);
    if (svc && input.report.status === "finalizado") svc.executed_quantity += it.executed_quantity;
  });
  input.photoUrls.forEach((url, k) =>
    photos.push({
      id: `${id}-p${k}`,
      daily_report_id: id,
      file_url: url,
      description: "",
      created_at: new Date().toISOString(),
    } as Photo),
  );
  input.issues.forEach((d, k) =>
    issues.push({
      id: `${id}-is${k}`,
      work_id: input.report.work_id,
      daily_report_id: id,
      description: d,
      status: "aberta",
      created_at: input.report.date,
    } as Issue),
  );
  activities.unshift({
    id,
    work_id: input.report.work_id,
    text: `${input.report.responsible_user} registrou diário com ${input.items.length} serviço(s)`,
    at: new Date().toISOString(),
    kind: "diario",
  });
  emit();
  return id;
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
  if (cloudMode) {
    const work = getWork(workId)!;
    const end = new Date((work.end_date > TODAY ? work.end_date : TODAY) + "T00:00:00Z");
    const cursor = new Date(work.start_date + "T00:00:00Z");
    cursor.setUTCDate(1);
    const result: { mes: string; planejado: number; executado: number | null }[] = [];
    while (cursor <= end && result.length < 600) {
      const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0))
        .toISOString()
        .slice(0, 10);
      const date = monthEnd > TODAY ? TODAY : monthEnd;
      const plannedDate = monthEnd > work.end_date ? work.end_date : monthEnd;
      result.push({
        mes: cursor.toLocaleDateString("pt-BR", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        }),
        planejado: getMeasurementProgress(workId, plannedDate).planned,
        executado:
          cursor.toISOString().slice(0, 10) <= TODAY
            ? getMeasurementProgress(workId, date).actual
            : null,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return result;
  }
  const w = getWork(workId)!;
  const t0 = Date.parse(w.start_date),
    t1 = Date.parse(w.end_date),
    now = Date.parse(TODAY);
  const out: { mes: string; planejado: number; executado: number | null }[] = [];
  const d = new Date(t0);
  d.setUTCDate(1);
  const M = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const scurve = (x: number) => 100 * (x * x * (3 - 2 * x));
  const nowX = Math.min(1, Math.max(0, (now - t0) / (t1 - t0)));
  const k = w.planned_progress > 0 ? w.actual_progress / Math.max(1, scurve(nowX)) : 1;
  while (d.getTime() <= t1 + 31 * 86400000) {
    const t = Math.min(t1, d.getTime());
    const x = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    out.push({
      mes: `${M[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`,
      planejado: Math.round(scurve(x) * 10) / 10,
      executado: t <= now ? Math.round(Math.min(100, scurve(x) * k) * 10) / 10 : null,
    });
    d.setUTCMonth(d.getUTCMonth() + 1);
    if (t === t1) break;
  }
  return out;
}
