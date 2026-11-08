// Supabase access for the cost planning tables. Loaded per work, on demand,
// so the login snapshot does not grow with these rows.
import { getSupabase } from "./supabase";
import type { CostPlan, CostPlanImportItem, CostPlanItem, CostPlanStage } from "./cost-plan";
import type { DisbursementRow } from "./cost-flow";

export async function loadCostPlans(workId: string) {
  const { data, error } = await getSupabase()
    .from("cost_plans")
    .select("id,work_id,name,revision,source_filename,stages,imported_at")
    .eq("work_id", workId)
    .order("revision", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CostPlan[];
}

export async function loadCostPlanItems(planId: string) {
  const { data, error } = await getSupabase()
    .from("cost_plan_items")
    .select("*")
    .eq("plan_id", planId)
    .order("position")
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as CostPlanItem[];
}

export async function importCostPlan(input: {
  key: string;
  workId: string;
  name: string;
  filename: string;
  stages: CostPlanStage[];
  items: CostPlanImportItem[];
}) {
  const { data, error } = await getSupabase().rpc("import_cost_plan", {
    p_key: input.key,
    p_work: input.workId,
    p_name: input.name,
    p_filename: input.filename,
    p_stages: input.stages,
    p_items: input.items.map((i) => ({
      code: i.code,
      insumo: i.insumo,
      service: i.service,
      stage: i.stage,
      parent: i.parent,
      viability: i.viability,
      committed: i.committed,
      toContract: i.toContract,
      adjustment: i.adjustment,
      barter: i.barter,
      forecast: i.forecast,
      startMonth: i.startMonth,
      duration: i.duration,
    })),
  });
  if (error) throw error;
  return String(data);
}

export type DisbursementImport = {
  id: string;
  source_filename: string | null;
  uau_work: string;
  period_start: string | null;
  period_end: string | null;
  imported_at: string;
};

/** Latest UAU disbursement import of the work and its rows (null when none yet). */
export async function loadLatestDisbursements(workId: string) {
  const client = getSupabase();
  const { data, error } = await client
    .from("cost_disbursement_imports")
    .select("id,source_filename,uau_work,period_start,period_end,imported_at")
    .eq("work_id", workId)
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const rows: DisbursementRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await client
      .from("cost_disbursements")
      .select("insumo,month,status,amount")
      .eq("import_id", data.id)
      .order("id")
      .range(offset, offset + 999);
    if (page.error) throw page.error;
    rows.push(
      ...((page.data ?? []) as DisbursementRow[]).map((r) => ({ ...r, amount: Number(r.amount) })),
    );
    if ((page.data ?? []).length < 1000) break;
  }
  return { batch: data as DisbursementImport, rows };
}

export async function importDisbursements(input: {
  key: string;
  workId: string;
  filename: string;
  uauWork: string;
  rows: DisbursementRow[];
}) {
  const { data, error } = await getSupabase().rpc("import_cost_disbursements", {
    p_key: input.key,
    p_work: input.workId,
    p_filename: input.filename,
    p_uau_work: input.uauWork,
    p_rows: input.rows,
  });
  if (error) throw error;
  return String(data);
}

/** Readable message, including the case where the database migration is not applied yet. */
export function costPlanError(error: unknown) {
  const text =
    typeof error === "object" && error && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  if (
    /cost_plan|cost_disbursement/.test(text) &&
    /not find|does not exist|schema cache/i.test(text)
  )
    return "Esta parte do planejamento ainda não foi ativada no banco de dados. Peça ao administrador para aplicar a atualização.";
  return text || "Não foi possível carregar o planejamento.";
}
