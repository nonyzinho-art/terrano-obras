import { budgetHierarchy, hiddenByGroup } from "@/lib/budget-hierarchy";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Search } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Panel } from "@/components/app/bits";
import { BudgetStatusBadge } from "@/components/app/BudgetStatusBadge";
import { BUDGET_STATUS_LABEL } from "@/lib/budget-status";
import { Input } from "@/components/ui/input";
import {
  getBudget,
  getBudgetSummary,
  getItemsByBudget,
  getWork,
  useDataVersion,
  isCloudMode,
} from "@/lib/repository";
import { fmtBRL, fmtNum, fmtDate } from "@/lib/format";
import { filterBudgetItems } from "@/lib/budget-filter";
import type { BudgetStatus } from "@/lib/types";

export const Route = createFileRoute("/orcamentos/$obraId/$orcamentoId")({
  head: () => ({ meta: [{ title: "Detalhe do orçamento — Terrano Obras" }] }),
  component: BudgetDetail,
});

function BudgetDetail() {
  useDataVersion();
  const { obraId, orcamentoId } = Route.useParams();
  const work = getWork(obraId);
  const budget = getBudget(obraId, orcamentoId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<BudgetStatus | "">("");
  const [unit, setUnit] = useState("");
  if (!work || !budget)
    return (
      <>
        <PageHeader
          eyebrow="Orçamentos"
          title="Orçamento não encontrado"
          description="Confira a obra e a frente selecionadas."
        />
        <Link to="/orcamentos" className="text-sm text-primary hover:underline">
          Voltar aos orçamentos
        </Link>
      </>
    );
  const items = getItemsByBudget(budget.id);
  const summary = getBudgetSummary(budget.id);
  const filtered = filterBudgetItems(items, query, status, unit);
  const filteredTotal = filtered.reduce(
    (sum, item) => sum + Math.round(item.planned_quantity * item.unit_price * 100) / 100,
    0,
  );
  const units = [...new Set(items.map((item) => item.unit))].sort();
  return (
    <>
      <Link
        to="/orcamentos"
        search={{ obra: work.id }}
        className="mb-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        Voltar aos orçamentos
      </Link>
      <PageHeader
        eyebrow={work.name}
        title={budget.name}
        description="Orçamento para acompanhamento, organizado pelos grupos da planilha."
        actions={<BudgetStatusBadge status={budget.status} />}
      />
      <Panel className="mb-5">
        <dl className="grid grid-cols-2 gap-5 lg:grid-cols-5">
          <Summary label="Obra" value={work.name} />
          <Summary label="Frente" value={budget.name} />
          <Summary
            label={summary.pendingCount ? "Valor parcial" : "Valor total"}
            value={fmtBRL(summary.total)}
          />
          <Summary label="Quantidade de itens" value={String(summary.itemCount)} />
          <Summary label="Última atualização" value={fmtDate(budget.updated_at)} />
        </dl>
      </Panel>
      <Panel title="Serviços e insumos">
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px_150px]">
          <label className="text-xs font-medium">
            Buscar código ou serviço
            <div className="relative mt-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Digite código, serviço ou insumo"
                className="pl-9"
              />
            </div>
          </label>
          <label className="text-xs font-medium">
            Status
            <select
              className="mt-1 h-9 w-full rounded-md border bg-card px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as BudgetStatus | "")}
            >
              <option value="">Todos os status</option>
              {Object.entries(BUDGET_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            Unidade
            <select
              className="mt-1 h-9 w-full rounded-md border bg-card px-3 text-sm"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="">Todas as unidades</option>
              {units.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <span>
            {filtered.length} de {items.length} itens
          </span>
          {(query || status || unit) && (
            <button
              className="text-primary hover:underline"
              onClick={() => {
                setQuery("");
                setStatus("");
                setUnit("");
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <caption className="sr-only">
              Itens do orçamento de {budget.name} — {work.name}
            </caption>
            <thead>
              <tr className="border-b bg-muted/40">
                {[
                  "Código",
                  "Serviço/Insumo",
                  "Unidade",
                  "Quantidade",
                  "Preço Unitário",
                  "Valor Total",
                  "Status",
                ].map((label, i) => (
                  <th
                    scope="col"
                    key={label}
                    className={`eyebrow px-3 py-3 ${i >= 3 && i <= 5 ? "text-right" : "text-left"}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {budgetHierarchy(filtered)
                .filter(
                  (row) =>
                    !hiddenByGroup(
                      row.kind === "group" ? row.code : row.item.code,
                      query || status || unit ? new Set() : collapsed,
                    ),
                )
                .map((row) => {
                  if (row.kind === "group") {
                    const pending = row.items.some(
                      (i) => i.quantity_pending || i.unit_price_pending,
                    );
                    const total = row.items.reduce(
                      (sum, i) => sum + Math.round(i.planned_quantity * i.unit_price * 100) / 100,
                      0,
                    );
                    return (
                      <tr
                        key={`group-${row.code}`}
                        className={
                          row.depth === 1
                            ? "border-b bg-primary text-primary-foreground"
                            : "border-b bg-success-soft text-primary"
                        }
                      >
                        <td className="px-3 py-3 font-semibold">{row.code}</td>
                        <td
                          colSpan={4}
                          className="px-3 py-3 font-semibold"
                          style={{ paddingLeft: 12 + (row.depth - 1) * 12 }}
                        >
                          <button
                            type="button"
                            className="text-left"
                            aria-expanded={!collapsed.has(row.code) || !!(query || status || unit)}
                            disabled={!!(query || status || unit)}
                            onClick={() =>
                              setCollapsed((previous) => {
                                const next = new Set(previous);
                                if (next.has(row.code)) next.delete(row.code);
                                else next.add(row.code);
                                return next;
                              })
                            }
                          >
                            {collapsed.has(row.code) && !(query || status || unit) ? "▸" : "▾"}{" "}
                            {row.name}
                          </button>
                        </td>
                        <td className="num px-3 py-3 text-right font-semibold">
                          {pending ? "Parcial: " : ""}
                          {fmtBRL(total)}
                        </td>
                        <td className="px-3 py-3 text-xs">{row.items.length} itens</td>
                      </tr>
                    );
                  }
                  const item = row.item;
                  return (
                    <tr
                      key={item.id}
                      className="num border-b bg-card last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-3 text-muted-foreground">{item.code}</td>
                      <td className="px-3 py-3 font-medium">{item.description}</td>
                      <td className="px-3 py-3">{item.unit}</td>
                      <td className="px-3 py-3 text-right">
                        {item.quantity_pending
                          ? "Quantidade pendente"
                          : fmtNum(item.planned_quantity, 2)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {item.unit_price_pending ? "Preço pendente" : fmtBRL(item.unit_price)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {item.quantity_pending || item.unit_price_pending
                          ? "Pendente"
                          : fmtBRL(item.planned_quantity * item.unit_price)}
                      </td>
                      <td className="px-3 py-3">
                        <BudgetStatusBadge status={item.status} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40">
                <th scope="row" colSpan={5} className="px-3 py-3 text-left">
                  {query || status || unit ? "Total dos itens filtrados" : "Total do orçamento"}
                </th>
                <td className="num px-3 py-3 text-right font-semibold">{fmtBRL(filteredTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {!filtered.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {items.length
              ? "Nenhum item corresponde aos filtros selecionados."
              : "Este orçamento ainda não possui itens."}
          </p>
        )}
      </Panel>
      <p className="mt-3 text-xs text-muted-foreground">
        Dados salvos no banco. Cada importação preserva as revisões anteriores.
      </p>
    </>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow mb-1">{label}</dt>
      <dd className="num text-sm font-semibold">{value}</dd>
    </div>
  );
}
