import { getSupabase } from "./supabase";
import type { Photo } from "./types";
const cache = new Map<string, { url: string; expires: number }>();
const requests = new Map<string, Promise<string>>();
let generation = 0;
export function clearPhotoUrls() {
  generation++;
  cache.clear();
  requests.clear();
}
export async function photoUrl(photo: Photo, force = false): Promise<string> {
  if (!photo.storage_path) {
    if (!photo.file_url) throw new Error("Foto indisponível.");
    return photo.file_url;
  }
  const path = photo.storage_path;
  const saved = cache.get(path);
  if (!force && saved && saved.expires > Date.now() + 300_000) return saved.url;
  const existing = requests.get(path);
  if (existing) return existing;
  const scope = generation;
  const request = (async () => {
    const { data, error } = await getSupabase()
      .storage.from("diary-photos")
      .createSignedUrl(path, 3600);
    if (scope !== generation) throw new Error("Sessão alterada. Abra a foto novamente.");
    if (error || !data?.signedUrl) throw new Error("Foto indisponível. Tente novamente.");
    cache.set(path, { url: data.signedUrl, expires: Date.now() + 3_600_000 });
    return data.signedUrl;
  })();
  requests.set(path, request);
  try {
    return await request;
  } finally {
    if (requests.get(path) === request) requests.delete(path);
  }
}
