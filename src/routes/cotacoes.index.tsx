import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/lib/access";
import { getWork, getWorks } from "@/lib/repository";
import { quoteRows, quoteStatus, quoteError, type Quote } from "@/lib/quotes";
import { fmtDate } from "@/lib/format";
import { NewQuoteDialog } from "@/components/app/NewQuoteDialog";
export const Route = createFileRoute("/cotacoes/")({
  head: () => ({ meta: [{ title: "Cotações — Terrano Obras" }] }),
  component: Quotes,
});
function Quotes() {
  const { profile, canWriteWork } = useAccess();
  const [adding, setAdding] = useState(false);
  const [work, setWork] = useState("");
  const query = useQuery({
    queryKey: ["quotes", profile?.user_id],
    queryFn: () => quoteRows<Quote>("quote_requests"),
  });
  const data = [...(query.data ?? [])]
    .filter((q) => !work || q.work_id === work)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <>
      <PageHeader
        eyebrow="Contratação"
        title="Cotações"
        description="Receba propostas, compare fornecedores e encaminhe para aprovação."
        actions={
          <Button
            disabled={!getWorks().some((w) => canWriteWork(w.id) && w.status !== "concluida")}
            onClick={() => setAdding(true)}
          >
            Nova cotação
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          aria-label="Filtrar obra"
          className="h-9 rounded border bg-card px-3 text-sm"
          value={work}
          onChange={(e) => setWork(e.target.value)}
        >
          <option value="">Todas as obras</option>
          {getWorks().map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Atualizar propostas
        </Button>
      </div>
      {query.isPending ? (
        <p>Carregando cotações…</p>
      ) : query.error ? (
        <p role="alert">{quoteError(query.error)}</p>
      ) : !data.length ? (
        <p className="panel p-8 text-center text-sm text-muted-foreground">
          Nenhuma cotação encontrada. Crie uma cotação para gerar os convites dos fornecedores.
        </p>
      ) : (
        <div className="space-y-3">
          {data.map((q) => (
            <Link
              key={q.id}
              to="/cotacoes/$id"
              params={{ id: q.id }}
              className="panel flex flex-wrap items-center justify-between gap-3 p-5 hover:border-primary/40"
            >
              <div>
                <h2 className="font-semibold text-primary">{q.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {getWork(q.work_id)?.name} · Prazo: {fmtDate(q.deadline)}
                </p>
              </div>
              <span className="rounded bg-success-soft px-3 py-1 text-sm text-primary">
                {quoteStatus[q.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
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
