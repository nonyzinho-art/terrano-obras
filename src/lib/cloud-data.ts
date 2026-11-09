import { getSupabase } from "./supabase";
import { replaceData, type DataSnapshot } from "./repository";
import type { DailyReport, DailyReportItem, Photo } from "./types";
import { approvedQuantities } from "./measurement-progress";
import type { BudgetMeasurement, BudgetMeasurementItem } from "./types";

async function rows(table: string) {
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await getSupabase()
      .from(table)
      .select("*")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) return all;
  }
}
export async function loadCloudData() {
  const [
    works,
    budgets,
    budgetItems,
    services,
    dailyReports,
    dailyReportItems,
    rawPhotos,
    issues,
    measurements,
    measurementItems,
    measurementAdvances,
    baselines,
  ] = await Promise.all(
    [
      "works",
      "budgets",
      "budget_items",
      "service_execution",
      "daily_reports",
      "daily_report_items",
      "photos",
      "issues",
      "budget_measurements",
      "budget_measurement_items",
      "budget_measurement_advances",
      "budget_baselines",
    ].map(rows),
  );
  // Metadata is cheap. Private image URLs are requested only when an image is visible/exported.
  const photos = rawPhotos!.map((p) => ({ ...p, file_url: "" }) as unknown as Photo);
  const quantities = approvedQuantities(
    measurements as unknown as BudgetMeasurement[],
    measurementItems as unknown as BudgetMeasurementItem[],
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
  );
  const snapshot = {
    measurements,
    measurementItems,
    measurementAdvances,
    baselines,
    works,
    budgets,
    budgetItems: budgetItems!.map((b) => ({
      ...b,
      executed_quantity: quantities.get(String(b["id"])) ?? 0,
    })),
    services,
    dailyReports,
    dailyReportItems,
    photos,
    issues,
    activities: dailyReports!
      .map((r) => ({
        id: r["id"],
        work_id: r["work_id"],
        text: `${r["responsible_user"]} registrou um diário`,
        at: r["created_at"],
        kind: "diario",
      }))
      .sort((a, b) => String(b.at).localeCompare(String(a.at))),
  } as unknown as DataSnapshot;
  return snapshot;
}
export async function saveCloudReport(input: import("./repository").DiarySaveInput) {
  const client = getSupabase();
  const id = input.id ?? crypto.randomUUID();
  const requestId = input.requestId ?? crypto.randomUUID();
  const uploaded: string[] = [];
  let committed = false;
  try {
    for (const url of input.photoUrls) {
      if (!url.startsWith("blob:"))
        throw new Error("Selecione novamente a foto para enviar ao banco.");
      const response = await fetch(url);
      if (!response.ok) throw new Error("Não foi possível ler uma das fotos.");
      const file = await response.blob();
      if (file.size === 0 || file.size > 10 * 1024 * 1024 || !file.type.startsWith("image/"))
        throw new Error("Use imagens válidas de até 10 MB.");
      const path = `${input.report.work_id}/${id}/${crypto.randomUUID()}`;
      const { error } = await client.storage
        .from("diary-photos")
        .upload(path, file, { contentType: file.type });
      if (error) throw error;
      uploaded.push(path);
    }
    const { error } = await client.rpc("save_diary_entry", {
      p_payload: {
        id,
        request_id: requestId,
        revision: input.expectedRevision,
        report: input.report,
        items: input.items,
        issues: input.issues,
        photos: uploaded.map((storage_path) => ({ storage_path, description: "" })),
      },
    });
    if (error) throw error;
    committed = true;
  } catch (error) {
    // An existing report does not prove this edit committed. Confirm this particular request.
    const { data, error: checkError } = await client
      .from("diary_changes")
      .select("id")
      .eq("report_id", id)
      .eq("request_id", requestId)
      .maybeSingle();
    if (data) committed = true;
    else {
      if (!checkError && uploaded.length)
        await client.storage.from("diary-photos").remove(uploaded);
      if (checkError)
        throw new Error(
          "Não foi possível confirmar o envio. Reabra o diário e confira antes de reenviar.",
        );
      throw error;
    }
  }
  if (committed && uploaded.length) {
    // A repeated request can return a previous success. Remove only new, confirmed unreferenced files.
    const { data, error } = await client
      .from("photos")
      .select("storage_path")
      .in("storage_path", uploaded);
    if (!error && data) {
      const linked = new Set(data.map((p) => p.storage_path));
      const orphaned = uploaded.filter((path) => !linked.has(path));
      if (orphaned.length) await client.storage.from("diary-photos").remove(orphaned);
    }
  }
  try {
    replaceData(await loadCloudData());
  } catch {
    /* Saved; the account refresh can be retried. */
  }
  return id;
}
