// Cash flow (fase 2): realized disbursement from the UAU "Desembolso" export plus the
// remaining forecast of each front spread evenly from its start month, as the workbook does.
import { isDeduction, parseMoney, type CostPlanItem } from "./cost-plan";

export type DisbursementStatus = "pago" | "a_pagar";
export interface DisbursementRow {
  insumo: string;
  month: string; // yyyy-mm-01
  status: DisbursementStatus;
  amount: number;
}

export interface DisbursementPreview {
  rows: DisbursementRow[];
  uauWork: string;
  errors: string[];
  warnings: string[];
  paid: number;
  scheduled: number;
}

const clean = (v: unknown) => String(v ?? "").trim();
const normalize = (v: unknown) =>
  clean(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const round = (n: number) => Math.round(n * 100) / 100;

export const monthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}-01`;
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
};

/** Reads the UAU "Desembolso" export (Ano, Mes, Insumo, Valor Liquido, Status). */
export function parseDisbursementRows(data: unknown[][]): DisbursementPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const headerIndex = data.findIndex((row) => {
    const h = row.map(normalize);
    return h.includes("insumo") && h.includes("valorliquido") && h.includes("ano");
  });
  if (headerIndex < 0)
    return {
      rows: [],
      uauWork: "",
      errors: ["Não encontrei as colunas Ano, Mes, Insumo e Valor Liquido nesta aba."],
      warnings,
      paid: 0,
      scheduled: 0,
    };
  const h = data[headerIndex]!.map(normalize);
  const col = {
    work: h.indexOf("obra"),
    year: h.indexOf("ano"),
    month: h.indexOf("mes"),
    insumo: h.indexOf("insumo"),
    amount: h.indexOf("valorliquido"),
    status: h.indexOf("status"),
  };
  if (col.month < 0) errors.push("Coluna Mes não encontrada.");
  const sums = new Map<string, DisbursementRow>();
  const works = new Set<string>();
  let skipped = 0;
  let paid = 0;
  let scheduled = 0;
  for (const row of data.slice(headerIndex + 1)) {
    const insumo = clean(row[col.insumo]);
    const year = Number(row[col.year]);
    const month = Number(row[col.month]);
    if (!insumo || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      if (row.some((c) => clean(c))) skipped++;
      continue;
    }
    let amount: number | null;
    try {
      amount = parseMoney(row[col.amount]);
    } catch {
      skipped++;
      continue;
    }
    if (amount === null) continue;
    const raw = col.status < 0 ? "pago" : normalize(row[col.status]);
    const status: DisbursementStatus | null =
      raw === "pago" ? "pago" : raw === "pagar" || raw === "apagar" ? "a_pagar" : null;
    if (!status) {
      skipped++;
      continue;
    }
    if (col.work >= 0 && clean(row[col.work])) works.add(clean(row[col.work]));
    const key = `${insumo}|${monthKey(year, month)}|${status}`;
    const current = sums.get(key);
    if (current) current.amount = round(current.amount + amount);
    else sums.set(key, { insumo, month: monthKey(year, month), status, amount });
    if (status === "pago") paid += amount;
    else scheduled += amount;
  }
  if (skipped)
    warnings.push(`${skipped} linhas ignoradas por falta de insumo, data, valor ou status.`);
  if (works.size > 1)
    warnings.push(`O arquivo tem mais de uma obra do UAU: ${[...works].join(", ")}.`);
  const rows = [...sums.values()].filter((r) => Math.abs(r.amount) >= 0.005);
  if (!rows.length && !errors.length) errors.push("Nenhum desembolso encontrado.");
  return {
    rows,
    uauWork: [...works].join(", "),
    errors,
    warnings,
    paid: round(paid),
    scheduled: round(scheduled),
  };
}

export interface FrontFlow {
  /** Paid up to the current month. */
  realized: number;
  /** Cash still to be disbursed (contracted, scheduled in UAU and to contract). */
  remaining: number;
  /** Paid above committed + to contract (barter excluded). */
  overrun: number;
}
export interface CashFlowMonth {
  month: string;
  realized: number;
  projected: number;
  cumulative: number;
}

/** Insumo codes look like "I04363"; plain item numbers ("13") are not UAU insumos. */
const isInsumo = (code: string) => /^[A-Z]\d{3,}$/i.test(code.trim());

/**
 * Builds the monthly cash flow for the given fronts (top-level rows of a plan), following
 * the workbook. Barter (permuta) is paid with lots, so it never becomes cash.
 * - Realized: paid disbursement up to the current month, matched by insumo. An insumo
 *   shared by several fronts is split in proportion to their cash forecasts; a front with
 *   detail rows (Indiretos) takes the insumos of its details.
 * The projection starts in the current month, which is not over yet.
 * - Scheduled: "Pagar" entries of UAU, in their own month (overdue ones go to this month).
 * - Contracted and not yet paid or scheduled: this month.
 * - To contract: spread evenly over the front's duration, from its start month (or this
 *   month, whichever is later).
 */
export function buildCashFlow(
  allItems: CostPlanItem[],
  fronts: CostPlanItem[],
  disbursements: DisbursementRow[],
  today: string,
) {
  const current = today.slice(0, 7) + "-01";
  const paid = new Map<string, Map<string, number>>();
  const toPay = new Map<string, Map<string, number>>();
  let scheduled = 0;
  const planInsumos = new Set<string>();
  const top = allItems.filter((i) => i.parent_position === null && !isDeduction(i.service));
  const insumosOf = (front: CostPlanItem) => {
    const own = isInsumo(front.insumo) ? [front.insumo.trim()] : [];
    const details = allItems
      .filter((d) => d.parent_position === front.position && isInsumo(d.insumo))
      .map((d) => d.insumo.trim());
    return [...new Set([...own, ...details])];
  };
  for (const front of top) insumosOf(front).forEach((i) => planInsumos.add(i));
  for (const d of disbursements) {
    if (!planInsumos.has(d.insumo)) continue;
    const isPaid = d.status === "pago" && d.month <= current;
    const target = isPaid ? paid : toPay;
    const month = isPaid || d.month >= current ? d.month : current;
    if (!isPaid) scheduled += d.amount;
    const byMonth = target.get(d.insumo) ?? new Map<string, number>();
    byMonth.set(month, (byMonth.get(month) ?? 0) + d.amount);
    target.set(d.insumo, byMonth);
  }
  const cash = (f: CostPlanItem) => Number(f.committed) + Number(f.to_contract);
  const base = (f: CostPlanItem) => Math.max(0, cash(f));
  const sharers = new Map<string, CostPlanItem[]>();
  for (const front of top)
    for (const insumo of insumosOf(front))
      sharers.set(insumo, [...(sharers.get(insumo) ?? []), front]);
  const share = (front: CostPlanItem, insumo: string) => {
    const group = sharers.get(insumo) ?? [front];
    const total = group.reduce((s, f) => s + base(f), 0);
    return total > 0 ? base(front) / total : 1 / group.length;
  };

  const realizedByMonth = new Map<string, number>();
  const projectedByMonth = new Map<string, number>();
  const perFront = new Map<string, FrontFlow>();
  for (const front of fronts) {
    if (isDeduction(front.service) || front.parent_position !== null) continue;
    let realized = 0;
    let programmed = 0;
    const project = (month: string, value: number) =>
      projectedByMonth.set(month, (projectedByMonth.get(month) ?? 0) + value);
    for (const insumo of insumosOf(front)) {
      const part = share(front, insumo);
      for (const [month, amount] of paid.get(insumo) ?? []) {
        realized += amount * part;
        realizedByMonth.set(month, (realizedByMonth.get(month) ?? 0) + amount * part);
      }
      for (const [month, amount] of toPay.get(insumo) ?? []) {
        programmed += amount * part;
        project(month, amount * part);
      }
    }
    const committedLeft = Math.max(0, Number(front.committed) - realized - programmed);
    if (committedLeft > 0.005) project(current, committedLeft);
    const toContract = Math.max(0, Number(front.to_contract));
    const start = front.start_month && front.start_month > current ? front.start_month : current;
    const duration = Math.max(1, front.duration_months ?? 1);
    if (toContract > 0.005)
      for (let k = 0; k < duration; k++) project(addMonths(start, k), toContract / duration);
    perFront.set(front.id, {
      realized: round(realized),
      remaining: round(programmed + committedLeft + toContract),
      overrun: round(Math.max(0, realized - cash(front))),
    });
  }

  const months = [...new Set([...realizedByMonth.keys(), ...projectedByMonth.keys()])].sort();
  const series: CashFlowMonth[] = [];
  let cumulative = 0;
  if (months.length)
    for (let m = months[0]!; m <= months.at(-1)!; m = addMonths(m, 1)) {
      const realized = round(realizedByMonth.get(m) ?? 0);
      const projected = round(projectedByMonth.get(m) ?? 0);
      cumulative += realized + projected;
      series.push({ month: m, realized, projected, cumulative: round(cumulative) });
    }
  const totals = [...perFront.values()].reduce(
    (t, f) => ({
      realized: t.realized + f.realized,
      remaining: t.remaining + f.remaining,
      overrun: t.overrun + f.overrun,
    }),
    { realized: 0, remaining: 0, overrun: 0 },
  );
  const future = series.filter((s) => s.projected > 0);
  const peak = future.reduce<CashFlowMonth | null>(
    (best, s) => (!best || s.projected > best.projected ? s : best),
    null,
  );
  return {
    series,
    perFront,
    realized: round(totals.realized),
    remaining: round(totals.remaining),
    overrun: round(totals.overrun),
    scheduled: round(scheduled),
    peak,
    end: future.at(-1)?.month ?? null,
    currentMonth: current,
  };
}
