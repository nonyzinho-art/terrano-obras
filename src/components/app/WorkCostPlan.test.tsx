import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { CostPlanItem } from "@/lib/cost-plan";

const item = (position: number, service: string, values: Partial<CostPlanItem>): CostPlanItem => ({
  id: `i${position}`,
  plan_id: "p",
  position,
  parent_position: null,
  item_code: "",
  insumo: "",
  service,
  stage: null,
  viability: 0,
  committed: 0,
  to_contract: 0,
  adjustment: 0,
  barter: 0,
  forecast: null,
  start_month: "2026-12-01",
  duration_months: 2,
  ...values,
});
const mocks = vi.hoisted(() => ({
  plans: vi.fn(),
  items: vi.fn(),
  disbursements: vi.fn(async () => null as unknown),
}));
vi.mock("@/lib/cost-plan-data", () => ({
  loadCostPlans: mocks.plans,
  loadCostPlanItems: mocks.items,
  loadLatestDisbursements: mocks.disbursements,
  costPlanError: (e: unknown) => String(e),
}));
vi.mock("@/lib/repository", () => ({ TODAY: "2026-11-08" }));
vi.mock("@/lib/access", () => ({ useAccess: () => ({ canWriteWork: () => true }) }));
vi.mock("./CostPlanImportDialog", () => ({ CostPlanImportDialog: () => null }));
vi.mock("./DisbursementImportDialog", () => ({ DisbursementImportDialog: () => null }));
// Charts need real layout; the panel's numbers are what matter here.
vi.mock("recharts", async (original) => ({
  ...(await original<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));
import { WorkCostPlan } from "./WorkCostPlan";

afterEach(cleanup);
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WorkCostPlan workId="w" />
    </QueryClientProvider>,
  );

it("mostra custo por etapa, total, abatimento e detalhes dos indiretos", async () => {
  mocks.plans.mockResolvedValue([
    {
      id: "p",
      work_id: "w",
      name: "REV 05",
      revision: 1,
      source_filename: "custo.xlsx",
      stages: [{ stage: 1, name: "1ª etapa", lots: 100 }],
      imported_at: "2026-11-08T10:00:00Z",
    },
  ]);
  mocks.items.mockResolvedValue([
    item(0, "PAVIMENTAÇÃO", {
      stage: 1,
      viability: 1000,
      committed: 600,
      to_contract: 300,
      barter: 200,
      forecast: 1100,
    }),
    item(1, "INDIRETOS", {
      item_code: "13",
      viability: 500,
      committed: 300,
      to_contract: 200,
      forecast: 500,
    }),
    item(2, "DESPESAS DE CANTEIRO", { parent_position: 1, committed: 90 }),
    item(3, "PERMUTAS - FUTURAS", { viability: -400, forecast: -400 }),
  ]);
  show();
  expect(await screen.findByText("Custo por frente de serviço")).toBeInTheDocument();
  expect(screen.getByText("R$ 1,5 mil")).toBeInTheDocument();
  expect(screen.getByText("R$ 16 por lote")).toBeInTheDocument();
  const total = screen.getByText("Total da obra").closest("tr")!;
  expect(within(total).getByText("1.600")).toBeInTheDocument();
  expect(within(total).getByText("+100")).toBeInTheDocument();
  expect(screen.getByText(/custo líquido previsto/)).toHaveTextContent("1.200");
  expect(screen.queryByText("DESPESAS DE CANTEIRO")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "INDIRETOS" }));
  expect(screen.getByText("DESPESAS DE CANTEIRO")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "1ª etapa" }));
  expect(screen.queryByRole("button", { name: "INDIRETOS" })).not.toBeInTheDocument();
  expect(screen.getByText("Total da seleção").closest("tr")).toHaveTextContent("1.100");
});

it("liga o desembolso do UAU às frentes e aponta pagamento acima do previsto", async () => {
  mocks.plans.mockResolvedValue([
    {
      id: "p",
      work_id: "w",
      name: "REV 05",
      revision: 1,
      source_filename: null,
      stages: [],
      imported_at: "2026-11-08T10:00:00Z",
    },
  ]);
  mocks.items.mockResolvedValue([
    item(0, "PAVIMENTAÇÃO", {
      insumo: "I04363",
      stage: 1,
      viability: 1000,
      committed: 600,
      to_contract: 300,
      forecast: 900,
    }),
    item(1, "INDIRETOS", {
      item_code: "13",
      insumo: "13",
      viability: 500,
      committed: 300,
      forecast: 500,
    }),
    item(2, "DESPESAS DE CANTEIRO", { insumo: "I04388", parent_position: 1, committed: 90 }),
  ]);
  mocks.disbursements.mockResolvedValue({
    batch: {
      id: "b",
      source_filename: "x.xlsx",
      uau_work: "SCPDB",
      period_start: "2026-01-01",
      period_end: "2026-10-01",
      imported_at: "2026-11-08T10:00:00Z",
    },
    rows: [
      { insumo: "I04363", month: "2026-09-01", status: "pago", amount: 950 },
      { insumo: "I04388", month: "2026-10-01", status: "pago", amount: 90 },
      { insumo: "I99999", month: "2026-10-01", status: "pago", amount: 5000 },
    ],
  });
  show();
  const paving = (await screen.findByText("PAVIMENTAÇÃO")).closest("tr")!;
  expect(within(paving).getByTitle("Pago 50 acima do contratado + a contratar")).toHaveTextContent(
    "950",
  );
  expect(screen.getByText("Total da obra").closest("tr")).toHaveTextContent("1.040");
  expect(screen.getByText("Fluxo financeiro")).toBeInTheDocument();
  expect(screen.getByText(/já foram pagos acima do contratado/)).toHaveTextContent("R$ 50,00");
  expect(screen.getByText(/Desembolso SCPDB/)).toBeInTheDocument();
});

it("convida a importar quando a obra ainda não tem planejamento", async () => {
  mocks.plans.mockResolvedValue([]);
  show();
  expect(await screen.findByText("Traga o planejamento de custos da obra")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Importar planilha" })).toBeInTheDocument();
});
