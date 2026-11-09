import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
vi.mock("@/routes/__root", async () => {
  const { createRootRouteWithContext, Outlet } = await import("@tanstack/react-router");
  return { Route: createRootRouteWithContext()({ component: Outlet }) };
});
vi.mock("@/lib/access", () => ({
  useAccess: () => ({ profile: { user_id: "u", role: "administrador" }, canWriteWork: () => true }),
  canWriteWork: () => true,
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ rpc: vi.fn() }) }));
vi.mock("@/components/app/BudgetAnalysis", () => ({ BudgetAnalysis: () => null }));
vi.mock("@/components/app/BudgetRecords", () => ({ BudgetRecords: () => null }));
vi.mock("@/components/app/WorkDocuments", () => ({ WorkDocuments: () => null }));
vi.mock("@/lib/repository", () => ({
  TODAY: "2026-10-26",
  useDataVersion: () => 0,
  getWork: () => ({ id: "w", name: "Obra" }),
  getBudget: () => ({
    id: "b",
    work_id: "w",
    name: "Rede",
    status: "aprovado",
    updated_at: "2026-10-26",
  }),
  getBudgetsByWork: () => [],
  getBudgetSummary: () => ({ total: 100, itemCount: 1, pendingCount: 0 }),
  getReportsByWork: () => [],
  getWorkPhotos: () => [],
  getMeasurements: () => [],
  getMeasurementAdvances: () => [],
  getBaselines: () => [],
  getEarnedValue: () => ({
    series: [],
    currentMonth: "2026-10-01",
    plannedToday: 0,
    plannedTotal: 0,
    executed: 0,
    paid: 0,
    spi: null,
    delayDays: null,
    paidAhead: 0,
    hasPlan: false,
    withoutPlan: 0,
  }),
  getBudgetMeasurementData: () => ({ measurements: [], lines: [], advances: [] }),
  getMeasurementItems: () => [],
  getMeasurementProgress: () => ({
    summaries: [{ budget: { id: "b" }, total: 100, executed: 0, actual: 0, planned: 0 }],
  }),
  getItemsByBudget: () => [
    {
      id: "i",
      budget_id: "b",
      code: "1.1",
      description: "Tubo",
      unit: "m",
      planned_quantity: 10,
      executed_quantity: 0,
      unit_price: 10,
      status: "aprovado",
    },
  ],
}));
import { routeTree } from "@/routeTree.gen";
afterEach(cleanup);
it("a página real preserva quantidade ao consultar outra aba e voltar", async () => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/orcamentos/w/b?aba=medicoes"] }),
    context: { queryClient: new QueryClient() },
  });
  render(<RouterProvider router={router} />);
  fireEvent.click(await screen.findByRole("button", { name: "Nova medição" }));
  fireEvent.change(screen.getByLabelText("Quantidade do período 1.1"), { target: { value: "3" } });
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Acompanhamento" }), {
    button: 0,
    ctrlKey: false,
  });
  await screen.findByRole("tabpanel", { name: "Acompanhamento" });
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Medições" }), { button: 0, ctrlKey: false });
  expect(await screen.findByLabelText("Quantidade do período 1.1")).toHaveValue("3");
});
