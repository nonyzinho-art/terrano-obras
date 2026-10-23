import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, HardHat } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/lib/access";
import { getWorks, useDataVersion } from "@/lib/repository";
import { quoteRows, quoteStatus, quoteError, type Quote } from "@/lib/quotes";
import { fmtDate } from "@/lib/format";
import { NewQuoteDialog } from "@/components/app/NewQuoteDialog";
export const Route = createFileRoute("/cotacoes/")({
  head: () => ({ meta: [{ title: "Cotações — Terrano Obras" }] }),
  component: Quotes,
});
function Quotes() {
  useDataVersion();
  const { profile, canWriteWork } = useAccess();
  const [adding, setAdding] = useState(false);
  const [work, setWork] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const works = getWorks().filter((w) => !work || w.id === work);
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
        description="Selecione uma obra para consultar suas cotações, comparar propostas e acompanhar as aprovações."
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
      ) : !works.length ? (
        <p className="panel p-8 text-center text-sm text-muted-foreground">
          Nenhuma obra encontrada.
        </p>
      ) : (
        <Accordion
          type="multiple"
          value={expanded}
          onValueChange={setExpanded}
          className="space-y-4"
        >
          {works.map((w) => {
            const quotes = data.filter((q) => q.work_id === w.id);
            return (
              <AccordionItem key={w.id} value={w.id} className="panel overflow-hidden border">
                <AccordionTrigger className="px-5 py-5 hover:no-underline hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary">
                  <span className="flex items-center gap-3 text-left">
                    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-success-soft text-primary">
                      <HardHat className="size-5" />
                    </span>
                    <span>
                      <span className="block text-base font-semibold">{w.name}</span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {w.location} · {quotes.length}{" "}
                        {quotes.length === 1 ? "cotação" : "cotações"}
                      </span>
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="border-t px-4 pt-3 pb-4 sm:px-5">
                  <div className="space-y-2">
                    {quotes.map((q) => (
                      <Link
                        key={q.id}
                        to="/cotacoes/$id"
                        params={{ id: q.id }}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-success-soft/40 focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <div>
                          <h3 className="font-semibold text-primary">{q.name}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Prazo: {fmtDate(q.deadline)}
                          </p>
                        </div>
                        <span className="flex items-center gap-3">
                          <span className="rounded bg-success-soft px-3 py-1 text-sm text-primary">
                            {quoteStatus[q.status]}
                          </span>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </span>
                      </Link>
                    ))}
                  </div>
                  {!quotes.length && (
                    <p className="py-5 text-sm text-muted-foreground">
                      Nenhuma cotação cadastrada para esta obra.
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
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
