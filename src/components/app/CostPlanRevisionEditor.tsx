import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Send, Split, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { compactBRL, Panel, Stat } from "@/components/app/bits";
import { UnsavedChangesGuard } from "@/components/app/UnsavedChangesGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DisbursementRow, MonthGrid } from "@/lib/cost-flow";
import {
  isDeduction,
  parseMoney,
  stageName,
  type CostPlan,
  type CostPlanItem,
} from "@/lib/cost-plan";
import {
  costPlanError,
  loadCostPlanItems,
  loadMonthValues,
  revisionAction,
} from "@/lib/cost-plan-data";
import {
  REVISION_STATUS,
  distribute,
  forecastChanges,
  frontBalances,
  gridFromRows,
  gridToRows,
  monthOf,
  monthRange,
  monthTotals,
  shiftRow,
  withForecast,
} from "@/lib/cost-revision";
import { fmtDate, fmtNum } from "@/lib/format";
import { TODAY } from "@/lib/repository";
import { cn } from "@/lib/utils";

const monthShort = (m: string) =>
  new Date(m + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
const money = (n: number) => fmtNum(n, 0);

/** Number cell that shows "1.234" and accepts "1234,56" or "1.234,56" while typing. */
function MoneyInput({
  value,
  onChange,
  label,
  disabled,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      aria-label={label}
      disabled={disabled}
      inputMode="decimal"
      className={cn(
        "num h-8 w-full rounded border border-transparent bg-transparent px-1.5 text-right text-xs outline-none hover:border-input focus:border-ring focus:bg-card disabled:hover:border-transparent",
        className,
      )}
      value={text ?? (value ? money(value) : "")}
      onFocus={() => setText(value ? fmtNum(value, 2) : "")}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        try {
          onChange(parseMoney(text ?? "") ?? 0);
        } catch {
          toast.error("Use um valor em reais, como 1.250,00.");
        }
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function CostPlanRevisionEditor({
  revision,
  baseItems,
  disbursements,
  canEdit,
  canApprove,
  onClose,
}: {
  revision: CostPlan;
  baseItems: CostPlanItem[];
  disbursements: DisbursementRow[];
  canEdit: boolean;
  canApprove: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const current = monthOf(TODAY);
  const editable = canEdit && (revision.status === "rascunho" || revision.status === "devolvida");
  const reviewing = revision.status === "enviada";
  const items = useQuery({
    queryKey: ["cost-plan-items", revision.id],
    queryFn: () => loadCostPlanItems(revision.id),
  });
  const values = useQuery({
    queryKey: ["cost-plan-months", revision.id],
    queryFn: () => loadMonthValues(revision.id),
  });
  const [forecasts, setForecasts] = useState<Map<number, number>>(new Map());
  const [notes, setNotes] = useState<Map<number, string>>(new Map());
  const [grid, setGrid] = useState<MonthGrid | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!items.data || !values.data || grid) return;
    setForecasts(new Map(items.data.map((i) => [i.position, Number(i.forecast ?? i.viability)])));
    setNotes(new Map(items.data.map((i) => [i.position, i.note ?? ""])));
    setGrid(gridFromRows(values.data));
  }, [items.data, values.data, grid]);

  const edited = useMemo(
    () =>
      (items.data ?? []).map((i) => {
        const f = forecasts.get(i.position);
        const note = notes.get(i.position) ?? "";
        return i.parent_position === null &&
          f !== undefined &&
          f !== Number(i.forecast ?? i.viability)
          ? { ...withForecast(i, f), note }
          : { ...i, note };
      }),
    [items.data, forecasts, notes],
  );
  const fronts = edited.filter((i) => i.parent_position === null && !isDeduction(i.service));
  const balances = useMemo(
    () => (grid ? frontBalances(edited, grid, disbursements, TODAY).balances : new Map()),
    [edited, grid, disbursements],
  );

  if (items.isPending || values.isPending || !grid)
    return <p className="text-sm text-muted-foreground">Carregando revisão…</p>;
  if (items.error || values.error)
    return (
      <p role="alert" className="panel p-5 text-sm">
        {costPlanError(items.error ?? values.error)}
      </p>
    );

  const lastMonth = [...grid.values()]
    .flatMap((row) => [...row.keys()])
    .reduce((max, m) => (m > max ? m : max), current);
  const months = monthRange(current, lastMonth > addYear(current) ? lastMonth : addYear(current));
  const changes = forecastChanges(baseItems, edited);
  const missingNotes = changes.filter((c) => c.note.trim().length < 5);
  const totalBalance = fronts.reduce((s, f) => s + (balances.get(f.position)?.balance ?? 0), 0);
  const totalAllocated = fronts.reduce((s, f) => s + (balances.get(f.position)?.allocated ?? 0), 0);
  const unallocated = fronts.filter(
    (f) => Math.abs(balances.get(f.position)?.unallocated ?? 0) > 1,
  );
  const totals = monthTotals(grid, months);
  const baseGridQuery = queryClient.getQueryData<
    { position: number; month: string; amount: number }[]
  >(["cost-plan-months", revision.base_plan_id]);
  const baseTotals = baseGridQuery ? monthTotals(gridFromRows(baseGridQuery), months) : null;

  const setRow = (position: number, row: Map<string, number>) => {
    const next = new Map(grid);
    next.set(position, row);
    setGrid(next);
    setDirty(true);
  };
  const setCell = (position: number, month: string, value: number) => {
    const row = new Map(grid.get(position) ?? []);
    if (value) row.set(month, value);
    else row.delete(month);
    setRow(position, row);
  };
  const spread = (front: CostPlanItem) => {
    const balance = balances.get(front.position)?.balance ?? 0;
    const start = front.start_month && front.start_month > current ? front.start_month : current;
    setRow(front.position, distribute(balance, start, front.duration_months ?? 1));
  };
  const postpone = (front: CostPlanItem) => {
    const row = grid.get(front.position) ?? new Map<string, number>();
    const pending = new Map([...row].filter(([m]) => m >= current));
    setRow(front.position, shiftRow(pending, 1));
  };

  const run = async (
    action: "salvar" | "enviar" | "descartar" | "aprovar" | "devolver",
    done: string,
  ) => {
    setBusy(true);
    try {
      let version = revision.version ?? 1;
      if (action === "enviar" && dirty) {
        await revisionAction("salvar", savePayload(version));
        version++;
      }
      await revisionAction(
        action,
        action === "salvar"
          ? savePayload(version)
          : { plan_id: revision.id, version, comment: comment.trim() },
      );
      setDirty(false);
      toast.success(done);
      await queryClient.invalidateQueries({ queryKey: ["cost-plans", revision.work_id] });
      await queryClient.invalidateQueries({ queryKey: ["cost-plan-items", revision.id] });
      await queryClient.invalidateQueries({ queryKey: ["cost-plan-months", revision.id] });
      if (action !== "salvar") onClose();
    } catch (e) {
      toast.error(costPlanError(e));
    } finally {
      setBusy(false);
    }
  };
  const savePayload = (version: number) => ({
    plan_id: revision.id,
    version,
    items: fronts.map((f) => ({
      position: f.position,
      forecast: Number(f.forecast ?? f.viability),
      note: f.note ?? "",
    })),
    values: gridToRows(grid, current),
  });

  const stages = [...new Set(fronts.map((f) => f.stage))].sort((a, b) => (a ?? 99) - (b ?? 99));
  const submitBlocked = unallocated.length
    ? `${unallocated.length} frente(s) com saldo não alocado`
    : missingNotes.length
      ? `${missingNotes.length} previsão(ões) alterada(s) sem justificativa`
      : "";

  return (
    <div className="space-y-5">
      <UnsavedChangesGuard dirty={dirty} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            onClick={onClose}
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="size-3.5" /> Planejamento aprovado
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-brand">{revision.name}</h2>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                revision.status === "devolvida"
                  ? "bg-danger-soft text-danger"
                  : revision.status === "enviada"
                    ? "bg-warning-soft text-warning-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {REVISION_STATUS[revision.status ?? "rascunho"]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {editable
              ? `Distribua o saldo de cada frente nos meses. ${monthShort(current)} recebe o que já está contratado e ainda não foi pago.`
              : revision.submitted_at
                ? `Enviada em ${fmtDate(revision.submitted_at)}.`
                : ""}
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Descartar esta revisão? O planejamento aprovado não muda."))
                  void run("descartar", "Revisão descartada.");
              }}
            >
              <Trash2 className="size-4" /> Descartar
            </Button>
            <Button
              variant="outline"
              disabled={busy || !dirty}
              onClick={() => void run("salvar", "Rascunho salvo.")}
            >
              Salvar rascunho
            </Button>
            <Button
              disabled={busy || !!submitBlocked}
              title={submitBlocked || undefined}
              onClick={() => void run("enviar", "Revisão enviada para aprovação.")}
            >
              <Send className="size-4" /> Enviar para aprovação
            </Button>
          </div>
        )}
      </div>

      {revision.status === "devolvida" && revision.decision_comment && (
        <p className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm">
          <strong>Devolvida pela coordenação:</strong> {revision.decision_comment}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Saldo a desembolsar"
          value={compactBRL.format(totalBalance)}
          hint="sem permuta"
        />
        <Stat label="Alocado nos meses" value={compactBRL.format(totalAllocated)} />
        <Stat
          label="Não alocado"
          value={compactBRL.format(totalBalance - totalAllocated)}
          hint={unallocated.length ? `${unallocated.length} frentes a ajustar` : "tudo distribuído"}
          tone={unallocated.length ? "danger" : undefined}
        />
        <Stat
          label="Previsões alteradas"
          value={String(changes.length)}
          hint={
            missingNotes.length
              ? `${missingNotes.length} sem justificativa`
              : "em relação à aprovada"
          }
          tone={missingNotes.length ? "warning" : undefined}
        />
      </div>

      {(reviewing || changes.length > 0) && (
        <Panel title="O que muda em relação ao planejamento aprovado">
          {changes.length ? (
            <ul className="divide-y text-sm">
              {changes.map((c) => (
                <li
                  key={c.position}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                >
                  <span className="font-medium">{c.service}</span>
                  <span className="num">
                    {money(c.forecastBefore)} → <strong>{money(c.forecastAfter)}</strong>{" "}
                    <span
                      className={
                        c.forecastAfter > c.forecastBefore ? "text-danger" : "text-primary"
                      }
                    >
                      ({c.forecastAfter > c.forecastBefore ? "+" : "−"}
                      {money(Math.abs(c.forecastAfter - c.forecastBefore))})
                    </span>
                  </span>
                  <span className="w-full text-xs text-muted-foreground">
                    {c.note || "Sem justificativa"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma previsão ao término mudou; só a distribuição mensal.
            </p>
          )}
          {baseTotals && (
            <div className="mt-4 overflow-x-auto">
              <table className="text-xs">
                <tbody>
                  <tr className="text-muted-foreground">
                    <td className="pr-3">Mês</td>
                    {months.slice(0, 6).map((m) => (
                      <td key={m} className="px-2 text-right">
                        {monthShort(m)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="pr-3 text-muted-foreground">Aprovado</td>
                    {baseTotals.slice(0, 6).map((v, i) => (
                      <td key={i} className="num px-2 text-right">
                        {money(v)}
                      </td>
                    ))}
                  </tr>
                  <tr className="font-semibold">
                    <td className="pr-3">Nesta revisão</td>
                    {totals.slice(0, 6).map((v, i) => (
                      <td key={i} className="num px-2 text-right">
                        {money(v)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {reviewing && canApprove && (
            <div className="mt-4 space-y-3 border-t pt-4">
              <Textarea
                aria-label="Comentário da coordenação"
                placeholder="Comentário (obrigatório para devolver)"
                value={comment}
                maxLength={5000}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy}
                  onClick={() => void run("aprovar", "Planejamento aprovado.")}
                >
                  <Check className="size-4" /> Aprovar revisão
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || comment.trim().length < 5}
                  onClick={() => void run("devolver", "Revisão devolvida ao engenheiro.")}
                >
                  <Undo2 className="size-4" /> Devolver com comentário
                </Button>
              </div>
            </div>
          )}
        </Panel>
      )}

      <Panel title="Planejamento mensal (R$)" className="[&>div:last-child]:p-0">
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="sticky left-0 z-10 min-w-[15rem] bg-card px-4 py-2.5 text-left font-normal">
                  Frente de serviço
                </th>
                <th className="min-w-[7rem] px-2 py-2.5 text-right font-normal">Previsão</th>
                <th className="min-w-[6.5rem] px-2 py-2.5 text-right font-normal">Saldo</th>
                <th className="min-w-[6.5rem] px-2 py-2.5 text-right font-normal">Não alocado</th>
                {editable && <th className="px-2 py-2.5 font-normal" />}
                {months.map((m) => (
                  <th
                    key={m}
                    className={cn(
                      "min-w-[6rem] px-1 py-2.5 text-right font-normal",
                      m === current && "text-brand",
                    )}
                  >
                    {monthShort(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stages.map((stage) => (
                <Fragment key={String(stage)}>
                  <tr className="border-b bg-muted/30">
                    <td
                      colSpan={4 + (editable ? 1 : 0) + months.length}
                      className="sticky left-0 px-4 py-1.5 text-xs font-semibold text-brand"
                    >
                      {stage ? stageName(stage) : "Geral"}
                    </td>
                  </tr>
                  {fronts
                    .filter((f) => f.stage === stage)
                    .map((front) => {
                      const b = balances.get(front.position);
                      const original = items.data!.find((i) => i.position === front.position)!;
                      const changed =
                        Number(front.forecast ?? front.viability) !==
                        Number(
                          baseItems.find((i) => i.position === front.position)?.forecast ??
                            original.viability,
                        );
                      const row = grid.get(front.position) ?? new Map<string, number>();
                      return (
                        <tr key={front.id} className="border-b align-top hover:bg-muted/30">
                          <td className="sticky left-0 z-10 bg-card px-4 py-1.5">
                            <div className="text-xs font-medium leading-tight">{front.service}</div>
                            {changed && (
                              <Input
                                aria-label={`Justificativa de ${front.service}`}
                                placeholder="Justifique a nova previsão"
                                className={cn(
                                  "mt-1 h-7 text-xs",
                                  (front.note ?? "").trim().length < 5 && "border-warning",
                                )}
                                disabled={!editable}
                                value={front.note ?? ""}
                                maxLength={2000}
                                onChange={(e) => {
                                  setNotes(new Map(notes).set(front.position, e.target.value));
                                  setDirty(true);
                                }}
                              />
                            )}
                          </td>
                          <td className="px-1 py-1">
                            <MoneyInput
                              label={`Previsão de ${front.service}`}
                              disabled={!editable}
                              value={Number(front.forecast ?? front.viability)}
                              className={cn("font-semibold", changed && "text-brand")}
                              onChange={(v) => {
                                setForecasts(new Map(forecasts).set(front.position, v));
                                setDirty(true);
                              }}
                            />
                          </td>
                          <td className="num px-2 py-2 text-right text-xs">
                            {money(b?.balance ?? 0)}
                          </td>
                          <td
                            className={cn(
                              "num px-2 py-2 text-right text-xs",
                              Math.abs(b?.unallocated ?? 0) > 1
                                ? "font-semibold text-danger"
                                : "text-muted-foreground",
                            )}
                          >
                            {money(b?.unallocated ?? 0)}
                          </td>
                          {editable && (
                            <td className="whitespace-nowrap px-1 py-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                title="Distribuir o saldo pela duração da frente"
                                aria-label={`Distribuir saldo de ${front.service}`}
                                onClick={() => spread(front)}
                              >
                                <Split className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                title="Adiar a frente em 1 mês"
                                aria-label={`Adiar ${front.service} em 1 mês`}
                                onClick={() => postpone(front)}
                              >
                                <ArrowRight className="size-3.5" />
                              </Button>
                            </td>
                          )}
                          {months.map((m) => (
                            <td key={m} className="px-0.5 py-1">
                              <MoneyInput
                                label={`${front.service} em ${monthShort(m)}`}
                                disabled={!editable}
                                value={row.get(m) ?? 0}
                                onChange={(v) => setCell(front.position, m, v)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                </Fragment>
              ))}
              <tr className="bg-brand text-xs font-semibold text-white">
                <td className="sticky left-0 z-10 bg-brand px-4 py-2.5">Total do mês</td>
                <td className="num px-2 text-right">
                  {money(fronts.reduce((s, f) => s + Number(f.forecast ?? f.viability), 0))}
                </td>
                <td className="num px-2 text-right">{money(totalBalance)}</td>
                <td className="num px-2 text-right">{money(totalBalance - totalAllocated)}</td>
                {editable && <td />}
                {totals.map((v, i) => (
                  <td key={months[i]} className="num px-2 text-right">
                    {money(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
      {editable && submitBlocked && (
        <p className="text-sm text-warning-foreground">
          Para enviar: {submitBlocked}. Use <Split className="inline size-3.5" /> para distribuir o
          saldo de uma frente.
        </p>
      )}
      {!editable && !reviewing && <p className="text-xs text-muted-foreground">Somente leitura.</p>}
      <p className="text-xs text-muted-foreground">
        Valores em R$, sem permuta. Saldo = contratado + a contratar − pago no UAU até hoje.
      </p>
    </div>
  );
}

const addYear = (month: string) => `${Number(month.slice(0, 4)) + 1}${month.slice(4, 7)}-01`;
