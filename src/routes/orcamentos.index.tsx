import { canWriteWork } from "@/lib/access";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, HardHat } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BudgetStatusBadge } from "@/components/app/BudgetStatusBadge";
import { getWorks, getBudgetsByWork, getBudgetSummary, useDataVersion } from "@/lib/repository";
import { BudgetImportDialog } from "@/components/app/BudgetImportDialog";
import { Button } from "@/components/ui/button";
import { isCloudMode } from "@/lib/repository";
import { fmtBRL, fmtDate } from "@/lib/format";

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

function Orcamentos() {
  useDataVersion();
  const { obra } = Route.useSearch();
  const works = getWorks();
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState<string[]>(
    obra && works.some((w) => w.id === obra) ? [obra] : [],
  );
  return (
    <>
      <PageHeader
        eyebrow="Gestão de custos"
        title="Orçamentos"
        description="Selecione uma obra e abra o orçamento da frente desejada."
      />
      <div className="mb-5">
        <Button
          disabled={!works.some((w) => canWriteWork(w.id))}
          onClick={() => setImporting(true)}
        >
          Importar orçamento
        </Button>
        {!isCloudMode() && (
          <p className="mt-2 text-xs text-muted-foreground">
            Você pode conferir a prévia. Entre no sistema para salvar o orçamento.
          </p>
        )}
      </div>
      {importing && <BudgetImportDialog open onOpenChange={setImporting} />}
      <Accordion type="multiple" value={expanded} onValueChange={setExpanded} className="space-y-4">
        {works.map((work) => {
          const budgets = getBudgetsByWork(work.id);
          return (
            <AccordionItem key={work.id} value={work.id} className="panel overflow-hidden border">
              <AccordionTrigger className="px-5 py-5 hover:no-underline hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary">
                <span className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-success-soft text-primary">
                    <HardHat className="size-5" />
                  </span>
                  <span>
                    <span className="block text-base font-semibold">{work.name}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {work.location} · {budgets.length} frentes
                    </span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="border-t px-4 pt-3 pb-4 sm:px-5">
                <div className="space-y-2">
                  {budgets.map((budget) => {
                    const summary = getBudgetSummary(budget.id);
                    return (
                      <Link
                        key={budget.id}
                        to="/orcamentos/$obraId/$orcamentoId"
                        params={{ obraId: work.id, orcamentoId: budget.id }}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-success-soft/40 focus-visible:outline-2 focus-visible:outline-primary xl:grid-cols-[minmax(140px,1fr)_80px_140px_120px_120px_16px]"
                      >
                        <span className="font-semibold text-primary">
                          {budget.name}
                          {budget.revision ? ` · Revisão ${budget.revision}` : ""}
                        </span>
                        <span className="text-xs text-muted-foreground sm:text-sm">
                          {summary.itemCount} {summary.itemCount === 1 ? "item" : "itens"}
                        </span>
                        <span className="num text-sm font-semibold">
                          {fmtBRL(summary.total)}
                          {summary.pendingCount > 0 && (
                            <span className="block text-xs font-normal text-amber-700">
                              Valor parcial · {summary.pendingCount} pendentes
                            </span>
                          )}
                        </span>
                        <span>
                          <BudgetStatusBadge status={budget.status} />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          <span className="block text-[10px] uppercase">Atualizado em</span>
                          {fmtDate(budget.updated_at)}
                        </span>
                        <ChevronRight className="size-4 justify-self-end text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
                {!budgets.length && (
                  <p className="py-5 text-sm text-muted-foreground">
                    Nenhum orçamento cadastrado para esta obra.
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      {!works.length && (
        <p className="panel p-8 text-center text-muted-foreground">Nenhuma obra cadastrada.</p>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        {isCloudMode()
          ? "Orçamentos importados da sua conta. Revisões anteriores são preservadas."
          : "Dados de demonstração. Status de cotação e datas são ilustrativos."}
      </p>
    </>
  );
}
