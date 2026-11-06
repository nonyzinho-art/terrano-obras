import { canWriteWork } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, HardHat, List, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Panel } from "@/components/app/bits";
import { ReportCalendar } from "@/components/app/ReportCalendar";
import { ReportDetailDialog } from "@/components/app/ReportDetailDialog";
import { NewReportDialog } from "@/components/app/NewReportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getWorks, getReportsByWork, useDataVersion, TODAY } from "@/lib/repository";
import { fmtDate } from "@/lib/format";
import { normalizeSearch } from "@/lib/search";
import type { DailyReport } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/diario")({
  head: () => ({
    meta: [
      { title: "Diário de obras — Terrano Obras" },
      { name: "description", content: "Calendário de diários por obra." },
    ],
  }),
  component: Diario,
});

function Diario() {
  useDataVersion();
  const [selected, setSelected] = useState<DailyReport | null>(null);
  const [day, setDay] = useState<{ workId: string; date: string } | null>(null);
  const [creation, setCreation] = useState<{ workId: string; date: string } | null>(null);
  const dayReports = day ? getReportsByWork(day.workId).filter((r) => r.date === day.date) : [];
  const openDay = (workId: string, date: string, reports: DailyReport[]) => {
    if (!reports.length && canWriteWork(workId)) setCreation({ workId, date });
    else if (reports.length === 1) setSelected(reports[0]!);
    else setDay({ workId, date });
  };
  const works = getWorks()
    .map((work) => {
      const reports = getReportsByWork(work.id);
      return {
        work,
        reports,
        lastDate:
          reports
            .map((r) => r.date)
            .sort()
            .at(-1) ?? "",
      };
    })
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.work.name.localeCompare(b.work.name));
  const [chosen, setChosen] = useState("");
  const current = works.find((w) => w.work.id === chosen) ?? works[0];
  return (
    <>
      <PageHeader
        eyebrow="Registros de campo"
        title="Diário de obras"
        actions={
          current &&
          canWriteWork(current.work.id) && (
            <Button onClick={() => setCreation({ workId: current.work.id, date: TODAY })}>
              <Plus className="size-4" />
              Novo diário
            </Button>
          )
        }
      />
      {current ? (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <select
            aria-label="Obra do diário"
            className="h-10 rounded-md border bg-card px-3 text-sm lg:hidden"
            value={current.work.id}
            onChange={(e) => setChosen(e.target.value)}
          >
            {works.map(({ work, reports }) => (
              <option key={work.id} value={work.id}>
                {work.name} ({reports.length})
              </option>
            ))}
          </select>
          <nav aria-label="Obras" className="panel hidden self-start overflow-hidden lg:block">
            <ul className="divide-y">
              {works.map(({ work, reports, lastDate }) => (
                <li key={work.id}>
                  <button
                    onClick={() => setChosen(work.id)}
                    aria-current={work.id === current.work.id}
                    className={cn(
                      "flex w-full items-center gap-3 border-l-4 px-4 py-3 text-left hover:bg-muted/50",
                      work.id === current.work.id
                        ? "border-l-brand bg-muted/60"
                        : "border-l-transparent",
                    )}
                  >
                    <HardHat className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{work.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {lastDate ? `Último: ${fmtDate(lastDate)}` : "Sem diários"}
                      </span>
                    </span>
                    <span className="num text-xs text-muted-foreground">{reports.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <Panel title={current.work.name}>
            <WorkDiary
              key={current.work.id}
              reports={current.reports}
              onSelect={setSelected}
              onDateSelect={(date, list) => openDay(current.work.id, date, list)}
            />
          </Panel>
        </div>
      ) : (
        <p className="panel p-8 text-center text-sm text-muted-foreground">
          Nenhuma obra cadastrada.
        </p>
      )}
      <ReportDetailDialog report={selected} onClose={() => setSelected(null)} />
      <Dialog
        open={!!day}
        onOpenChange={(open) => {
          if (!open) setDay(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {getWorks().find((w) => w.id === day?.workId)?.name} — {day && fmtDate(day.date)}
            </DialogTitle>
            <DialogDescription>Escolha o registro que deseja consultar.</DialogDescription>
          </DialogHeader>
          <ul className="divide-y">
            {dayReports.map((report) => (
              <li key={report.id}>
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-sm py-3 text-left hover:bg-muted/40"
                  onClick={() => {
                    setDay(null);
                    setSelected(report);
                  }}
                >
                  <span className="text-sm font-medium">
                    {report.responsible_user}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {report.weather} · {report.workers_quantity} pessoas
                    </span>
                  </span>
                  <ReportStatus status={report.status} />
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            disabled={!day || !canWriteWork(day.workId)}
            onClick={() => {
              if (day) {
                setCreation(day);
                setDay(null);
              }
            }}
          >
            <Plus className="size-4" />
            Novo diário neste dia
          </Button>
        </DialogContent>
      </Dialog>
      {creation && (
        <NewReportDialog
          key={creation.workId + creation.date}
          open
          onOpenChange={(open) => {
            if (!open) setCreation(null);
          }}
          defaultWorkId={creation.workId}
          defaultDate={creation.date}
        />
      )}
    </>
  );
}

function WorkDiary({
  reports,
  onSelect,
  onDateSelect,
}: {
  reports: DailyReport[];
  onSelect: (report: DailyReport) => void;
  onDateSelect: (date: string, reports: DailyReport[]) => void;
}) {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const term = normalizeSearch(query);
  const filtered = [...reports]
    .filter(
      (r) =>
        (!status || r.status === status) &&
        normalizeSearch(
          `${fmtDate(r.date)} ${r.responsible_user} ${r.weather} ${r.observations}`,
        ).includes(term),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex gap-1 rounded-md border bg-muted/30 p-1"
          role="group"
          aria-label="Visualização dos diários"
        >
          <Button
            variant={view === "calendar" ? "default" : "ghost"}
            size="sm"
            aria-pressed={view === "calendar"}
            onClick={() => setView("calendar")}
          >
            <CalendarDays className="size-4" />
            Calendário
          </Button>
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List className="size-4" />
            Lista
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {reports.length} {reports.length === 1 ? "registro" : "registros"}
        </span>
      </div>
      {view === "calendar" ? (
        <ReportCalendar reports={reports} onSelect={onSelect} onDateSelect={onDateSelect} />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px]">
            <label className="text-xs font-medium">
              Buscar registro
              <Input
                className="mt-1"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Data, responsável, clima ou observação"
              />
            </label>
            <label className="text-xs font-medium">
              Status
              <select
                className="mt-1 h-9 w-full rounded-md border bg-card px-3 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todos os status</option>
                <option value="finalizado">Finalizado</option>
                <option value="rascunho">Rascunho</option>
              </select>
            </label>
          </div>
          <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">
            {filtered.length} de {reports.length} registros
          </p>
          <ul className="divide-y rounded-md border">
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-3 text-left hover:bg-muted/40"
                  onClick={() => onSelect(r)}
                >
                  <span className="text-sm">
                    <span className="num font-semibold">{fmtDate(r.date)}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {r.responsible_user} · {r.weather}
                    </span>
                  </span>
                  <ReportStatus status={r.status} />
                </button>
              </li>
            ))}
          </ul>
          {!filtered.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {reports.length
                ? "Nenhum registro corresponde à busca e aos filtros."
                : "Esta obra ainda não possui diários. Crie o primeiro registro."}
            </p>
          )}
        </>
      )}
    </>
  );
}
function ReportStatus({ status }: { status: DailyReport["status"] }) {
  return (
    <span
      className={`rounded-sm px-2 py-1 text-xs font-medium ${status === "rascunho" ? "bg-warning-soft text-warning-foreground" : "bg-success-soft text-primary"}`}
    >
      {status === "rascunho" ? "Rascunho" : "Finalizado"}
    </span>
  );
}
