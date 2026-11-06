import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReportDetailDialog } from "./ReportDetailDialog";
import { setAccess } from "@/lib/access";
import type { DailyReport } from "@/lib/types";
vi.mock("./NewReportDialog", () => ({
  NewReportDialog: ({ existingReport }: { existingReport: DailyReport }) => (
    <h2>Editando {existingReport.id}</h2>
  ),
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ rpc: vi.fn() }) }));
vi.mock("@/lib/repository", () => ({
  getReportItems: () => [],
  getReportPhotos: () => [],
  getReportIssues: () => [],
  getReportService: () => undefined,
  getWork: () => ({ name: "Obra" }),
}));
afterEach(() => {
  cleanup();
  setAccess(null);
});
const report: DailyReport = {
  id: "r",
  work_id: "w",
  created_by: "engineer",
  date: "2026-10-15",
  weather: "Chuvoso",
  responsible_user: "Lucas",
  workers_quantity: 0,
  equipment: [],
  observations: "Chuva",
  status: "rascunho",
  revision: 1,
};
it("oferece retomada do mesmo rascunho ao autor com escrita", () => {
  setAccess({ user_id: "engineer", role: "engenheiro", active: true }, [
    { work_id: "w", can_write: true },
  ]);
  render(<ReportDetailDialog report={report} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Complementar diário" }));
  expect(screen.getByRole("heading", { name: "Editando r" })).toBeVisible();
});
it("mantém finalizados e rascunhos de outro autor em consulta para engenheiro", () => {
  setAccess({ user_id: "other", role: "engenheiro", active: true }, [
    { work_id: "w", can_write: true },
  ]);
  const view = render(<ReportDetailDialog report={report} onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Complementar diário" })).toBeNull();
  setAccess({ user_id: "engineer", role: "engenheiro", active: true }, [
    { work_id: "w", can_write: true },
  ]);
  view.rerender(
    <ReportDetailDialog report={{ ...report, status: "finalizado" }} onClose={() => {}} />,
  );
  expect(screen.queryByRole("button", { name: "Complementar diário" })).toBeNull();
});
