import { getSupabase } from "./supabase";
import { replaceData, type DataSnapshot } from "./repository";
import type { DailyReport, DailyReportItem, Photo } from "./types";

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
  const [works, budgets, budgetItems, services, dailyReports, dailyReportItems, rawPhotos, issues] =
    await Promise.all(
      [
        "works",
        "budgets",
        "budget_items",
        "service_execution",
        "daily_reports",
        "daily_report_items",
        "photos",
        "issues",
      ].map(rows),
    );
  const photos = await Promise.all(
    rawPhotos!.map(async (p) => {
      const { data, error } = await getSupabase()
        .storage.from("diary-photos")
        .createSignedUrl(String(p["storage_path"]), 3600);
      if (error) throw error;
      return { ...p, file_url: data.signedUrl } as Photo;
    }),
  );
  const snapshot = {
    works,
    budgets,
    budgetItems: budgetItems!.map((b) => ({ ...b, executed_quantity: 0 })),
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
export async function saveCloudReport(input: {
  report: Omit<DailyReport, "id">;
  items: Omit<DailyReportItem, "id" | "daily_report_id">[];
  photoUrls: string[];
  issues: string[];
}) {
  const client = getSupabase();
  const id = crypto.randomUUID();
  const uploaded: string[] = [];
  let committed = false;
  try {
    for (const url of input.photoUrls) {
      if (!url.startsWith("blob:"))
        throw new Error("Selecione novamente a foto para enviar ao banco.");
      const response = await fetch(url);
      if (!response.ok) throw new Error("Não foi possível ler uma das fotos.");
      const file = await response.blob();
      const path = `${input.report.work_id}/${id}/${crypto.randomUUID()}`;
      const { error } = await client.storage
        .from("diary-photos")
        .upload(path, file, { contentType: file.type });
      if (error) throw error;
      uploaded.push(path);
    }
    const { error } = await client.rpc("save_daily_report", {
      payload: {
        id,
        report: input.report,
        items: input.items,
        issues: input.issues,
        photos: uploaded.map((storage_path) => ({ storage_path, description: "" })),
      },
    });
    if (error) throw error;
    committed = true;
  } catch (error) {
    // A timeout might occur after commit. Check before deleting uploaded files.
    const { data } = await client.from("daily_reports").select("id").eq("id", id).maybeSingle();
    if (data) committed = true;
    if (!committed) {
      await client.storage.from("diary-photos").remove(uploaded);
      throw error;
    }
  }
  // Saving is complete even if the subsequent list refresh fails.
  try {
    replaceData(await loadCloudData());
  } catch {
    /* Refresh can be retried from the account panel. */
  }
  return id;
}
