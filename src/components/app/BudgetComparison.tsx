import { useMemo, useState } from "react";
import {
  compareBudgetItems,
  type ComparisonItem,
  type ComparisonStatus,
} from "@/lib/budget-comparison";
import { fmtBRL, fmtNum } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const labels: Record<ComparisonStatus, string> = {
  mantido: "Mantido",
  alterado: "Alterado",
  novo: "Novo",
  removido: "Removido",
  ambiguo: "Código indefinido",
};
const amount = (n: number | null) =>
  n === null || !Number.isFinite(n) || n < 0 ? "Pendente" : fmtNum(n, 4);
function Item({ item }: { item: ComparisonItem | undefined }) {
  return item ? (
    <div className="space-y-1">
      <p>{item.description}</p>
      <p className="text-xs text-muted-foreground">
        {amount(item.quantity)} {item.unit} ·{" "}
        {item.price === null || !Number.isFinite(item.price) || item.price < 0
          ? "Preço pendente"
          : item.price.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
              minimumFractionDigits: 2,
              maximumFractionDigits: 4,
            })}
      </p>
    </div>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}
export function BudgetComparison({
  before,
  after,
  executed,
  beforeLabel,
  afterLabel,
}: {
  before: ComparisonItem[];
  after: ComparisonItem[];
  executed: ReadonlyMap<string, number>;
  beforeLabel: string;
  afterLabel: string;
}) {
  const comparison = useMemo(
    () => compareBudgetItems(before, after, executed),
    [before, after, executed],
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [risks, setRisks] = useState(false);
  const [page, setPage] = useState(0);
  const term = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const rows = comparison.rows.filter(
    (r) =>
      (!status || r.status === status) &&
      (!risks || r.warnings.length > 0) &&
      `${r.code} ${[...r.oldItems, ...r.newItems].map((i) => i.description).join(" ")}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(term),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages - 1);
  const partial = comparison.beforeTotal.pending + comparison.afterTotal.pending > 0;
  return (
    <section className="mt-4 space-y-4 rounded-md border bg-card p-4 text-sm">
      <h3 className="font-semibold">Comparação dos itens</h3>
      <p className="text-muted-foreground">
        {beforeLabel} → {afterLabel}. O código sugere correspondência; a identidade do serviço ainda
        precisa ser conferida. Esta comparação não transfere quantidades nem libera a substituição
        protegida.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="eyebrow">Valor conhecido anterior</p>
          <p className="num font-semibold">{fmtBRL(comparison.beforeTotal.value)}</p>
        </div>
        <div>
          <p className="eyebrow">Valor conhecido novo</p>
          <p className="num font-semibold">{fmtBRL(comparison.afterTotal.value)}</p>
        </div>
        <div>
          <p className="eyebrow">{partial ? "Diferença parcial" : "Diferença"}</p>
          <p className="num font-semibold">
            {fmtBRL(comparison.afterTotal.value - comparison.beforeTotal.value)}
          </p>
        </div>
      </div>
      {partial && (
        <p className="text-amber-800">
          Totais parciais: {comparison.beforeTotal.pending} itens anteriores e{" "}
          {comparison.afterTotal.pending} novos sem valor completo.
        </p>
      )}
      <p>
        {Object.entries(comparison.counts)
          .map(([key, value]) => `${labels[key as ComparisonStatus]}: ${value}`)
          .join(" · ")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="sm:max-w-xs"
          aria-label="Buscar na comparação"
          placeholder="Código ou serviço"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Situação na comparação"
          className="h-9 rounded-md border bg-background px-3"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todas as situações</option>
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={risks}
            onChange={(e) => {
              setRisks(e.target.checked);
              setPage(0);
            }}
          />
          Somente pontos de atenção
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left">
          <thead className="bg-muted">
            <tr>
              {[
                "Código",
                "Situação",
                "Anterior",
                "Novo",
                "Execução aprovada anterior",
                "Saldo simulado novo",
                "Conferência",
              ].map((h) => (
                <th key={h} className="p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(currentPage * 50, (currentPage + 1) * 50).map((row) => (
              <tr
                key={row.code}
                className={`border-b align-top ${row.status === "mantido" ? "" : "bg-success-soft/30"}`}
              >
                <td className="p-3 num">{row.code || "Sem código"}</td>
                <td className="p-3 font-medium">{labels[row.status]}</td>
                <td className="p-3">
                  {row.oldItems.map((i) => (
                    <Item key={i.id} item={i} />
                  ))}
                </td>
                <td className="p-3">
                  {row.newItems.map((i) => (
                    <Item key={i.id} item={i} />
                  ))}
                </td>
                <td className="p-3 num">
                  {row.status === "ambiguo"
                    ? "Conferir por item"
                    : row.oldItems[0]
                      ? `${fmtNum(row.production, 4)} ${row.oldItems[0].unit}`
                      : "—"}
                </td>
                <td className="p-3 num">
                  {row.simulatedBalance !== null
                    ? `${fmtNum(row.simulatedBalance, 4)} ${row.newItems[0]?.unit}`
                    : "—"}
                </td>
                <td className="p-3">
                  <p>{row.changes.join(", ")}</p>
                  {row.warnings.map((warning) => (
                    <p key={warning} className="mt-1 text-amber-800">
                      {warning}
                    </p>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>Nenhum item para este filtro.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {rows.length} códigos · Página {currentPage + 1} de {pages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage + 1 >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Execução considera apenas medições aprovadas da versão anterior selecionada. O saldo
        simulado não é saldo oficial e não soma unidades diferentes. Mudanças de código aparecem
        como remoção e inclusão, sem vínculo automático.
      </p>
    </section>
  );
}
