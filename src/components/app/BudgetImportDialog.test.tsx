import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BudgetImportDialog } from "./BudgetImportDialog";
const mocks = vi.hoisted(() => ({ blocked: false, hasBase: false, rpc: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/access", () => ({ canWriteWork: () => true }));
vi.mock("@/lib/repository", () => ({
  useDataVersion: () => 0,
  getWorks: () => [{ id: "w", name: "Obra" }],
  getBudgetsByWork: () =>
    mocks.hasBase
      ? [
          {
            id: "base",
            work_id: "w",
            name: "Drenagem",
            status: "aprovado",
            updated_at: "2026-10-01",
            revision: 1,
          },
        ]
      : [{ name: "Drenagem" }],
  getItemsByBudget: () => [
    {
      id: "old-item",
      code: "1",
      description: "Tubo",
      unit: "m",
      group: "",
      planned_quantity: 10,
      unit_price: 10,
    },
  ],
  getApprovedBudgetQuantities: () => new Map([["old-item", 4]]),
  isCloudMode: () => true,
  replaceData: vi.fn(),
  getImportRevisionProtection: () => ({
    blocked: mocks.blocked,
    measurementCount: mocks.blocked ? 1 : 0,
    reportCount: 0,
    photoCount: 0,
  }),
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/cloud-data", () => ({ loadCloudData: vi.fn() }));
vi.mock("read-excel-file/universal", () => ({
  default: async () => [
    {
      sheet: "ESPELHO",
      data: [
        ["Código", "Descrição", "Unidade", "Quantidade", "Preço unitário", "Valor total"],
        ["1", "Tubo", "m", 10, 10, 100],
      ],
    },
  ],
}));
beforeEach(() => {
  mocks.blocked = false;
  mocks.hasBase = false;
  mocks.rpc.mockReset();
});
afterEach(cleanup);
async function prepare() {
  render(<BudgetImportDialog open onOpenChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Frente"), { target: { value: "Drenagem" } });
  const file = new File(["test"], "teste.xlsx");
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
  fireEvent.change(screen.getByLabelText("Planilha Excel"), { target: { files: [file] } });
  await screen.findByText("Tubo");
}
it("impede importar planilha válida quando a frente já tem histórico", async () => {
  mocks.blocked = true;
  await prepare();
  expect(screen.getByText(/Revisão protegida/)).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "Importar como aprovado" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("mostra o bloqueio do banco se registros chegaram depois da prévia", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "Revisão bloqueada: chegou uma medição." },
  });
  await prepare();
  const button = screen.getByRole("button", { name: "Importar como aprovado" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByText("Revisão bloqueada: chegou uma medição.");
  expect(screen.getByText("Tubo")).toBeInTheDocument();
});

it("compara a planilha protegida com a base sem liberar importação nem escrever no banco", async () => {
  mocks.blocked = true;
  mocks.hasBase = true;
  await prepare();
  fireEvent.click(screen.getByRole("button", { name: "Comparar com orçamento cadastrado" }));
  expect(screen.getByRole("heading", { name: "Comparação dos itens" })).toBeInTheDocument();
  expect(screen.getByText("4,0000 m")).toBeInTheDocument();
  expect(screen.getByText("6,0000 m")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Importar como aprovado" })).toBeDisabled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
