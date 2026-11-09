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
import { groupRevisions } from "@/lib/budget-revisions";

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

const GRID = "md:grid-cols-[minmax(0,1.8fr)_4rem_minmax(9rem,1.1fr)_7rem_6rem_1rem]";

function Orcamentos() {
  useDataVersion();
  const { obra } = Route.useSearch();
  const works = getWorks();
  const [importing, setImporting] = useState(false);
  const [workId, setWorkId] = useState(obra && works.some((w) => w.id === obra) ? obra : "");
  const [query, setQuery] = useState("");
  const term = normalizeSearch(query);
  const groups = works
    .filter((w) => !workId || w.id === workId)
    .map((work) => {
      const matchesWork = normalizeSearch(work.name).includes(term);
      const families = groupRevisions(getBudgetsByWork(work.id)).filter(
        (f) => matchesWork || normalizeSearch(f[0]!.name).includes(term),
      );
      const total = families.reduce((s, f) => s + getBudgetSummary(f[0]!.id).total, 0);
      return { work, families, total };
    })
    .filter((g) => g.families.length || (workId && !term))
    .sort((a, b) => a.work.name.localeCompare(b.work.name, "pt-BR"));
  const count = groups.reduce((s, g) => s + g.families.length, 0);
  const total = groups.reduce((s, g) => s + g.total, 0);
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
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
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
        <span className="num text-sm text-muted-foreground sm:ml-auto">
          {count} {count === 1 ? "orçamento" : "orçamentos"} · {fmtBRL(total)}
        </span>
      </div>
      {!groups.length && (
        <p className="text-sm text-muted-foreground">
          {works.length ? "Nenhum orçamento para esta seleção." : "Nenhuma obra cadastrada."}
        </p>
      )}
      <div className="space-y-5">
        {groups.map(({ work, families, total: workTotal }) => (
          <Panel
            key={work.id}
            title={work.name}
            action={
              <span className="num text-sm">
                <span className="text-muted-foreground">
                  {families.length} {families.length === 1 ? "orçamento" : "orçamentos"} ·{" "}
                </span>
                <strong className="text-brand">{fmtBRL(workTotal)}</strong>
              </span>
            }
            className="[&>div:last-child]:p-0"
          >
            {!families.length ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                Nenhum orçamento nesta obra.
              </p>
            ) : (
              <>
                <div
                  className={`hidden gap-4 border-b px-5 py-2 text-xs text-muted-foreground md:grid ${GRID}`}
                >
                  <span>Orçamento</span>
                  <span>Itens</span>
                  <span>Valor</span>
                  <span>Situação</span>
                  <span>Atualizado</span>
                  <span />
                </div>
                <ul className="divide-y">
                  {families.map(([budget, ...older]) => {
                    const summary = getBudgetSummary(budget!.id);
                    return (
                      <li key={budget!.id}>
                        <Link
                          to="/orcamentos/$obraId/$orcamentoId"
                          params={{ obraId: work.id, orcamentoId: budget!.id }}
                          className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-muted/50 ${GRID}`}
                        >
                          <div className="min-w-0 break-words font-medium">
                            {budget!.name}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              rev. {budget!.revision ?? 1}
                            </span>
                          </div>
                          <span className="num text-sm text-muted-foreground max-md:hidden">
                            {summary.itemCount}
                          </span>
                          <div className="num min-w-0 max-md:col-start-1">
                            <span className="font-semibold text-brand">
                              {fmtBRL(summary.total)}
                            </span>
                            {summary.pendingCount > 0 && (
                              <span className="block text-xs text-warning-foreground">
                                parcial · {summary.pendingCount} pendentes
                              </span>
                            )}
                          </div>
                          <span className="max-md:col-start-2 max-md:row-start-1">
                            <BudgetStatusBadge status={budget!.status} />
                          </span>
                          <span className="num text-xs text-muted-foreground max-md:hidden">
                            {fmtDate(budget!.updated_at)}
                          </span>
                          <ChevronRight className="hidden size-4 text-muted-foreground group-hover:text-primary md:block" />
                        </Link>
                        {older.length > 0 && (
                          <div className="flex flex-wrap gap-x-3 px-5 pb-3 text-xs text-muted-foreground">
                            Revisões anteriores:
                            {older.map((b) => (
                              <Link
                                key={b.id}
                                to="/orcamentos/$obraId/$orcamentoId"
                                params={{ obraId: work.id, orcamentoId: b.id }}
                                className="text-primary hover:underline"
                              >
                                rev. {b.revision ?? 1} ({fmtDate(b.updated_at)})
                              </Link>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Panel>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Cada importação cria uma nova revisão e preserva as anteriores. Os totais usam só a revisão
        mais recente de cada orçamento.
      </p>
    </>
  );
}
