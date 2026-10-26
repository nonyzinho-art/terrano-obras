import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkDocuments } from "./WorkDocuments";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ error: null }),
  linked: false,
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: async (...args: unknown[]) => {
      mocks.linked = true;
      return mocks.rpc(...args);
    },
  }),
}));
vi.mock("@/lib/access", () => ({
  useAccess: () => ({ profile: { user_id: "u" }, canWriteWork: () => true }),
}));
vi.mock("@/lib/repository", () => ({ getBudgetsByWork: () => [{ id: "b", name: "Drenagem" }] }));
vi.mock("@/lib/quotes", () => ({
  quoteRows: async (table: string) =>
    table === "work_documents"
      ? [
          {
            id: "d",
            title: "Projeto existente",
            filename: "planta.pdf",
            category: "Projeto",
            size_bytes: 100,
            storage_path: "w/u/d.pdf",
            created_at: "2026-10-15",
          },
        ]
      : mocks.linked
        ? [{ id: "l", budget_id: "b", document_id: "d", work_id: "w" }]
        : [],
}));
afterEach(cleanup);
it("vincula arquivo existente sem fazer novo upload e mostra somente documentos do orçamento", async () => {
  render(<WorkDocuments workId="w" budgetId="b" />);
  await screen.findByText("Nenhum documento encontrado.");
  fireEvent.change(screen.getByLabelText("Documento da obra para vincular"), {
    target: { value: "d" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Vincular documento da obra" }));
  await waitFor(() =>
    expect(mocks.rpc).toHaveBeenCalledWith("link_budget_document", {
      p_budget: "b",
      p_document: "d",
    }),
  );
  expect(await screen.findByRole("button", { name: "Abrir PDF: Projeto existente" })).toBeVisible();
});
