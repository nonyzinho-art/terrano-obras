import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileSpreadsheet, Upload } from "lucide-react";
import { compactBRL, Panel, Stat } from "@/components/app/bits";
import { CostPlanImportDialog } from "@/components/app/CostPlanImportDialog";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/lib/access";
import {
  isDeduction,
  stageName,
  storedAmounts,
  summarize,
  type CostPlanItem,
} from "@/lib/cost-plan";
import { costPlanError, loadCostPlanItems, loadCostPlans } from "@/lib/cost-plan-data";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "todas" | "geral" | number;

const money = (n: number) => fmtNum(n, 0);
const signed = (n: number) =>
  Math.round(n) === 0 ? "0" : `${n > 0 ? "+" : "−"}${money(Math.abs(n))}`;
const month = (iso: string | null) =>
  iso
    ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
    : "—";

function Row({
  item,
  details,
  open,
  onToggle,
}: {
  item: CostPlanItem;
  details: CostPlanItem[];
  open: boolean;
  onToggle: () => void;
}) {
  const a = storedAmounts(item);
  const deviation = (a.forecast ?? a.viability) - a.viability;
  return (
    <>
      <tr className="border-b hover:bg-muted/40">
        <td className="max-w-[18rem] px-4 py-2.5">
          {details.length ? (
            <button
              onClick={onToggle}
              aria-expanded={open}
              className="flex items-center gap-1 text-left font-medium hover:text-primary"
            >
              {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              {item.service}
            </button>
          ) : (
            <span className="font-medium">{item.service}</span>
          )}
          {item.item_code && (
            <span className="ml-2 text-xs text-muted-foreground">{item.item_code}</span>
          )}
        </td>
        <td className="num px-3 py-2.5 text-right">{money(a.viability)}</td>
        <td className="num px-3 py-2.5 text-right">{money(a.committed)}</td>
        <td className="num px-3 py-2.5 text-right">{money(a.toContract)}</td>
        <td className="num px-3 py-2.5 text-right text-muted-foreground">
          {a.barter ? money(a.barter) : "—"}
        </td>
        <td className="num px-3 py-2.5 text-right font-semibold text-brand">
          {money(a.forecast ?? a.viability)}
        </td>
        <td
          className={cn(
            "num px-3 py-2.5 text-right font-medium",
            deviation > 0.5 && "text-danger",
            deviation < -0.5 && "text-primary",
            Math.abs(deviation) <= 0.5 && "text-muted-foreground",
          )}
        >
          {signed(deviation)}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-muted-foreground">
          {month(item.start_month)}
          {item.duration_months ? ` · ${item.duration_months} m` : ""}
        </td>
      </tr>
      {open &&
        details.map((d) => {
          const x = storedAmounts(d);
          return (
            <tr key={d.id} className="border-b bg-muted/30 text-xs text-muted-foreground">
              <td className="px-4 py-1.5 pl-10">{d.service}</td>
              <td className="num px-3 py-1.5 text-right">{money(x.viability)}</td>
              <td className="num px-3 py-1.5 text-right">{money(x.committed)}</td>
              <td className="num px-3 py-1.5 text-right">{money(x.toContract)}</td>
              <td />
              <td className="num px-3 py-1.5 text-right">
                {x.forecast === null ? "—" : money(x.forecast)}
              </td>
              <td colSpan={2} />
            </tr>
          );
        })}
    </>
  );
}

function TotalRow({
  label,
  rows,
  strong,
}: {
  label: string;
  rows: CostPlanItem[];
  strong?: boolean;
}) {
  const t = summarize(rows.map(storedAmounts));
  return (
    <tr className={cn("border-b", strong ? "bg-brand text-white" : "bg-muted/60 font-medium")}>
      <td className="px-4 py-2.5">{label}</td>
      <td className="num px-3 py-2.5 text-right">{money(t.viability)}</td>
      <td className="num px-3 py-2.5 text-right">{money(t.committed)}</td>
      <td className="num px-3 py-2.5 text-right">{money(t.toContract)}</td>
      <td className="num px-3 py-2.5 text-right">{t.barter ? money(t.barter) : "—"}</td>
      <td className="num px-3 py-2.5 text-right font-semibold">{money(t.forecast)}</td>
      <td className="num px-3 py-2.5 text-right">{signed(t.deviation)}</td>
      <td />
    </tr>
  );
}

export function WorkCostPlan({ workId }: { workId: string }) {
  const { canWriteWork } = useAccess();
  const [importing, setImporting] = useState(false);
  const [planId, setPlanId] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const plans = useQuery({
    queryKey: ["cost-plans", workId],
    queryFn: () => loadCostPlans(workId),
  });
  const plan = plans.data?.find((p) => p.id === planId) ?? plans.data?.[0];
  const items = useQuery({
    queryKey: ["cost-plan-items", plan?.id],
    queryFn: () => loadCostPlanItems(plan!.id),
    enabled: !!plan,
  });
  const canImport = canWriteWork(workId);
  const importButton = canImport && (
    <Button variant={plan ? "outline" : "default"} onClick={() => setImporting(true)}>
      <Upload className="size-4" />
      {plan ? "Importar nova revisão" : "Importar planilha"}
    </Button>
  );
  const dialog = importing && (
    <CostPlanImportDialog
      workId={workId}
      onClose={() => {
        setImporting(false);
        setPlanId("");
      }}
    />
  );

  if (plans.isPending || (plan && items.isPending))
    return <p className="text-sm text-muted-foreground">Carregando planejamento…</p>;
  if (plans.error || items.error)
    return (
      <p role="alert" className="panel p-5 text-sm">
        {costPlanError(plans.error ?? items.error)}
      </p>
    );
  if (!plan)
    return (
      <Panel>
        <div className="flex flex-col items-start gap-3 py-4">
          <FileSpreadsheet className="size-8 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Traga o planejamento de custos da obra</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Importe a planilha "Custo de obras" para acompanhar viabilidade, comprometido,
              previsão ao término e desvio por frente de serviço e etapa.
            </p>
          </div>
          {importButton}
        </div>
        {dialog}
      </Panel>
    );

  const rows = items.data ?? [];
  const top = rows.filter((i) => i.parent_position === null);
  const main = top.filter((i) => !isDeduction(i.service));
  const deductions = top.filter((i) => isDeduction(i.service));
  const detailsOf = (i: CostPlanItem) => rows.filter((d) => d.parent_position === i.position);
  const totals = summarize(main.map(storedAmounts));
  const deductionTotal = summarize(deductions.map(storedAmounts));
  const lots = plan.stages.every((s) => s.lots) ? plan.stages.reduce((n, s) => n + s.lots!, 0) : 0;
  const stages = [...new Set(main.map((i) => i.stage).filter((s): s is number => !!s))].sort(
    (a, b) => a - b,
  );
  const hasGeneral = main.some((i) => !i.stage);
  const groups: { key: string; label: string; rows: CostPlanItem[] }[] = [
    ...stages.map((stage) => {
      const info = plan.stages.find((s) => s.stage === stage);
      return {
        key: String(stage),
        label: `${stageName(stage)}${info?.lots ? ` · ${fmtNum(info.lots)} lotes` : ""}`,
        rows: main.filter((i) => i.stage === stage),
      };
    }),
    ...(hasGeneral
      ? [{ key: "geral", label: "Geral (todas as etapas)", rows: main.filter((i) => !i.stage) }]
      : []),
  ].filter((g) => filter === "todas" || g.key === String(filter));
  const toggle = (position: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  const chip = (value: Filter, label: string) => (
    <button
      key={String(value)}
      onClick={() => setFilter(value)}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        filter === value
          ? "border-brand bg-brand text-white"
          : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            aria-label="Revisão do planejamento"
            className="h-9 rounded-md border bg-card px-3 text-sm font-medium"
            value={plan.id}
            onChange={(e) => {
              setPlanId(e.target.value);
              setOpen(new Set());
            }}
          >
            {plans.data!.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (revisão {p.revision})
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            importado em {fmtDate(plan.imported_at)}
            {plan.source_filename ? ` · ${plan.source_filename}` : ""}
          </span>
        </div>
        {importButton}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Viabilidade"
          value={compactBRL.format(totals.viability)}
          hint={lots ? `${compactBRL.format(totals.viability / lots)} por lote` : undefined}
        />
        <Stat
          label="Previsão ao término"
          value={compactBRL.format(totals.forecast)}
          hint={lots ? `${compactBRL.format(totals.forecast / lots)} por lote` : undefined}
        />
        <Stat
          label="Desvio sobre a viabilidade"
          value={`${totals.deviation > 0 ? "+" : ""}${compactBRL.format(totals.deviation)}`}
          hint={`${totals.deviation > 0 ? "+" : ""}${fmtPct(totals.deviationPct, 1)}`}
          tone={totals.deviation > 0 ? "danger" : undefined}
        />
        <Stat
          label="Comprometido"
          value={compactBRL.format(totals.committed)}
          hint={`${compactBRL.format(totals.toContract)} a contratar`}
        />
      </div>

      <Panel
        title="Custo por frente de serviço"
        className="[&>div:last-child]:p-0"
        action={
          <div className="flex flex-wrap justify-end gap-1.5">
            {chip("todas", "Todas")}
            {stages.map((s) => chip(s, stageName(s)))}
            {hasGeneral && chip("geral", "Geral")}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-normal">Frente de serviço</th>
                <th className="px-3 py-2.5 text-right font-normal">Viabilidade</th>
                <th className="px-3 py-2.5 text-right font-normal">Comprometido</th>
                <th className="px-3 py-2.5 text-right font-normal">A contratar</th>
                <th className="px-3 py-2.5 text-right font-normal">Permuta</th>
                <th className="px-3 py-2.5 text-right font-normal">Previsão</th>
                <th className="px-3 py-2.5 text-right font-normal">Desvio</th>
                <th className="px-4 py-2.5 text-right font-normal">Início · duração</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.key}>
                  <tr className="border-b bg-muted/30">
                    <td colSpan={8} className="px-4 py-2 text-xs font-semibold text-brand">
                      {group.label}
                    </td>
                  </tr>
                  {group.rows.map((item) => (
                    <Row
                      key={item.id}
                      item={item}
                      details={detailsOf(item)}
                      open={open.has(item.position)}
                      onToggle={() => toggle(item.position)}
                    />
                  ))}
                  {filter === "todas" && groups.length > 1 && (
                    <TotalRow
                      label={`Subtotal · ${group.label.split(" · ")[0]}`}
                      rows={group.rows}
                    />
                  )}
                </Fragment>
              ))}
              <TotalRow
                label={filter === "todas" ? "Total da obra" : "Total da seleção"}
                rows={groups.flatMap((g) => g.rows)}
                strong
              />
            </tbody>
          </table>
        </div>
        {filter === "todas" && deductions.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {deductions.map((d) => d.service).join(", ")} (abatimento, fora do total da planilha)
            </span>
            <span className="num">
              {money(deductionTotal.forecast)} · custo líquido previsto{" "}
              <strong className="text-brand">
                {money(totals.forecast + deductionTotal.forecast)}
              </strong>
            </span>
          </div>
        )}
      </Panel>
      {dialog}
    </div>
  );
}
