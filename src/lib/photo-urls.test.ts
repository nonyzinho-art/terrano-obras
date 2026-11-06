import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { photoUrl, clearPhotoUrls } from "./photo-urls";
import type { Photo } from "./types";
const mocks = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock("./supabase", () => ({
  getSupabase: () => ({ storage: { from: () => ({ createSignedUrl: mocks.sign }) } }),
}));
const photo: Photo = {
  id: "p",
  daily_report_id: "r",
  storage_path: "w/r/photo",
  file_url: "",
  description: "Foto",
  created_at: "2026-10-26",
};
beforeEach(() => {
  clearPhotoUrls();
  mocks.sign
    .mockReset()
    .mockResolvedValue({ data: { signedUrl: "https://example.invalid/first" }, error: null });
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());
it("reutiliza o link e agrupa solicitações simultâneas da mesma foto", async () => {
  const urls = await Promise.all([photoUrl(photo), photoUrl(photo), photoUrl(photo)]);
  expect(new Set(urls).size).toBe(1);
  await photoUrl(photo);
  expect(mocks.sign).toHaveBeenCalledTimes(1);
});
it("renova antes de expirar e permite nova tentativa após falha", async () => {
  await photoUrl(photo);
  vi.advanceTimersByTime(55 * 60_000);
  mocks.sign.mockResolvedValueOnce({
    data: { signedUrl: "https://example.invalid/renewed" },
    error: null,
  });
  expect(await photoUrl(photo)).toContain("renewed");
  mocks.sign.mockResolvedValueOnce({ data: null, error: { message: "Object not found" } });
  await expect(photoUrl(photo, true)).rejects.toThrow("Foto indisponível");
  expect(await photoUrl(photo, true)).toContain("first");
});
it("limpa cache na troca de conta e rejeita resposta da sessão anterior", async () => {
  let resolve!: (v: unknown) => void;
  mocks.sign.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const pending = photoUrl(photo);
  clearPhotoUrls();
  resolve({ data: { signedUrl: "https://example.invalid/old-user" }, error: null });
  await expect(pending).rejects.toThrow("Sessão alterada");
  expect(await photoUrl(photo)).not.toContain("old-user");
  expect(mocks.sign).toHaveBeenCalledTimes(2);
});
it("mantém fotos locais de demonstração sem chamar Storage", async () => {
  const { storage_path: _path, ...local } = photo;
  expect(await photoUrl({ ...local, file_url: "demo.jpg" })).toBe("demo.jpg");
  expect(mocks.sign).not.toHaveBeenCalled();
});
