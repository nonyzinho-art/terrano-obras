import { useState } from "react";
import { useAccess } from "@/lib/access";
import { NewWorkDialog } from "@/components/app/NewWorkDialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Wrench, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { ProgressBar, StatusBadge } from "@/components/app/bits";
import {
  getLastReportDate,
  getOpenIssues,
  getRunningServicesCount,
  getWorks,
  useDataVersion,
} from "@/lib/repository";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/obras/")({
  head: () => ({
    meta: [
      { title: "Minhas Obras — Terrano Obras" },
      {
        name: "description",
        content: "Todas as obras com status, avanço físico, serviços em execução e pendências.",
      },
      { property: "og:title", content: "Minhas Obras — Terrano Obras" },
      {
        property: "og:description",
        content: "Todas as obras com status, avanço físico e pendências.",
      },
    ],
  }),
  component: Obras,
});

function Obras() {
  useDataVersion();
  const [adding, setAdding] = useState(false);
  const { profile } = useAccess();
  const canCreate = profile?.active && profile.role !== "engenheiro";
  return (
    <>
      <PageHeader
        eyebrow="Obras"
        title="Minhas Obras"
        description="Selecione uma obra para ver cronograma, diário e fotos."
        actions={
          canCreate ? (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Adicionar obra
            </Button>
          ) : undefined
        }
      />
      {adding && <NewWorkDialog onClose={() => setAdding(false)} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {getWorks().map((w) => {
          const last = getLastReportDate(w.id);
          const issues = getOpenIssues(w.id).length;
          return (
            <Link
              key={w.id}
              to="/obras/$id"
              params={{ id: w.id }}
              className="panel group flex flex-col p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold group-hover:text-primary">{w.name}</h3>
                  <p className="text-xs text-muted-foreground">{w.location}</p>
                </div>
                <StatusBadge status={w.status} />
              </div>
              <div className="mt-6 flex items-baseline justify-between">
                <span className="num text-3xl font-semibold tracking-tight">
                  {w.actual_progress}%
                </span>
                <span className="num text-xs text-muted-foreground">
                  Planejado {w.planned_progress}%
                </span>
              </div>
              <ProgressBar
                className="mt-2"
                value={w.actual_progress}
                planned={w.planned_progress}
                status={w.status}
              />
              <dl className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-xs">
                <div>
                  <dt className="flex items-center gap-1 text-muted-foreground">
                    <CalendarDays className="size-3" />
                    Último diário
                  </dt>
                  <dd className="num mt-1 font-medium">{last ? fmtDate(last) : "—"}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-muted-foreground">
                    <Wrench className="size-3" />
                    Em execução
                  </dt>
                  <dd className="num mt-1 font-medium">{getRunningServicesCount(w.id)} serviços</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-muted-foreground">
                    <AlertTriangle className="size-3" />
                    Pendências
                  </dt>
                  <dd className={`num mt-1 font-medium ${issues ? "text-warning-foreground" : ""}`}>
                    {issues}
                  </dd>
                </div>
              </dl>
            </Link>
          );
        })}
      </div>
    </>
  );
}
