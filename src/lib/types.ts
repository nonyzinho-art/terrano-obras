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

export type Weather = "Ensolarado" | "Nublado" | "Chuvoso" | "Parcialmente nublado";

export interface DailyReport {
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
