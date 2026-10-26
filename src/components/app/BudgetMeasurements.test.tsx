import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { BudgetMeasurements } from "./BudgetMeasurements";
import type { Budget, BudgetMeasurement } from "@/lib/types";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  history: [] as BudgetMeasurement[],
  role: "administrador",
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/cloud-data", () => ({ loadCloudData: async () => ({}) }));
vi.mock("@/lib/access", () => ({
  useAccess: () => ({ profile: { user_id: "u", role: mocks.role }, canWriteWork: () => true }),
}));
vi.mock("@/lib/repository", () => ({
  getWorkPhotos: () => [],
  TODAY: "2026-10-15",
  replaceData: vi.fn(),
  getMeasurements: () => mocks.history,
  getMeasurementItems: () => [{ budget_item_id: "i", quantity: 2, unit_price: 10 }],
  getMeasurementProgress: () => ({
    summaries: [{ budget: { id: "b" }, total: 100, executed: 0, actual: 0 }],
  }),
  getItemsByBudget: () => [
    {
      id: "i",
      code: "1.1",
      description: "Tubo",
      unit: "m",
      planned_quantity: 10,
      executed_quantity: 0,
      unit_price: 10,
    },
  ],
}));
const budget: Budget = {
  id: "b",
  work_id: "w",
  name: "Drenagem",
  status: "aprovado",
  execution_status: "em_execucao",
  updated_at: "2026-10-15",
};
const draft: BudgetMeasurement = {
  id: "m",
  budget_id: "b",
  work_id: "w",
  period_start: "2026-10-14",
  period_end: "2026-10-14",
  created_by: "u",
  created_at: "2026-10-14",
  notes: "",
  status: "rascunho",
  approved_by: null,
  approved_at: null,
  revision: 3,
};
describe("conferência de medições", () => {
  beforeEach(() => {
    mocks.history = [];
    mocks.role = "administrador";
    mocks.rpc.mockReset().mockResolvedValue({ error: null });
  });
  afterEach(cleanup);
  it("salva quantidade do período com orçamento e identificador estável", async () => {
    render(<BudgetMeasurements budget={budget} />);
    fireEvent.click(screen.getByRole("button", { name: "Nova medição" }));
    fireEvent.change(screen.getByLabelText("Quantidade do período 1.1"), {
      target: { value: "2,5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("budget_measurement_action", {
        p_action: "salvar",
        p_payload: expect.objectContaining({
          id: expect.any(String),
          budget_id: "b",
          period_start: "2026-10-15",
          period_end: "2026-10-15",
          items: [{ budget_item_id: "i", quantity: 2.5 }],
        }),
      }),
    );
  });
  it("bloqueia aprovação de alterações ainda não salvas e envia a revisão conferida", async () => {
    mocks.history = [draft];
    render(<BudgetMeasurements budget={budget} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar medição" }));
    const approve = screen.getByRole("button", { name: "Aprovar versão salva" });
    expect(approve).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Observações"), { target: { value: "Alterado" } });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Observações"), { target: { value: "" } });
    fireEvent.click(approve);
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("budget_measurement_action", {
        p_action: "aprovar",
        p_payload: { budget_id: "b", id: "m", revision: 3 },
      }),
    );
  });
  it("salva alterações e mantém o rascunho aberto para editar novamente", async () => {
    mocks.history = [draft];
    mocks.rpc.mockImplementation(async () => {
      mocks.history = [{ ...draft, notes: "Observação revisada", revision: 4 }];
      return { error: null };
    });
    render(<BudgetMeasurements budget={budget} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar medição" }));
    fireEvent.change(screen.getByLabelText("Observações"), {
      target: { value: "Observação revisada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText(
      "Medição salva. Você pode continuar editando ou aprovar após conferir.",
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "budget_measurement_action",
      expect.objectContaining({
        p_action: "salvar",
        p_payload: expect.objectContaining({ id: "m", revision: 3, notes: "Observação revisada" }),
      }),
    );
    expect(screen.getByLabelText("Observações")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Aprovar versão salva" })).toBeEnabled();
  });
  it("cria revisão justificada e abre o novo rascunho sem editar a versão aprovada", async () => {
    const original = { ...draft, status: "aprovada" as const };
    mocks.history = [original];
    mocks.rpc.mockImplementation(async (_name, args) => {
      mocks.history = [
        original,
        {
          ...draft,
          id: args.p_payload.new_id,
          replaces_id: original.id,
          revision_reason: args.p_payload.reason,
        },
      ];
      return { error: null };
    });
    render(<BudgetMeasurements budget={budget} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver medição" }));
    expect(screen.getByRole("button", { name: "Criar revisão" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Justificativa da revisão"), {
      target: { value: "Correção da quantidade medida" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar revisão" }));
    await screen.findByText(
      "Revisão criada como rascunho. A medição original continua valendo até a nova aprovação.",
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "budget_measurement_action",
      expect.objectContaining({
        p_action: "revisar",
        p_payload: expect.objectContaining({
          id: "m",
          new_id: expect.any(String),
          reason: "Correção da quantidade medida",
        }),
      }),
    );
    expect(screen.getByLabelText("Quantidade do período 1.1")).toBeEnabled();
    expect(mocks.history[0]?.status).toBe("aprovada");
  });
  it("mantém aprovadas somente para consulta e não oferece aprovação ao engenheiro", () => {
    mocks.history = [{ ...draft, status: "aprovada" }];
    mocks.role = "engenheiro";
    render(<BudgetMeasurements budget={budget} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver medição" }));
    expect(screen.getByLabelText("Quantidade do período 1.1")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salvar rascunho" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar versão salva" })).not.toBeInTheDocument();
  });
});
it("abre diretamente o rascunho indicado pelo alerta",()=>{
 mocks.history=[draft]; mocks.role="administrador";
 render(<BudgetMeasurements budget={budget} initialMeasurementId="m"/>);
 expect(screen.getByLabelText("Quantidade do período 1.1")).toHaveValue("2");
 expect(screen.getByRole("button",{name:"Aprovar versão salva"})).toBeEnabled();
 cleanup();
});

