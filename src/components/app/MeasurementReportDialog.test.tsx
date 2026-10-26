import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MeasurementReportDialog } from "./MeasurementReportDialog";
import type { Budget, BudgetMeasurement } from "@/lib/types";
const mocks = vi.hoisted(() => ({ read: vi.fn(), rpc: vi.fn(), build: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/quotes", () => ({ quoteRows: (...args: unknown[]) => mocks.read(...args) }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/measurement-report", () => ({
  buildMeasurementReport: (...args: unknown[]) => mocks.build(...args),
}));
vi.mock("@/lib/repository", () => ({
  getWork: () => ({ id: "w", name: "Obra" }),
  getWorkPhotos: () => [],
  getItemsByBudget: () => [{ id: "i" }],
}));
const budget: Budget = {
  id: "b",
  work_id: "w",
  name: "Drenagem",
  status: "aprovado",
  updated_at: "2026-10-15",
};
const measurement: BudgetMeasurement = {
  id: "m",
  budget_id: "b",
  work_id: "w",
  period_start: "2026-10-02",
  period_end: "2026-10-15",
  status: "aprovada",
  notes: "",
  revision: 1,
  created_by: "u",
  created_at: "2026-10-15",
  approved_by: "a",
  approved_at: "2026-10-15",
};
describe("download do relatório de medição", () => {
  beforeEach(() => {
    mocks.rpc
      .mockReset()
      .mockResolvedValue({
        data: [
          {
            author_name: "Autor",
            author_email: "autor@example.invalid",
            approver_name: "Aprovador",
            approver_email: "aprovador@example.invalid",
          },
        ],
        error: null,
      });
    mocks.read.mockReset().mockImplementation(async (table) =>
      table === "budget_measurements"
        ? [
            measurement,
            {
              ...measurement,
              id: "previous",
              period_start: "2026-10-01",
              period_end: "2026-10-01",
            },
          ]
        : [
            {
              id: "line",
              measurement_id: "m",
              budget_id: "b",
              work_id: "w",
              budget_item_id: "i",
              quantity: 2,
            },
            {
              id: "old",
              measurement_id: "previous",
              budget_id: "b",
              work_id: "w",
              budget_item_id: "i",
              quantity: 1,
            },
          ],
    );
    mocks.save.mockReset();
    mocks.build.mockReset().mockReturnValue({ save: mocks.save });
  });
  afterEach(cleanup);
  it("baixa a versão salva sem fotos e usa só as linhas da medição selecionada", async () => {
    render(<MeasurementReportDialog budget={budget} measurement={measurement} />);
    fireEvent.click(screen.getByRole("button", { name: "Relatório PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.stringMatching(/\.pdf$/)));
    expect(mocks.build).toHaveBeenCalledWith(
      expect.objectContaining({
        measurement,
        lines: [expect.objectContaining({ measurement_id: "m", quantity: 2 })],
        photos: [],
      }),
    );
    expect(mocks.build.mock.calls[0]?.[0].previous.get("i")).toBe(1);
  });
  it("impede exportar uma versão alterada por outra pessoa sem nova conferência", async () => {
    mocks.read.mockResolvedValue([{ ...measurement, revision: 2 }]);
    render(<MeasurementReportDialog budget={budget} measurement={measurement} />);
    fireEvent.click(screen.getByRole("button", { name: "Relatório PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));
    await screen.findByText(/Esta medição foi alterada/);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
