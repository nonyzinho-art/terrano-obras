// Domain types mirror the future database schema (works, budgets, budget_items, daily_reports, ...).
export type WorkStatus = "em_andamento" | "atencao" | "atrasada" | "concluida";

export interface User {
  id: string;
  name: string;
  role: string;
}

export interface Work {
  city?: string | null;
  state?: string;
  id: string;
  name: string;
  location: string;
  status: WorkStatus;
  start_date: string;
  end_date: string;
  planned_progress: number;
  actual_progress: number;
}

/** A physical service line in the work schedule (Gantt). */
export interface WorkService {
  id: string;
  work_id: string;
  name: string;
  unit: string;
  planned_start: string;
  planned_end: string;
  planned_quantity: number;
  executed_quantity: number;
}

export type BudgetStatus = "em_cotacao" | "cotado" | "aprovado";
export interface Budget {
  planned_start?: string | null;
  planned_end?: string | null;
  execution_status?: "em_execucao" | "concluido";
  revision?: number;
  source_filename?: string;
  id: string;
  work_id: string;
  name: string;
  status: BudgetStatus;
  updated_at: string;
}
export interface BudgetItem {
  hierarchy?: { code: string; name: string }[];
  quantity_pending?: boolean;
  unit_price_pending?: boolean;
  budget_id: string;
  status: BudgetStatus;
  id: string;
  work_id: string;
  code: string;
  group: string;
  description: string;
  unit: string;
  planned_quantity: number;
  executed_quantity: number;
  unit_price: number;
  total_price: number;
}

export interface BudgetMeasurement {
  replaces_id?: string | null;
  revision_reason?: string | null;
  id: string;
  budget_id: string;
  work_id: string;
  period_start: string;
  period_end: string;
  notes: string;
  status: "rascunho" | "aprovada" | "cancelada" | "substituida";
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  revision: number;
}
export interface BudgetMeasurementItem {
  id: string;
  measurement_id: string;
  budget_id: string;
  work_id: string;
  budget_item_id: string;
  quantity: number;
  unit_price: number;
  planned_quantity: number;
}

export type Weather = "Ensolarado" | "Nublado" | "Chuvoso" | "Parcialmente nublado";

export interface DailyReport {
  author_email?: string | null;
  budget_id?: string | null;
  id: string;
  work_id: string;
  date: string;
  weather: Weather;
  responsible_user: string;
  workers_quantity: number;
  equipment: string[];
  equipment_quantity?: number;
  observations: string;
  status: "rascunho" | "finalizado";
}

export interface DailyReportItem {
  id: string;
  daily_report_id: string;
  service_id: string;
  executed_quantity: number;
  description: string;
}

export interface Photo {
  budget_id?: string | null;
  id: string;
  daily_report_id: string;
  file_url: string;
  description: string;
  created_at: string;
}

export interface Issue {
  id: string;
  work_id: string;
  daily_report_id: string | null;
  description: string;
  status: "aberta" | "concluida";
  created_at: string;
}

export interface Activity {
  id: string;
  work_id: string;
  text: string;
  at: string;
  kind: "diario" | "foto" | "servico" | "pendencia";
}
