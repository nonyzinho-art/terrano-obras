import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NewReportDialog } from "./NewReportDialog";
const mocks = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue("id"), error: vi.fn() }));
vi.mock("@/lib/access", () => ({ canWriteWork: () => true, canEditDiary: () => true }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("@/lib/repository", () => ({
  getWorks: () => [{ id: "w", name: "Obra", status: "em_andamento" }],
  getServices: () => [],
  getMeasurementProgress: () => ({
    summaries: [
      {
        budget: {
          id: "b",
          name: "Drenagem",
          work_id: "w",
          status: "aprovado",
          execution_status: "em_execucao",
        },
      },
    ],
  }),
  getReportPhotos: () => [],
  getReportIssues: () => [],
  getReportItems: () => [],
  getBudget: () => ({ id: "b", name: "Drenagem", work_id: "w" }),
  getItemsByBudget: () => [{ id: "i", code: "1.1", description: "Tubo", unit: "m" }],
  isCloudMode: () => true,
  TODAY: "2026-10-26",
  createDailyReport: mocks.save,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("não inventa equipe/equipamento e exige informar zero explicitamente", async () => {
  render(<NewReportDialog open onOpenChange={() => {}} />);
  expect(screen.getByLabelText("Quantidade de trabalhadores")).toHaveValue(null);
  expect(screen.getByLabelText("Quantidade de equipamentos")).toHaveValue(null);
  fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Quantidade de trabalhadores"), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByLabelText("Quantidade de equipamentos"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        report: expect.objectContaining({ workers_quantity: 0, equipment_quantity: 0 }),
      }),
    ),
  );
});

it("seleciona item do orçamento e aceita quantidade com vírgula", async () => {
  render(<NewReportDialog open onOpenChange={() => {}} />);
  fireEvent.change(screen.getByLabelText("Orçamento do diário"), { target: { value: "b" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Serviço" }), { target: { value: "b:i" } });
  fireEvent.change(screen.getByLabelText("Quantidade executada"), { target: { value: "2,5" } });
  fireEvent.change(screen.getByLabelText("Quantidade de trabalhadores"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("Quantidade de equipamentos"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Finalizar diário" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        report: expect.objectContaining({ budget_id: "b", status: "finalizado" }),
        items: [
          expect.objectContaining({
            service_id: null,
            budget_item_id: "i",
            budget_id: "b",
            executed_quantity: 2.5,
          }),
        ],
      }),
    ),
  );
});
it("retoma o mesmo diário e permite dia sem produção com justificativa", async () => {
  const report = {
    id: "existing",
    work_id: "w",
    budget_id: "b",
    date: "2026-10-15",
    weather: "Chuvoso" as const,
    responsible_user: "Lucas",
    workers_quantity: 0,
    equipment: [],
    equipment_quantity: 0,
    observations: "Chuva e paralisação",
    status: "rascunho" as const,
    revision: 4,
  };
  render(<NewReportDialog open existingReport={report} onOpenChange={() => {}} />);
  expect(screen.getByLabelText("Orçamento do diário")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Finalizar diário" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "existing",
        expectedRevision: 4,
        requestId: expect.any(String),
        report: expect.objectContaining({
          observations: "Chuva e paralisação",
          status: "finalizado",
        }),
        items: [],
      }),
    ),
  );
});

it("cada novo diário usa outro identificador mesmo sem desmontar o formulário", async () => {
  render(<NewReportDialog open onOpenChange={() => {}} />);
  for (let i = 0; i < 2; i++) {
    fireEvent.change(screen.getByLabelText("Quantidade de trabalhadores"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Quantidade de equipamentos"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(i + 1));
    await waitFor(() =>
      expect(screen.getByLabelText("Quantidade de trabalhadores")).toHaveValue(null),
    );
  }
  expect(mocks.save.mock.calls[0]![0].id).not.toBe(mocks.save.mock.calls[1]![0].id);
});
