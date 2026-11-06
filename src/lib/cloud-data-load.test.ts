import { expect, it, vi } from "vitest";
import { loadCloudData } from "./cloud-data";
const mocks = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock("./supabase", () => ({
  getSupabase: () => ({
    storage: { from: mocks.sign },
    from: (table: string) => {
      const query = {
        select: () => query,
        order: () => query,
        range: async () => ({
          data:
            table === "photos"
              ? [
                  {
                    id: "photo",
                    storage_path: "w/r/missing-object",
                    daily_report_id: "r",
                    description: "Evidência",
                  },
                ]
              : [],
          error: null,
        }),
      };
      return query;
    },
  }),
}));
it("carrega registros e metadados sem assinar todas as fotos nem depender da existência do objeto", async () => {
  const data = await loadCloudData();
  expect(data.photos).toEqual([
    expect.objectContaining({
      id: "photo",
      storage_path: "w/r/missing-object",
      file_url: "",
      description: "Evidência",
    }),
  ]);
  expect(mocks.sign).not.toHaveBeenCalled();
});
