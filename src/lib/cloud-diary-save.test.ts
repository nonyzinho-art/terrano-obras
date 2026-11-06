import { beforeEach, expect, it, vi } from "vitest";
import { saveCloudReport } from "./cloud-data";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  event: { data: null, error: null } as {
    data: null | { id: string };
    error: null | { message: string };
  },
  remove: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("./repository", () => ({ replaceData: mocks.replace }));
vi.mock("./supabase", () => ({
  getSupabase: () => ({
    rpc: mocks.rpc,
    storage: { from: () => ({ remove: mocks.remove }) },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: async () => ({ data: [], error: null }),
        maybeSingle: async () =>
          table === "diary_changes" ? mocks.event : { data: { id: "existing" }, error: null },
      };
      return query;
    },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.event = { data: null, error: null };
});
const input = {
  id: "existing",
  requestId: "request",
  expectedRevision: 2,
  report: {
    work_id: "w",
    date: "2026-10-15",
    weather: "Chuvoso" as const,
    responsible_user: "Lucas",
    workers_quantity: 0,
    equipment: [],
    observations: "Chuva",
    status: "rascunho" as const,
  },
  items: [],
  issues: [],
  photoUrls: [],
};
it("não considera edição salva só porque o diário já existia", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "Conflito de revisão" } });
  await expect(saveCloudReport(input)).rejects.toMatchObject({ message: "Conflito de revisão" });
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith("save_diary_entry", {
    p_payload: expect.objectContaining({ id: "existing", request_id: "request", revision: 2 }),
  });
});
it("confirma um timeout somente pelo identificador do envio registrado", async () => {
  mocks.rpc.mockRejectedValue(new Error("timeout"));
  mocks.event = { data: { id: "event" }, error: null };
  await expect(saveCloudReport(input)).resolves.toBe("existing");
  expect(mocks.replace).toHaveBeenCalled();
});
it("não presume falha nem sucesso quando a confirmação também está indisponível", async () => {
  mocks.rpc.mockRejectedValue(new Error("offline"));
  mocks.event = { data: null, error: { message: "offline" } };
  await expect(saveCloudReport(input)).rejects.toThrow("Não foi possível confirmar");
  expect(mocks.remove).not.toHaveBeenCalled();
});
