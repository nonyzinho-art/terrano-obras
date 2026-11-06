import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { Panel } from "@/components/app/bits";
import { Input } from "@/components/ui/input";
import {
  getWorks,
  getMeasurementProgress,
  getMeasurements,
  useDataVersion,
} from "@/lib/repository";
import { fmtBRL, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/medicoes")({
  head: () => ({ meta: [{ title: "Medições — Terrano Obras" }] }),
  component: Measurements,
});
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
        description="Selecione o orçamento para lançar, conferir ou consultar medições. Os registros são os mesmos disponíveis dentro de Orçamentos."
      />
      <div className="mb-5 flex flex-wrap gap-3">
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
        <Input
          className="max-w-md"
          aria-label="Buscar orçamento para medir"
          placeholder="Buscar obra ou orçamento"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!rows.length && (
        <Panel>
          <p className="text-sm text-muted-foreground">
            Nenhum orçamento aprovado encontrado para esta seleção. Importe ou aprove um orçamento
            para começar.
          </p>
        </Panel>
      )}
      <div className="space-y-4">
        {rows.map((row) => (
          <Panel key={row.budget.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">{row.work.name}</p>
                <h2 className="mt-1 font-semibold">{row.budget.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.history.filter((m) => m.status === "rascunho").length} em rascunho ·{" "}
                  {row.history.filter((m) => m.status === "aprovada").length} aprovadas · Executado
                  aprovado {fmtBRL(row.executed)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.budget.planned_start && row.budget.planned_end
                    ? `Planejamento: ${fmtDate(row.budget.planned_start)} a ${fmtDate(row.budget.planned_end)}`
                    : "Planejamento ainda não definido"}
                </p>
              </div>
              <Link
                to="/orcamentos/$obraId/$orcamentoId"
                params={{ obraId: row.work.id, orcamentoId: row.budget.id }}
                search={{ aba: "medicoes" }}
                className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Abrir medições
              </Link>
            </div>
            {row.history
              .filter((m) => m.status === "rascunho")
              .map((m) => (
                <Link
                  key={m.id}
                  to="/orcamentos/$obraId/$orcamentoId"
                  params={{ obraId: row.work.id, orcamentoId: row.budget.id }}
                  search={{ aba: "medicoes", medicao: m.id }}
                  className="mt-3 block rounded-md border p-3 text-sm text-primary hover:bg-muted"
                >
                  Conferir rascunho · {fmtDate(m.period_start)} a {fmtDate(m.period_end)}
                </Link>
              ))}
          </Panel>
        ))}
      </div>
    </>
  );
}
