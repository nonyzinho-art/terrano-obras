import { canWriteWork } from "@/lib/access";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Search, Upload } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Panel } from "@/components/app/bits";
import { BudgetStatusBadge } from "@/components/app/BudgetStatusBadge";
import { getWorks, getBudgetsByWork, getBudgetSummary, useDataVersion } from "@/lib/repository";
import { BudgetImportDialog } from "@/components/app/BudgetImportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtBRL, fmtDate } from "@/lib/format";
import { normalizeSearch } from "@/lib/search";

export const Route = createFileRoute("/orcamentos/")({
  validateSearch: (s: Record<string, unknown>): { obra?: string | undefined } => ({
    obra: typeof s["obra"] === "string" ? s["obra"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Orçamentos — Terrano Obras" },
      { name: "description", content: "Orçamentos organizados por obra e frente de serviço." },
    ],
  }),
  component: Orcamentos,
});

const GRID = "md:grid-cols-[minmax(0,1.8fr)_5rem_minmax(0,1.1fr)_7rem_6rem_1rem]";

function Orcamentos() {
  useDataVersion();
  const { obra } = Route.useSearch();
  const works = getWorks();
  const [importing, setImporting] = useState(false);
  const [workId, setWorkId] = useState(obra && works.some((w) => w.id === obra) ? obra : "");
  const [query, setQuery] = useState("");
  const term = normalizeSearch(query);
  const rows = works
    .filter((w) => !workId || w.id === workId)
    .flatMap((work) =>
      getBudgetsByWork(work.id).map((budget) => ({
        work,
        budget,
        summary: getBudgetSummary(budget.id),
      })),
    )
    .filter(({ work, budget }) => normalizeSearch(`${work.name} ${budget.name}`).includes(term))
    .sort(
      (a, b) =>
        a.work.name.localeCompare(b.work.name) ||
        a.budget.name.localeCompare(b.budget.name) ||
        (b.budget.revision ?? 1) - (a.budget.revision ?? 1),
    );
  const total = rows.reduce((sum, r) => sum + r.summary.total, 0);
  return (
    <>
      <PageHeader
        eyebrow="Gestão de custos"
        title="Orçamentos"
        actions={
          works.some((w) => canWriteWork(w.id)) && (
            <Button onClick={() => setImporting(true)}>
              <Upload className="size-4" />
              Importar orçamento
            </Button>
          )
        }
      />
      {importing && <BudgetImportDialog open onOpenChange={setImporting} />}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <select
          aria-label="Obra dos orçamentos"
          className="h-10 rounded-md border bg-card px-3 text-sm"
          value={workId}
          onChange={(e) => setWorkId(e.target.value)}
        >
          <option value="">Todas as obras</option>
          {works.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="bg-card pl-9"
            aria-label="Buscar orçamento"
            placeholder="Buscar obra ou orçamento"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <Panel
        title={`${rows.length} ${rows.length === 1 ? "orçamento" : "orçamentos"} · ${fmtBRL(total)}`}
        className="[&>div:last-child]:p-0"
      >
        <div
          className={`hidden gap-4 border-b px-5 py-2.5 text-xs text-muted-foreground md:grid ${GRID}`}
        >
          <span>Orçamento</span>
          <span>Itens</span>
          <span>Valor</span>
          <span>Situação</span>
          <span>Atualizado</span>
          <span />
        </div>
        {!rows.length && (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            {works.length ? "Nenhum orçamento para esta seleção." : "Nenhuma obra cadastrada."}
          </p>
        )}
        <ul className="divide-y">
          {rows.map(({ work, budget, summary }) => (
            <li key={budget.id}>
              <Link
                to="/orcamentos/$obraId/$orcamentoId"
                params={{ obraId: work.id, orcamentoId: budget.id }}
                className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-muted/50 ${GRID}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs text-muted-foreground">{work.name}</div>
                  <div className="truncate font-medium">
                    {budget.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      rev. {budget.revision ?? 1}
                    </span>
                  </div>
                </div>
                <span className="num text-sm text-muted-foreground max-md:hidden">
                  {summary.itemCount}
                </span>
                <div className="num min-w-0 max-md:col-start-1">
                  <span className="font-semibold text-brand">{fmtBRL(summary.total)}</span>
                  {summary.pendingCount > 0 && (
                    <span className="block text-xs text-warning-foreground">
                      parcial · {summary.pendingCount} pendentes
                    </span>
                  )}
                </div>
                <span className="max-md:col-start-2 max-md:row-start-1">
                  <BudgetStatusBadge status={budget.status} />
                </span>
                <span className="num text-xs text-muted-foreground max-md:hidden">
                  {fmtDate(budget.updated_at)}
                </span>
                <ChevronRight className="hidden size-4 text-muted-foreground group-hover:text-primary md:block" />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
      <p className="mt-4 text-xs text-muted-foreground">
        Cada importação cria uma nova revisão e preserva as anteriores.
      </p>
    </>
  );
}
