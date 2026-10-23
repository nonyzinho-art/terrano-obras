import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ReportCalendar } from "@/components/app/ReportCalendar";
import { NewReportDialog } from "@/components/app/NewReportDialog";
import { toast } from "sonner";
import * as repository from "@/lib/repository";

import { setAccess } from "@/lib/access";
beforeEach(() => {
  setAccess(
    { user_id: "test-engineer", role: "engenheiro", active: true },
    repository.getWorks().map((w) => ({ work_id: w.id, can_write: true })),
  );
});
afterEach(() => {
  setAccess(null);
  cleanup();
  vi.restoreAllMocks();
});

describe("Diário calendar", () => {
  it("passes all reports for a day, including drafts, without hiding additional records", () => {
    const report = repository.getReportsByWork("brisas-do-sul")[0]!;
    const reports = Array.from({ length: 5 }, (_, i) => ({
      ...report,
      id: `test-${i}`,
      date: "2026-10-05",
      status: i === 4 ? ("rascunho" as const) : ("finalizado" as const),
    }));
    const onDateSelect = vi.fn();
    render(<ReportCalendar reports={reports} onSelect={vi.fn()} onDateSelect={onDateSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "05/10/2026 — 5 registro(s)" }));
    expect(onDateSelect).toHaveBeenCalledWith("2026-10-05", reports);
  });
  it("provides the clicked date for an empty day and navigates across years", () => {
    const onDateSelect = vi.fn();
    render(<ReportCalendar reports={[]} onSelect={vi.fn()} onDateSelect={onDateSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "06/10/2026 — Novo Diário" }));
    expect(onDateSelect).toHaveBeenCalledWith("2026-10-06", []);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    expect(screen.getByText("Janeiro 2027")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(screen.getByText("Outubro 2026")).toBeInTheDocument();
  });
  it("preserves direct report opening for existing calendar consumers", () => {
    const report = { ...repository.getReportsByWork("brisas-do-sul")[0]!, date: "2026-10-05" };
    const onSelect = vi.fn();
    render(<ReportCalendar reports={[report]} onSelect={onSelect} />);
    fireEvent.click(
      screen.getByRole("button", { name: report.responsible_user.replace(/^(Eng\.|Téc\.) /, "") }),
    );
    expect(onSelect).toHaveBeenCalledWith(report);
  });
  it("creates a draft with the selected work and date, including a completed work", async () => {
    const create = vi.spyOn(repository, "createDailyReport").mockReturnValue("test-report");
    const onOpenChange = vi.fn();
    render(
      <NewReportDialog
        open
        onOpenChange={onOpenChange}
        defaultWorkId="silvania"
        defaultDate="2026-08-27"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        report: expect.objectContaining({
          work_id: "silvania",
          date: "2026-08-27",
          status: "rascunho",
        }),
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
  it("keeps the draft open and its text when saving fails", async () => {
    vi.spyOn(repository, "createDailyReport").mockRejectedValue(new Error("Falha ao salvar"));
    const errorToast = vi.spyOn(toast, "error");
    const onOpenChange = vi.fn();
    render(<NewReportDialog open onOpenChange={onOpenChange} defaultWorkId="silvania" />);
    const observations = screen.getByPlaceholderText(
      "Condições da frente de serviço, interferências, ocorrências…",
    );
    fireEvent.change(observations, { target: { value: "Observação que precisa ser preservada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("Falha ao salvar"));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(observations).toHaveValue("Observação que precisa ser preservada");
    expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeEnabled();
  });
  it("handles an empty cloud account without selecting a nonexistent work", () => {
    vi.spyOn(repository, "getWorks").mockReturnValue([]);
    render(<NewReportDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Finalizar diário" })).toBeDisabled();
  });
});
