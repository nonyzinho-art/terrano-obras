import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Upload } from "lucide-react";
import { compactBRL, Panel, Stat } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import type { buildCashFlow } from "@/lib/cost-flow";
import type { DisbursementImport } from "@/lib/cost-plan-data";
import { fmtBRL, fmtDate } from "@/lib/format";

type Flow = ReturnType<typeof buildCashFlow>;

const monthShort = (m: string) =>
  new Date(m + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

export function CostFlowPanel({
  flow,
  batch,
  loading,
  error,
  filtered,
  onImport,
}: {
  flow: Flow | null;
  batch: DisbursementImport | null;
  loading: boolean;
  error: string;
  filtered: boolean;
  onImport: (() => void) | undefined;
}) {
  const importButton = onImport && (
    <Button size="sm" variant="outline" onClick={onImport}>
      <Upload className="size-4" />
      {batch ? "Atualizar desembolso" : "Importar desembolso (UAU)"}
    </Button>
  );
  if (loading) return <p className="text-sm text-muted-foreground">Carregando desembolso…</p>;
  if (error)
    return (
      <Panel title="Fluxo financeiro">
        <p role="alert" className="text-sm">
          {error}
        </p>
      </Panel>
    );
  if (!flow || !batch)
    return (
      <Panel title="Fluxo financeiro" action={importButton}>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Importe a exportação de desembolso do UAU (aba "Desembolso" da planilha de custo) para ver
          o realizado mês a mês e a projeção do saldo de cada frente até o término.
        </p>
      </Panel>
    );

  // From two years before today to the last projected month keeps the chart readable.
  const from = `${Number(flow.currentMonth.slice(0, 4)) - 2}${flow.currentMonth.slice(4)}`;
  const data = flow.series
    .filter((s) => s.month >= from)
    .map((s) => ({
      ...s,
      label: monthShort(s.month),
      realized: s.realized || null,
      projected: s.projected || null,
    }));
  const overruns = flow.overrun > 0.5;

  return (
    <Panel
      title={`Fluxo financeiro${filtered ? " · seleção" : ""}`}
      action={importButton}
      className="[&>div:last-child]:space-y-5"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Pago até hoje"
          value={compactBRL.format(flow.realized)}
          hint="desembolso do UAU nas frentes do plano"
        />
        <Stat
          label="A desembolsar"
          value={compactBRL.format(flow.remaining)}
          hint="contratado, programado e a contratar"
        />
        <Stat
          label="Maior mês previsto"
          value={flow.peak ? compactBRL.format(flow.peak.projected) : "—"}
          hint={flow.peak ? monthShort(flow.peak.month) : "sem saldo a desembolsar"}
        />
        <Stat
          label="Término do desembolso"
          value={flow.end ? monthShort(flow.end) : "—"}
          hint={`${compactBRL.format(flow.scheduled)} programado no UAU`}
        />
      </div>
      {overruns && (
        <p className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm">
          {fmtBRL(flow.overrun)} já foram pagos acima do contratado + a contratar em algumas
          frentes. Elas aparecem em vermelho na coluna "Pago (UAU)" da tabela acima.
        </p>
      )}
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis
              yAxisId="month"
              tickFormatter={(v: number) => compactBRL.format(v)}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <YAxis
              yAxisId="total"
              orientation="right"
              tickFormatter={(v: number) => compactBRL.format(v)}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Tooltip
              formatter={(v: number, name: string) => [fmtBRL(v), name]}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
            />
            <Bar yAxisId="month" dataKey="realized" name="Pago" stackId="m" fill="var(--brand)" />
            <Bar
              yAxisId="month"
              dataKey="projected"
              name="Projetado"
              stackId="m"
              fill="var(--chart-2)"
              radius={[3, 3, 0, 0]}
            />
            <Line
              yAxisId="total"
              dataKey="cumulative"
              name="Acumulado"
              stroke="var(--warning)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="flex flex-wrap gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-brand" /> Pago
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[var(--chart-2)]" /> Projetado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-warning" /> Acumulado (eixo da direita)
          </span>
        </span>
        <span>
          Desembolso {batch.uau_work ? `${batch.uau_work} · ` : ""}importado em{" "}
          {fmtDate(batch.imported_at)}
        </span>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none font-medium text-primary">
          Como a projeção é calculada
        </summary>
        <p className="mt-2 max-w-3xl">
          Pago: desembolso do UAU até o mês atual, ligado às frentes pelo código do insumo. A partir
          deste mês, o contratado ainda não pago entra no mês atual, o "Pagar" programado no UAU
          entra no mês programado e o valor a contratar é dividido igualmente pela duração da
          frente, a partir do início. Permuta é paga em lotes e não entra no caixa.
        </p>
      </details>
    </Panel>
  );
}
