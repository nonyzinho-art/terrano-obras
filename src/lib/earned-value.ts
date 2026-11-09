import { measuredValue, settlementFor } from "./measurement-advances";
import { hasValidPlan, plannedFraction } from "./measurement-progress";
import type { BudgetMeasurement, BudgetMeasurementItem, MeasurementAdvance } from "./types";

/**
 * Curva S financeira (valor agregado) de um ou mais contratos:
 * - Previsto: valor do contrato distribuído linearmente entre as datas planejadas.
 * - Executado: valor das medições aprovadas, no fim do período medido.
 * - Pago: adiantamentos na data do pagamento + líquido de cada medição aprovada.
 */
export interface EvContract {
  id: string;
  total: number;
  planned_start?: string | null | undefined;
  planned_end?: string | null | undefined;
  /** Linha de base vigente; sem ela, o previsto usa as datas atuais. */
  baseline?: { planned_start: string; planned_end: string } | null | undefined;
}
export interface EvPoint {
  month: string;
  planned: number | null;
  /** Previsto pelas datas atuais, quando diferem da linha de base. */
  replanned: number | null;
  executed: number | null;
  paid: number | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return iso(Date.UTC(y, m, 0));
};
const prevMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return iso(Date.UTC(y, m - 2, 1));
};
const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return iso(Date.UTC(y, m, 1));
};

export function earnedValue(
  contracts: EvContract[],
  measurements: BudgetMeasurement[],
  lines: BudgetMeasurementItem[],
  advances: MeasurementAdvance[],
  today: string,
) {
  const ids = new Set(contracts.map((c) => c.id));
  // Previsto oficial: linha de base vigente (ou as datas atuais, se ainda não houver).
  const planned = contracts
    .map((c) => ({
      ...c,
      current_start: c.planned_start,
      current_end: c.planned_end,
      planned_start: c.baseline?.planned_start ?? c.planned_start,
      planned_end: c.baseline?.planned_end ?? c.planned_end,
    }))
    .filter((c) => c.total > 0 && hasValidPlan(c.planned_start, c.planned_end));
  const currentValid = (c: (typeof planned)[number]) =>
    hasValidPlan(c.current_start, c.current_end);
  const replannedDiffers = planned.some(
    (c) =>
      currentValid(c) && (c.current_start !== c.planned_start || c.current_end !== c.planned_end),
  );
  const approved = measurements.filter((m) => ids.has(m.budget_id) && m.status === "aprovada");
  // Eventos datados (valor executado e valor pago).
  const executedEvents: [string, number][] = [];
  const paidEvents: [string, number][] = [];
  for (const m of approved) {
    const own = measurements.filter((x) => x.budget_id === m.budget_id);
    const s = settlementFor(m, own, lines, advances);
    executedEvents.push([
      m.period_end,
      measuredValue(lines.filter((l) => l.measurement_id === m.id)),
    ]);
    paidEvents.push([m.period_end, s.payable]);
    for (const a of advances)
      if (a.measurement_id === m.id) paidEvents.push([a.paid_on ?? m.period_end, Number(a.amount)]);
  }
  const upTo = (events: [string, number][], date: string) =>
    cents(events.reduce((sum, [d, v]) => (d <= date ? sum + v : sum), 0));
  const plannedAt = (date: string) =>
    cents(
      planned.reduce(
        (sum, c) => sum + c.total * plannedFraction(c.planned_start, c.planned_end, date),
        0,
      ),
    );
  const replannedAt = (date: string) =>
    cents(
      planned.reduce(
        (sum, c) =>
          sum +
          c.total *
            (currentValid(c)
              ? plannedFraction(c.current_start, c.current_end, date)
              : plannedFraction(c.planned_start, c.planned_end, date)),
        0,
      ),
    );

  const dates = [
    today,
    ...planned.flatMap((c) => [c.planned_start!, c.planned_end!]),
    ...planned.flatMap((c) => (currentValid(c) ? [c.current_start!, c.current_end!] : [])),
    ...executedEvents.map(([d]) => d),
    ...paidEvents.map(([d]) => d),
  ].sort();
  const series: EvPoint[] = [];
  const currentMonth = today.slice(0, 8) + "01";
  for (
    // Começa um mês antes, com tudo em zero, para a curva partir da origem.
    let m = prevMonth(dates[0]!.slice(0, 8) + "01");
    m <= dates.at(-1)!.slice(0, 8) + "01" && series.length < 600;
    m = nextMonth(m)
  ) {
    const end = monthEnd(m);
    const past = m <= currentMonth;
    const cut = end > today ? today : end;
    series.push({
      month: m,
      planned: planned.length ? plannedAt(end) : null,
      replanned: replannedDiffers ? replannedAt(end) : null,
      executed: past ? upTo(executedEvents, cut) : null,
      paid: past ? upTo(paidEvents, cut) : null,
    });
  }

  const plannedToday = plannedAt(today);
  const executed = upTo(executedEvents, today);
  const paid = upTo(paidEvents, today);
  const plannedTotal = cents(planned.reduce((s, c) => s + c.total, 0));
  // Atraso em dias: quando o previsto alcançou (ou alcançará) o valor já executado.
  let delayDays: number | null = null;
  if (planned.length && plannedTotal > 0) {
    const now = Date.parse(today);
    const target = Math.min(executed, plannedTotal);
    if (target < plannedToday) {
      let t = now;
      while (t > now - 3650 * DAY && plannedAt(iso(t - DAY)) > target) t -= DAY;
      delayDays = Math.round((now - t) / DAY);
    } else {
      let t = now;
      while (t < now + 3650 * DAY && plannedAt(iso(t)) < target) t += DAY;
      delayDays = -Math.round((t - now) / DAY);
    }
  }
  return {
    series,
    currentMonth,
    /** As datas atuais de algum contrato diferem da linha de base. */
    replannedDiffers,
    usesBaseline: planned.some((c) => !!c.baseline),
    plannedToday,
    plannedTotal,
    executed,
    paid,
    /** Índice de desempenho de prazo (executado ÷ previsto até hoje). */
    spi: plannedToday > 0 ? executed / plannedToday : null,
    /** Positivo: dias de atraso. Negativo: dias adiantado. */
    delayDays,
    /** Pago acima do executado (adiantamento ainda não coberto por produção). */
    paidAhead: cents(Math.max(0, paid - executed)),
    hasPlan: planned.length > 0,
    withoutPlan: contracts.filter(
      (c) => c.total > 0 && !hasValidPlan(c.planned_start, c.planned_end),
    ).length,
  };
}
export type EarnedValue = ReturnType<typeof earnedValue>;
