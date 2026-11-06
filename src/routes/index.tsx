import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { AppShellHeader } from "@/components/app/headers";
import { BudgetAlerts } from "@/components/app/BudgetAlerts";
import { NewReportDialog } from "@/components/app/NewReportDialog";
import { ActivityList, Panel, ProgressBar, StatusBadge } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import {
  getActivities,
  getBudgetAlerts,
  getLastReportDate,
  getMeasurementProgress,
  getReports,
  getWork,
  getWorkProgressDisplay,
  getWorks,
  TODAY,
  useDataVersion,
} from "@/lib/repository";
import { useAccess } from "@/lib/access";
import { fmtDate, fmtDateShort, fmtPct } from "@/lib/format";
import type { Work } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel — Terrano Obras" },
      {
        name: "description",
        content: "Visão executiva das obras ativas, valores, avanço físico e alertas.",
      },
      { property: "og:title", content: "Painel — Terrano Obras" },
      {
        property: "og:description",
        content: "Visão executiva das obras ativas, valores, avanço físico e alertas.",
      },
    ],
  }),
  component: Dashboard,
});

const compactBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "warning";
}) {
  return (
    <div
      className={cn(
        "panel p-4 sm:p-5",
        tone === "warning" && "border-l-4 border-l-warning rounded-l-none",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "num mt-1 text-2xl font-bold tracking-tight sm:text-[1.7rem]",
          tone === "warning" ? "text-warning-foreground" : "text-brand",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

/** One short label instead of the long technical coverage text. */
function Situation({ work }: { work: Work }) {
  const progress = getMeasurementProgress(work.id);
  const display = getWorkProgressDisplay(work);
  const chip = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";
  if (!progress.summaries.length)
    return <span className={cn(chip, "bg-muted text-muted-foreground")}>Sem orçamento</span>;
  if (progress.unreconciled || !display.comparable)
    return (
      <span
        title={display.coverage}
        className={cn(chip, "bg-warning-soft text-warning-foreground")}
      >
        {progress.unreconciled ? "Revisão a conferir" : "Base incompleta"}
      </span>
    );
  return <StatusBadge status={work.status} />;
}

function Dashboard() {
  useDataVersion();
  const { canWriteWork } = useAccess();
  const [newReport, setNewReport] = useState(false);
  const active = getWorks().filter((w) => w.status !== "concluida");
  const progress = active.map((w) => getMeasurementProgress(w.id));
  const total = progress.reduce((sum, p) => sum + p.total, 0);
  const executed = progress.reduce((sum, p) => sum + p.executed, 0);
  const today = getReports().filter((r) => r.date === TODAY);
  const alerts = getBudgetAlerts();
  const weekday = new Date(TODAY + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long" });

  return (
    <>
      <AppShellHeader
        eyebrow={`${weekday} · ${fmtDate(TODAY)}`}
        title="Painel das obras"
        actions={
          active.some((w) => canWriteWork(w.id)) && (
            <Button onClick={() => setNewReport(true)}>
              <Plus className="size-4" /> Novo diário
            </Button>
          )
        }
      />
      {newReport && <NewReportDialog open onOpenChange={setNewReport} />}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Valor orçado"
          value={compactBRL.format(total)}
          hint={`${active.length} obras ativas`}
        />
        <Stat
          label="Executado aprovado"
          value={compactBRL.format(executed)}
          hint={
            total ? `${fmtPct((executed / total) * 100, 2)} do orçado` : "Sem orçamento aprovado"
          }
        />
        <Stat
          label="Diários hoje"
          value={String(today.length)}
          hint={`${today.filter((r) => r.status === "rascunho").length} em rascunho`}
        />
        <Stat
          label="Precisa de atenção"
          value={String(alerts.length)}
          hint={alerts.length ? "alertas abertos" : "tudo em dia"}
          {...(alerts.length ? { tone: "warning" as const } : {})}
        />
      </div>

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <BudgetAlerts />
          <Panel
            title="Obras em andamento"
            action={
              <Link to="/obras" className="text-xs font-medium text-primary hover:underline">
                Ver todas
              </Link>
            }
            className="[&>div:last-child]:p-0"
          >
            <ul className="divide-y">
              {active.map((w) => {
                const last = getLastReportDate(w.id);
                const display = getWorkProgressDisplay(w);
                return (
                  <li key={w.id}>
                    <Link
                      to="/obras/$id"
                      params={{ id: w.id }}
                      aria-label={`Abrir ${w.name}`}
                      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 hover:bg-muted/50 md:grid-cols-[minmax(10rem,1.4fr)_minmax(7rem,1fr)_auto_3rem_1rem]"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{w.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{w.location}</div>
                      </div>
                      <div className="col-span-2 min-w-0 md:col-span-1 md:row-start-1 md:col-start-2">
                        <div className="mb-1 flex items-baseline justify-between text-xs">
                          <span className="num text-sm font-semibold">
                            {getMeasurementProgress(w.id).summaries.length ? display.actual : "—"}
                          </span>
                          {display.comparable && (
                            <span className="num text-muted-foreground">
                              previsto {display.planned}
                            </span>
                          )}
                        </div>
                        <ProgressBar
                          value={display.actualKnown ? w.actual_progress : 0}
                          {...(display.comparable ? { planned: w.planned_progress } : {})}
                          status={w.status}
                        />
                      </div>
                      <div className="row-start-1 col-start-2 md:col-start-3">
                        <Situation work={w} />
                      </div>
                      <span className="num hidden text-xs text-muted-foreground md:block">
                        {last ? fmtDateShort(last) : "—"}
                      </span>
                      <ChevronRight className="hidden size-4 text-muted-foreground group-hover:text-primary md:block" />
                    </Link>
                  </li>
                );
              })}
              {!active.length && (
                <li className="px-5 py-4 text-sm text-muted-foreground">Nenhuma obra ativa.</li>
              )}
            </ul>
          </Panel>
        </div>
        <Panel title="Atividade recente">
          <ActivityList
            items={getActivities().slice(0, 7)}
            workName={(id) => getWork(id)?.name ?? ""}
          />
        </Panel>
      </div>
    </>
  );
}
