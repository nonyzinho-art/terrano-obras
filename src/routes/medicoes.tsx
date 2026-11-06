import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Panel, ProgressBar } from "@/components/app/bits";
import { Input } from "@/components/ui/input";
import {
  getWorks,
  getMeasurementProgress,
  getMeasurements,
  useDataVersion,
} from "@/lib/repository";
import { fmtBRL, fmtDate, fmtDateShort, fmtPct } from "@/lib/format";

export const Route = createFileRoute("/medicoes")({
  head: () => ({ meta: [{ title: "Medições — Terrano Obras" }] }),
  component: Measurements,
});

const chip = "inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

function Measurements() {
  useDataVersion();
  const [workId, setWorkId] = useState("");
  const [query, setQuery] = useState("");
  const works = getWorks().filter((w) => !workId || w.id === workId);
  const rows = works
    .flatMap((work) =>
      getMeasurementProgress(work.id).summaries.map((summary) => ({
        ...summary,
        work,
        history: getMeasurements(summary.budget.id),
      })),
    )
    .filter((row) =>
      (row.work.name + " " + row.budget.name)
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
    );
  return (
    <>
      <PageHeader
        eyebrow="Acompanhamento"
        title="Medições"
        description="Escolha o orçamento para lançar, conferir ou consultar medições."
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <select
          aria-label="Obra das medições"
          className="h-10 rounded-md border bg-card px-3 text-sm"
          value={workId}
          onChange={(e) => setWorkId(e.target.value)}
        >
          <option value="">Todas as obras</option>
          {getWorks().map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="bg-card pl-9"
            aria-label="Buscar orçamento para medir"
            placeholder="Buscar obra ou orçamento"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <Panel title={`Orçamentos aprovados (${rows.length})`} className="[&>div:last-child]:p-0">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_1rem] gap-4 border-b px-5 py-2.5 text-xs text-muted-foreground md:grid">
          <span>Orçamento</span>
          <span>Planejamento</span>
          <span>Medições</span>
          <span>Executado aprovado</span>
          <span />
        </div>
        {!rows.length && (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            Nenhum orçamento aprovado para esta seleção. Importe ou aprove um orçamento para
            começar.
          </p>
        )}
        <ul className="divide-y">
          {rows.map((row) => {
            const drafts = row.history.filter((m) => m.status === "rascunho");
            const approved = row.history.filter((m) => m.status === "aprovada").length;
            return (
              <li key={row.budget.id}>
                <Link
                  to="/orcamentos/$obraId/$orcamentoId"
                  params={{ obraId: row.work.id, orcamentoId: row.budget.id }}
                  search={{ aba: "medicoes" }}
                  aria-label={`Abrir medições de ${row.budget.name}`}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 hover:bg-muted/50 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_1rem]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs text-muted-foreground">{row.work.name}</div>
                    <div className="truncate font-medium">{row.budget.name}</div>
                  </div>
                  <span className="num text-xs text-muted-foreground max-md:hidden">
                    {row.budget.planned_start && row.budget.planned_end
                      ? `${fmtDateShort(row.budget.planned_start)} a ${fmtDate(row.budget.planned_end)}`
                      : "Sem datas"}
                  </span>
                  <span className="flex flex-wrap gap-1.5 max-md:col-start-2 max-md:row-start-1">
                    {drafts.length > 0 && (
                      <span className={`${chip} bg-warning-soft text-warning-foreground`}>
                        {drafts.length} em rascunho
                      </span>
                    )}
                    <span className={`${chip} bg-muted text-muted-foreground`}>
                      {approved} {approved === 1 ? "aprovada" : "aprovadas"}
                    </span>
                  </span>
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                      <span className="num font-semibold text-brand">{fmtBRL(row.executed)}</span>
                      <span className="num text-muted-foreground">{fmtPct(row.actual, 1)}</span>
                    </div>
                    <ProgressBar value={row.actual} />
                  </div>
                  <ChevronRight className="hidden size-4 text-muted-foreground group-hover:text-primary md:block" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
