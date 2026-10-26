import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Panel } from "./bits";
import { Input } from "@/components/ui/input";
import { analyzeBudget } from "@/lib/budget-analysis";
import { fmtBRL, fmtPct } from "@/lib/format";
import type { BudgetItem } from "@/lib/types";

export function BudgetAnalysis({ items }: { items: BudgetItem[] }) {
  const analysis = analyzeBudget(items);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const rows = analysis.abc.filter(
    (row) =>
      (!category || row.category === category) &&
      normalize(`${row.item.code} ${row.item.description}`).includes(normalize(search.trim())),
  );
  return (
    <div className="space-y-5">
      <Panel title="Resumo por grupo">
        <p className="mb-4 text-sm text-muted-foreground">
          Grupos principais da planilha. Cada serviço entra uma única vez no total, sem somar os
          subtotais dos subgrupos.
        </p>
        {analysis.pendingCount > 0 && (
          <p role="status" className="mb-4 rounded-md border bg-warning-soft p-3 text-sm">
            Análise parcial: {analysis.pendingCount} itens com quantidade ou preço pendente não
            entram nos valores nem na Curva ABC.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <caption className="sr-only">Resumo financeiro dos grupos principais</caption>
            <thead>
              <tr className="border-b bg-muted/40">
                {["Grupo", "Itens", "Valor", "Participação"].map((label, i) => (
                  <th
                    key={label}
                    scope="col"
                    className={`px-3 py-3 ${i ? "text-right" : "text-left"}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.groups.map((group) => (
                <tr key={`${group.code}-${group.name}`} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-3 text-left font-medium">
                    {group.code && `${group.code} · `}
                    {group.name}
                    {group.pending > 0 && (
                      <span className="block text-xs font-normal text-amber-700">
                        {group.pending} pendentes · valor parcial
                      </span>
                    )}
                  </th>
                  <td className="num px-3 py-3 text-right">{group.count}</td>
                  <td className="num px-3 py-3 text-right font-semibold">{fmtBRL(group.value)}</td>
                  <td className="num px-3 py-3 text-right">
                    {fmtPct(group.share)}
                    <div className="ml-auto mt-1 h-1.5 w-24 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full rounded bg-primary"
                        style={{ width: `${group.share}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40">
                <th scope="row" className="px-3 py-3 text-left">
                  {analysis.pendingCount ? "Total conhecido" : "Total do orçamento"}
                </th>
                <td className="num px-3 py-3 text-right">{items.length}</td>
                <td className="num px-3 py-3 text-right font-semibold">{fmtBRL(analysis.total)}</td>
                <td className="num px-3 py-3 text-right">{fmtPct(analysis.total ? 100 : 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {!items.length && (
          <p className="py-5 text-sm text-muted-foreground">
            Este orçamento ainda não possui itens.
          </p>
        )}
      </Panel>
      <Panel title="Curva ABC de serviços e insumos">
        <p className="mb-4 text-sm text-muted-foreground">
          Itens ordenados do maior para o menor valor. Classe A até atingir 80% do total, B até
          atingir 95% e C com o restante. O item que ultrapassa o limite permanece na classe
          anterior.
        </p>
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {analysis.classes.map((group) => (
            <div key={group.category} className="rounded-md border bg-muted/30 p-4">
              <div className="font-semibold text-primary">
                Classe {group.category} · {group.count} itens
              </div>
              <div className="num mt-1 text-lg font-semibold">{fmtBRL(group.value)}</div>
              <div className="text-xs text-muted-foreground">
                {fmtPct(group.share)} do valor conhecido
              </div>
            </div>
          ))}
        </div>
        {analysis.abc.length ? (
          <>
            <div
              className="mb-5 h-64"
              role="img"
              aria-label="Participação acumulada dos itens no orçamento, do maior para o menor valor"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={[{ rank: 0, cumulative: 0 }, ...analysis.abc]}
                  margin={{ top: 12, right: 24, left: 0, bottom: 14 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="rank"
                    type="number"
                    domain={[0, analysis.abc.length]}
                    allowDecimals={false}
                    label={{ value: "Itens em ordem de valor", position: "bottom", offset: 0 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(value: number) => `${value}%`}
                    width={48}
                  />
                  <Tooltip
                    labelFormatter={(rank) => `Posição ${rank}`}
                    formatter={(value: number) => [fmtPct(value), "Acumulado"]}
                  />
                  <ReferenceLine y={80} stroke="#b4841e" strokeDasharray="4 4" label="80%" />
                  <ReferenceLine y={95} stroke="#64748b" strokeDasharray="4 4" label="95%" />
                  <Line
                    type="linear"
                    dataKey="cumulative"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_180px]">
              <Input
                aria-label="Buscar na Curva ABC"
                placeholder="Buscar código ou serviço"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Filtrar classe ABC"
                className="h-9 rounded-md border bg-card px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Todas as classes</option>
                {["A", "B", "C"].map((value) => (
                  <option key={value} value={value}>
                    Classe {value}
                  </option>
                ))}
              </select>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {rows.length} de {analysis.abc.length} itens com valor positivo. Busca e filtro mantêm
              a classificação e os percentuais do orçamento completo.
            </p>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[760px] text-sm">
                <caption className="sr-only">Classificação ABC dos itens do orçamento</caption>
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b">
                    {[
                      "Classe",
                      "Código",
                      "Serviço/Insumo",
                      "Valor",
                      "% do total",
                      "% acumulado",
                    ].map((label, i) => (
                      <th
                        key={label}
                        scope="col"
                        className={`px-3 py-3 ${i >= 3 ? "text-right" : "text-left"}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.item.id} className="border-b last:border-0">
                      <td className="px-3 py-3">
                        <span className="rounded bg-success-soft px-2 py-1 font-semibold text-primary">
                          {row.category}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{row.item.code}</td>
                      <td className="px-3 py-3 font-medium">{row.item.description}</td>
                      <td className="num px-3 py-3 text-right">{fmtBRL(row.value)}</td>
                      <td className="num px-3 py-3 text-right">{fmtPct(row.share, 2)}</td>
                      <td className="num px-3 py-3 text-right">{fmtPct(row.cumulative, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="py-5 text-sm text-muted-foreground">
                Nenhum item corresponde à busca e à classe selecionada.
              </p>
            )}
          </>
        ) : (
          <p className="py-5 text-sm text-muted-foreground">
            Não há itens com quantidade e preço preenchidos e valor positivo para gerar a Curva ABC.
          </p>
        )}
        {analysis.zeroCount > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            {analysis.zeroCount} itens com valor zero permanecem na tabela do orçamento e ficam fora
            da classificação ABC.
          </p>
        )}
      </Panel>
    </div>
  );
}
