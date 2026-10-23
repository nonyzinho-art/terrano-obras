import { canWriteWork } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, HardHat, List, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { ReportCalendar } from "@/components/app/ReportCalendar";
import { ReportDetailDialog } from "@/components/app/ReportDetailDialog";
import { NewReportDialog } from "@/components/app/NewReportDialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

export const Route = createFileRoute("/diario")({
  head: () => ({
    meta: [
      { title: "Diário de Obras — Terrano Obras" },
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
  return (
    <>
      <PageHeader
        eyebrow="Registros de campo"
        title="Diário de Obras"
        description="Selecione uma obra e consulte os diários no calendário ou na lista."
      />
      <Accordion type="multiple" className="space-y-4">
        {getWorks().map((work) => {
          const reports = getReportsByWork(work.id);
          const lastDate = reports
            .map((r) => r.date)
            .sort()
            .at(-1);
          return (
            <AccordionItem key={work.id} value={work.id} className="panel overflow-hidden border">
              <AccordionTrigger className="px-5 py-5 hover:bg-muted/30 hover:no-underline focus-visible:outline-2 focus-visible:outline-primary">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-success-soft text-primary">
                    <HardHat className="size-5" />
                  </span>
                  <span>
                    <span className="block text-base font-semibold">{work.name}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {reports.length} {reports.length === 1 ? "registro" : "registros"} ·{" "}
                      {lastDate ? `Último diário: ${fmtDate(lastDate)}` : "Sem diários registrados"}
                    </span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="border-t px-3 pt-4 pb-5 sm:px-5">
                <WorkDiary
                  canCreate={canWriteWork(work.id)}
                  reports={reports}
                  onSelect={setSelected}
                  onDateSelect={(date, list) => openDay(work.id, date, list)}
                  onCreate={() => setCreation({ workId: work.id, date: TODAY })}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      {!getWorks().length && (
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
            Novo Diário neste dia
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
      <p className="mt-4 text-xs text-muted-foreground">
        Selecione a obra e o dia para consultar seus registros.
      </p>
    </>
  );
}

function WorkDiary({
  reports,
  onSelect,
  onDateSelect,
  onCreate,
  canCreate,
}: {
  reports: DailyReport[];
  onSelect: (report: DailyReport) => void;
  onDateSelect: (date: string, reports: DailyReport[]) => void;
  onCreate: () => void;
  canCreate: boolean;
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
        <Button size="sm" disabled={!canCreate} onClick={onCreate}>
          <Plus className="size-4" />
          Novo Diário
        </Button>
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
