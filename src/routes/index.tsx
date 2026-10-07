import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { AppShellHeader } from "@/components/app/headers";
import { ActivityList, Panel, ProgressBar, StatusBadge } from "@/components/app/bits";
import {
  getActivities, getLastReportDate, getOpenIssues, getReports, getWork, getWorks, TODAY, useDataVersion,
} from "@/lib/repository";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Terrano Obras" },
      { name: "description", content: "Visão executiva das obras ativas, avanço físico e atividade recente." },
      { property: "og:title", content: "Dashboard — Terrano Obras" },
      { property: "og:description", content: "Visão executiva das obras ativas, avanço físico e atividade recente." },
    ],
  }),
  component: Dashboard,
});

function Stat({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: "warning" | "danger" | undefined }) {
  return (
    <div className="panel p-5">
      <div className="eyebrow">{label}</div>
      <div className={cn("num mt-2 text-3xl font-semibold tracking-tight", tone === "warning" && "text-warning-foreground", tone === "danger" && "text-danger")}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function Dashboard() {
  useDataVersion();
  const works = getWorks();
  const active = works.filter((w) => w.status !== "concluida");
  const attention = works.filter((w) => w.status === "atencao" || w.status === "atrasada");
  const today = getReports().filter((r) => r.date === TODAY);
  const open = getOpenIssues();

  return (
    <>
      <AppShellHeader eyebrow={`Hoje · ${fmtDate(TODAY)}`} title="Dashboard" description="Panorama das obras em execução." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Obras ativas" value={active.length} hint={`${works.length} obras cadastradas`} />
        <Stat label="Obras com atenção" value={attention.length} hint="Desvio físico ou atraso" tone="warning" />
        <Stat label="Diários hoje" value={today.length} hint={`${today.filter((r) => r.status === "rascunho").length} em rascunho`} />
        <Stat label="Pendências abertas" value={open.length} hint="Em todas as obras" tone={open.length > 5 ? "danger" : undefined} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel title="Obras em andamento" action={<Link to="/obras" className="text-xs font-medium text-primary hover:underline">Ver todas</Link>} className="[&>div:last-child]:p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  {["Obra", "Status", "Avanço físico", "Último registro", ""].map((h) => <th key={h} className="eyebrow px-5 py-2.5 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {active.map((w) => {
                  const last = getLastReportDate(w.id);
                  const dev = w.actual_progress - w.planned_progress;
                  return (
                    <tr key={w.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className={cn("h-8 w-1 rounded-full", w.status === "atrasada" ? "bg-danger" : w.status === "atencao" ? "bg-warning" : "bg-success")} />
                          <div>
                            <div className="font-medium">{w.name}</div>
                            <div className="text-xs text-muted-foreground">{w.location}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><StatusBadge status={w.status} /></td>
                      <td className="px-5 py-3.5 min-w-[200px]">
                        <div className="mb-1.5 flex items-baseline justify-between text-xs">
                          <span className="num font-semibold text-sm">{w.actual_progress}%</span>
                          <span className={cn("num", dev < 0 ? "text-danger" : "text-primary")}>{dev > 0 ? "+" : ""}{dev} p.p. vs plan.</span>
                        </div>
                        <ProgressBar value={w.actual_progress} planned={w.planned_progress} status={w.status} />
                      </td>
                      <td className="num px-5 py-3.5 text-muted-foreground">{last ? fmtDate(last) : "—"}</td>
                      <td className="px-5 py-3.5 text-right">
                        <Link to="/obras/$id" params={{ id: w.id }} className="inline-grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-primary" aria-label={`Abrir ${w.name}`}>
                          <ArrowUpRight className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Atividade recente">
          <ActivityList items={getActivities().slice(0, 7)} workName={(id) => getWork(id)?.name ?? ""} />
        </Panel>
      </div>
    </>
  );
}
