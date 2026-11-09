import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compactBRL, Panel } from "@/components/app/bits";
import type { EarnedValue } from "@/lib/earned-value";
import { fmtBRL, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

const monthShort = (m: string) =>
  new Date(m + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  tone?: "danger" | "warning" | "good" | undefined;
}) {
  return (
    <div className="min-w-0 rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "num mt-0.5 truncate text-lg font-semibold",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning-foreground",
          tone === "good" && "text-primary",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

const LEGEND = [
  { key: "planned", label: "Previsto", stroke: "var(--muted-foreground)", dash: "5 4" },
  { key: "executed", label: "Executado (medições aprovadas)", stroke: "var(--primary)" },
  { key: "paid", label: "Pago (adiantamentos + líquido)", stroke: "var(--warning)" },
] as const;

export function EarnedValuePanel({
  ev,
  title = "Curva S financeira — previsto × executado × pago",
  scope,
}: {
  ev: EarnedValue;
  title?: string;
  scope: "obra" | "contrato";
}) {
  const empty = !ev.hasPlan && !ev.executed && !ev.paid;
  const delay = ev.delayDays;
  const delayText =
    delay === null
      ? "Sem datas planejadas"
      : delay > 0
        ? `${fmtNum(delay)} dia(s) de atraso`
        : delay < 0
          ? `${fmtNum(-delay)} dia(s) adiantado`
          : "Em dia";
  const data = ev.series.map((p) => ({ ...p, label: monthShort(p.month) }));
  const currentLabel = data.find((p) => p.month === ev.currentMonth)?.label;
  return (
    <Panel title={title}>
      {empty ? (
        <p className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
          A curva aparece quando {scope === "obra" ? "os contratos tiverem" : "o contrato tiver"}{" "}
          datas planejadas (aba Medições) ou medições aprovadas.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Previsto até hoje"
              value={ev.hasPlan ? compactBRL.format(ev.plannedToday) : "—"}
              hint={
                ev.hasPlan
                  ? `de ${compactBRL.format(ev.plannedTotal)} planejados`
                  : "defina as datas"
              }
            />
            <Kpi
              label="Executado"
              value={compactBRL.format(ev.executed)}
              hint={
                ev.spi !== null
                  ? `${fmtNum(ev.spi * 100, 0)}% do previsto até hoje`
                  : "medições aprovadas"
              }
              tone={
                ev.spi !== null && ev.spi < 0.9 ? "danger" : ev.spi !== null ? "good" : undefined
              }
            />
            <Kpi
              label="Pago"
              value={compactBRL.format(ev.paid)}
              hint={
                ev.paidAhead > 0.5
                  ? `${compactBRL.format(ev.paidAhead)} acima do executado`
                  : "adiantamentos + líquido das medições"
              }
              tone={ev.paidAhead > 0.5 ? "warning" : undefined}
            />
            <Kpi
              label="Prazo"
              value={delayText}
              hint={delay !== null && delay !== 0 ? "pelo valor executado × previsto" : undefined}
              tone={
                delay !== null && delay > 15
                  ? "danger"
                  : delay !== null && delay > 0
                    ? "warning"
                    : undefined
              }
            />
          </div>
          {ev.paidAhead > 0.5 && (
            <p className="rounded-md border border-warning/40 bg-warning-soft p-3 text-sm">
              Foram pagos {fmtBRL(ev.paidAhead)} a mais do que o valor executado e aprovado. É o
              adiantamento ao empreiteiro ainda não coberto por produção.
            </p>
          )}
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  tickFormatter={(v: number) => compactBRL.format(v)}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [fmtBRL(v), name]}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                />
                {currentLabel && (
                  <ReferenceLine x={currentLabel} stroke="var(--border)" strokeDasharray="2 2" />
                )}
                {[LEGEND[0], LEGEND[2], LEGEND[1]].map((l) => (
                  <Line
                    key={l.key}
                    type="monotone"
                    dataKey={l.key}
                    name={l.label.split(" (")[0] ?? l.label}
                    stroke={l.stroke}
                    {...("dash" in l ? { strokeDasharray: l.dash } : {})}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {LEGEND.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-4"
                  style={{
                    background:
                      "dash" in l
                        ? `repeating-linear-gradient(90deg, ${l.stroke} 0 4px, transparent 4px 7px)`
                        : l.stroke,
                  }}
                />
                {l.label}
              </span>
            ))}
          </div>
          {ev.withoutPlan > 0 && (
            <p className="text-xs text-amber-700">
              {ev.withoutPlan} contrato(s) sem datas planejadas ficam fora do previsto.
            </p>
          )}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium text-primary">
              Como a curva é calculada
            </summary>
            <p className="mt-2 max-w-3xl">
              Previsto: valor de cada contrato distribuído por igual entre o início e o término
              planejados. Executado: valor das medições aprovadas, no fim de cada período medido.
              Pago: adiantamentos na data do pagamento mais o líquido de cada medição aprovada (já
              sem adiantamentos e retenção). O atraso compara o valor executado com a data em que o
              previsto chegou a esse valor. Gastos fora dos contratos (desembolso do UAU) ficam no
              Fluxo financeiro do planejamento.
            </p>
          </details>
        </div>
      )}
    </Panel>
  );
}
