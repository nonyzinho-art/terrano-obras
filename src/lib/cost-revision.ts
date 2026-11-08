// Monthly re-planning (etapa A): the engineer spreads each front's cash balance over the
// coming months (R$), the coordination approves. Pure helpers, shared by screen and tests.
import { addMonths, buildCashFlow, type DisbursementRow, type MonthGrid } from "./cost-flow";
import { isDeduction, type CostPlanItem } from "./cost-plan";

export type RevisionStatus = "rascunho" | "enviada" | "aprovada" | "devolvida";
export const REVISION_STATUS: Record<RevisionStatus, string> = {
  rascunho: "Rascunho",
  enviada: "Aguardando aprovação",
  aprovada: "Aprovada",
  devolvida: "Devolvida para ajuste",
};
export type MonthValue = { position: number; month: string; amount: number };

const round = (n: number) => Math.round(n * 100) / 100;

export const monthOf = (today: string) => today.slice(0, 7) + "-01";

export function monthRange(from: string, to: string) {
  const months: string[] = [];
  for (let m = from; m <= to && months.length < 600; m = addMonths(m, 1)) months.push(m);
  return months;
}

export function gridFromRows(rows: MonthValue[]): MonthGrid {
  const grid: MonthGrid = new Map();
  for (const r of rows) {
    const row = grid.get(r.position) ?? new Map<string, number>();
    row.set(r.month, round((row.get(r.month) ?? 0) + Number(r.amount)));
    grid.set(r.position, row);
  }
  return grid;
}

export function gridToRows(grid: MonthGrid, from?: string): MonthValue[] {
  const rows: MonthValue[] = [];
  for (const [position, row] of grid)
    for (const [month, amount] of row)
      if ((!from || month >= from) && Math.abs(amount) >= 0.005)
        rows.push({ position, month, amount: round(amount) });
  return rows.sort((a, b) => a.position - b.position || a.month.localeCompare(b.month));
}

/** Spreads an amount evenly; cents left over go to the last month so the total is exact. */
export function distribute(amount: number, start: string, duration: number) {
  const months = Math.max(1, Math.floor(duration));
  const part = Math.floor((amount / months) * 100) / 100;
  const row = new Map<string, number>();
  for (let k = 0; k < months; k++) row.set(addMonths(start, k), part);
  const last = addMonths(start, months - 1);
  row.set(last, round(amount - part * (months - 1)));
  return row;
}

/** Moves every value of a front n months later (or earlier, with a negative n). */
export function shiftRow(row: Map<string, number>, n: number) {
  const shifted = new Map<string, number>();
  for (const [month, value] of row) shifted.set(addMonths(month, n), value);
  return shifted;
}

/** Applies the engineer's new forecast the same way the database does. */
export function withForecast(item: CostPlanItem, forecast: number): CostPlanItem {
  return {
    ...item,
    forecast,
    to_contract: round(forecast - Number(item.committed) - Number(item.barter)),
  };
}

export interface FrontBalance {
  /** Cash still to disburse from this month on (paid already discounted, barter excluded). */
  balance: number;
  allocated: number;
  unallocated: number;
}

/** Balance, allocated and unallocated cash per front (by position) for the given grid. */
export function frontBalances(
  items: CostPlanItem[],
  grid: MonthGrid,
  disbursements: DisbursementRow[],
  today: string,
) {
  const current = monthOf(today);
  const fronts = items.filter((i) => i.parent_position === null && !isDeduction(i.service));
  const flow = buildCashFlow(items, fronts, disbursements, today);
  const result = new Map<number, FrontBalance>();
  for (const front of fronts) {
    const balance = flow.perFront.get(front.id)?.remaining ?? 0;
    let allocated = 0;
    for (const [month, value] of grid.get(front.position) ?? [])
      if (month >= current) allocated += value;
    result.set(front.position, {
      balance: round(balance),
      allocated: round(allocated),
      unallocated: round(balance - allocated),
    });
  }
  return { balances: result, flow };
}

/** First grid of a revision: the rule-based projection (or the base revision's grid). */
export function seedGrid(
  items: CostPlanItem[],
  disbursements: DisbursementRow[],
  today: string,
  baseGrid?: MonthGrid,
): MonthGrid {
  const current = monthOf(today);
  if (baseGrid && baseGrid.size) {
    const grid: MonthGrid = new Map();
    for (const [position, row] of baseGrid)
      grid.set(position, new Map([...row].filter(([month]) => month >= current)));
    return grid;
  }
  const fronts = items.filter((i) => i.parent_position === null && !isDeduction(i.service));
  return buildCashFlow(items, fronts, disbursements, today).ruleByFront;
}

export interface RevisionChange {
  position: number;
  service: string;
  forecastBefore: number;
  forecastAfter: number;
  note: string;
}

/** Fronts whose forecast changed from the base revision (what the coordination reviews). */
export function forecastChanges(base: CostPlanItem[], next: CostPlanItem[]): RevisionChange[] {
  const before = new Map(base.map((i) => [i.position, i]));
  return next
    .filter((i) => i.parent_position === null && !isDeduction(i.service))
    .map((i) => ({
      position: i.position,
      service: i.service,
      forecastBefore: Number(
        before.get(i.position)?.forecast ?? before.get(i.position)?.viability ?? 0,
      ),
      forecastAfter: Number(i.forecast ?? i.viability),
      note: i.note ?? "",
    }))
    .filter((c) => Math.abs(c.forecastAfter - c.forecastBefore) >= 0.5);
}

/** Total planned cash per month for the given months. */
export function monthTotals(grid: MonthGrid, months: string[], positions?: Set<number>) {
  return months.map((month) => {
    let total = 0;
    for (const [position, row] of grid)
      if (!positions || positions.has(position)) total += row.get(month) ?? 0;
    return round(total);
  });
}
