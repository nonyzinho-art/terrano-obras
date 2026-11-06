import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Panel } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccess } from "@/lib/access";
import { getWorks, TODAY, useDataVersion } from "@/lib/repository";
import { quoteRows, quoteStatus, quoteError, type Quote } from "@/lib/quotes";
import { fmtDate } from "@/lib/format";
import { normalizeSearch } from "@/lib/search";
import { cn } from "@/lib/utils";
import { NewQuoteDialog } from "@/components/app/NewQuoteDialog";

export const Route = createFileRoute("/cotacoes/")({
  head: () => ({ meta: [{ title: "Cotações — Terrano Obras" }] }),
  component: Quotes,
});

const STATUS_STYLE: Record<Quote["status"], string> = {
  aberta: "bg-primary-soft text-primary",
  em_aprovacao: "bg-warning-soft text-warning-foreground",
  aprovada: "bg-success-soft text-primary",
  cancelada: "bg-muted text-muted-foreground",
};

const GRID = "md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_9rem_1rem]";

function Quotes() {
  useDataVersion();
  const { profile, canWriteWork } = useAccess();
  const [adding, setAdding] = useState(false);
  const [work, setWork] = useState("");
  const [search, setSearch] = useState("");
  const works = getWorks();
  const workName = (id: string) => works.find((w) => w.id === id)?.name ?? "Obra";
  const query = useQuery({
    queryKey: ["quotes", profile?.user_id],
    queryFn: () => quoteRows<Quote>("quote_requests"),
  });
  const term = normalizeSearch(search);
  const data = [...(query.data ?? [])]
    .filter(
      (q) =>
        (!work || q.work_id === work) &&
        normalizeSearch(`${workName(q.work_id)} ${q.name}`).includes(term),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <>
      <PageHeader
        eyebrow="Contratação"
        title="Cotações"
        actions={
          works.some((w) => canWriteWork(w.id) && w.status !== "concluida") && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Nova cotação
            </Button>
          )
        }
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <select
          aria-label="Filtrar obra"
          className="h-10 rounded-md border bg-card px-3 text-sm"
          value={work}
          onChange={(e) => setWork(e.target.value)}
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
            aria-label="Buscar cotação"
            placeholder="Buscar obra ou cotação"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <Panel
        title={`${data.length} ${data.length === 1 ? "cotação" : "cotações"}`}
        className="[&>div:last-child]:p-0"
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={cn("size-3.5", query.isFetching && "animate-spin")} />
            Atualizar propostas
          </Button>
        }
      >
        {query.isPending ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Carregando cotações…</p>
        ) : query.error ? (
          <p role="alert" className="px-5 py-4 text-sm text-danger">
            {quoteError(query.error)}
          </p>
        ) : !data.length ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            {query.data?.length
              ? "Nenhuma cotação para esta seleção."
              : "Nenhuma cotação cadastrada ainda."}
          </p>
        ) : (
          <>
            <div
              className={`hidden gap-4 border-b px-5 py-2.5 text-xs text-muted-foreground md:grid ${GRID}`}
            >
              <span>Cotação</span>
              <span>Prazo para propostas</span>
              <span>Situação</span>
              <span />
            </div>
            <ul className="divide-y">
              {data.map((q) => {
                const late = q.status === "aberta" && q.deadline < TODAY;
                return (
                  <li key={q.id}>
                    <Link
                      to="/cotacoes/$id"
                      params={{ id: q.id }}
                      className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-muted/50 ${GRID}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs text-muted-foreground">
                          {workName(q.work_id)}
                        </div>
                        <div className="truncate font-medium">{q.name}</div>
                      </div>
                      <span
                        className={cn(
                          "num text-sm max-md:col-start-1",
                          late ? "text-danger" : "text-muted-foreground",
                        )}
                      >
                        {fmtDate(q.deadline)}
                        {late && <span className="ml-1 text-xs">· prazo encerrado</span>}
                      </span>
                      <span className="max-md:col-start-2 max-md:row-start-1">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
                            STATUS_STYLE[q.status],
                          )}
                        >
                          {quoteStatus[q.status]}
                        </span>
                      </span>
                      <ChevronRight className="hidden size-4 text-muted-foreground group-hover:text-primary md:block" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>
      {adding && (
        <NewQuoteDialog
          onClose={() => {
            setAdding(false);
            void query.refetch();
          }}
        />
      )}
    </>
  );
}
