// Project folders attached to quotes: pick a whole folder (keeping sub-folders in the
// title), upload it to the work's private documents and, on the supplier side, download
// everything as one .zip.
import { getSupabase } from "./supabase";

export const MAX_PROJECT_FILE = 25 * 1024 * 1024;

export type ProjectFile = { file: File; path: string };
export type ProjectSelection = {
  files: ProjectFile[];
  /** Operating-system leftovers that are never useful to a supplier. */
  ignored: string[];
  tooLarge: ProjectFile[];
};

const SYSTEM_FILE = /^(thumbs\.db|desktop\.ini|\.ds_store)$|^~\$|^\./i;

/** Path shown to suppliers: "Projeto/ARQ/planta.pdf" for folders, the name for single files. */
export const projectPath = (file: File) =>
  ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(
    /\\/g,
    "/",
  );

export function selectProjectFiles(list: File[]): ProjectSelection {
  const files: ProjectFile[] = [];
  const ignored: string[] = [];
  const tooLarge: ProjectFile[] = [];
  const seen = new Set<string>();
  for (const file of list) {
    const path = projectPath(file);
    if (SYSTEM_FILE.test(file.name) || file.size === 0) {
      ignored.push(path);
      continue;
    }
    if (seen.has(path)) continue;
    seen.add(path);
    if (file.size > MAX_PROJECT_FILE) tooLarge.push({ file, path });
    else files.push({ file, path });
  }
  files.sort((a, b) => a.path.localeCompare(b.path, "pt-BR", { numeric: true }));
  return { files, ignored, tooLarge };
}

/** Document titles are limited to 200 characters; long paths keep their end. */
export const documentTitle = (path: string) =>
  path.length <= 200 ? path : "…" + path.slice(path.length - 199);

export const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Uploads files to the work's documents (category "Projeto") and returns their ids.
 * Already uploaded files (same File object) are reused when the user retries.
 */
export async function uploadProjectFiles(
  workId: string,
  userId: string,
  files: ProjectFile[],
  cache: Map<File, string>,
  onProgress?: (done: number, total: number) => void,
) {
  const client = getSupabase();
  const ids: string[] = [];
  let done = 0;
  for (const { file, path } of files) {
    let docId = cache.get(file);
    if (!docId) {
      docId = crypto.randomUUID();
      const ext = file.name.split(".").pop() ?? "";
      const storagePath = `${workId}/${userId}/${docId}.${/^[a-z0-9]{1,10}$/i.test(ext) ? ext : "bin"}`;
      const up = await client.storage
        .from("work-documents")
        .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });
      if (up.error) throw new Error(`Não foi possível enviar ${path}: ${up.error.message}`);
      const meta = await client.from("work_documents").insert({
        id: docId,
        work_id: workId,
        title: documentTitle(path),
        category: "Projeto",
        filename: file.name,
        storage_path: storagePath,
        size_bytes: file.size,
      });
      if (meta.error) {
        const check = await client
          .from("work_documents")
          .select("id")
          .eq("id", docId)
          .maybeSingle();
        if (!check.data) {
          if (!check.error) await client.storage.from("work-documents").remove([storagePath]);
          throw meta.error;
        }
      }
      cache.set(file, docId);
    }
    ids.push(docId);
    onProgress?.(++done, files.length);
  }
  return ids;
}

/** Groups document titles by folder for display ("" = files at the top level). */
export function groupByFolder<T extends { title: string }>(docs: T[]) {
  const groups = new Map<string, T[]>();
  for (const doc of docs) {
    const slash = doc.title.lastIndexOf("/");
    const folder = slash > 0 ? doc.title.slice(0, slash) : "";
    groups.set(folder, [...(groups.get(folder) ?? []), doc]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

/** Downloads every attachment and saves one .zip, keeping the folder structure. */
export async function downloadAllAsZip(
  docs: { title: string; filename: string; url: string | null }[],
  zipName: string,
  onProgress?: (done: number, total: number) => void,
) {
  const { zipSync } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  const available = docs.filter((d) => d.url);
  let done = 0;
  for (const doc of available) {
    const response = await fetch(doc.url!);
    if (!response.ok) throw new Error(`Não foi possível baixar ${doc.title}. Atualize a página.`);
    let name = doc.title.startsWith("…") ? doc.filename : doc.title;
    while (entries[name]) name = name.replace(/(\.[^./]+)?$/, " (2)$1");
    entries[name] = new Uint8Array(await response.arrayBuffer());
    onProgress?.(++done, available.length);
  }
  // Project files (PDF, DWG, images) are already compressed: store them as they are.
  const blob = new Blob([zipSync(entries, { level: 0 })], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = zipName.replace(/[\\/:*?"<>|]+/g, "-") + ".zip";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return available.length;
}
