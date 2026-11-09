import type { BudgetMeasurement, BudgetMeasurementItem, MeasurementAdvance } from "./types";

const cents = (n: number) => Math.round(n * 100) / 100;

/** Valor medido de uma medição (mesmo arredondamento por item usado no histórico). */
export const measuredValue = (lines: Pick<BudgetMeasurementItem, "quantity" | "unit_price">[]) =>
  cents(lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unit_price * 100) / 100, 0));

export interface Settlement {
  measured: number;
  retentionPercent: number;
  retention: number;
  advances: number;
  carriedIn: number;
  deducted: number;
  carriedOut: number;
  /** Valor para emissão da NF: medido − adiantamentos descontados. */
  invoice: number;
  /** Valor líquido a pagar: NF − retenção. */
  payable: number;
}

/**
 * Desconta os adiantamentos do valor medido. O desconto nunca deixa o pagamento negativo:
 * o que não couber (depois da retenção) fica como saldo para a próxima medição.
 */
export function settle(
  measured: number,
  retentionPercent: number,
  advances: number,
  carriedIn: number,
): Settlement {
  const retention = cents((measured * retentionPercent) / 100);
  const owed = cents(carriedIn + advances);
  const deducted = cents(Math.min(Math.max(0, measured - retention), owed));
  const invoice = cents(measured - deducted);
  return {
    measured: cents(measured),
    retentionPercent,
    retention,
    advances: cents(advances),
    carriedIn: cents(carriedIn),
    deducted,
    carriedOut: cents(owed - deducted),
    invoice,
    payable: cents(invoice - retention),
  };
}

const sumAdvances = (list: Pick<MeasurementAdvance, "amount">[]) =>
  cents(list.reduce((s, a) => s + Number(a.amount), 0));

/**
 * Saldo de adiantamento que chega a uma medição: percorre, em ordem, as medições aprovadas
 * anteriores ao período (ignorando a própria medição e a que ela revisa).
 */
export function carriedInFor(
  target: Pick<BudgetMeasurement, "id" | "period_start"> & { replaces_id?: string | null },
  measurements: BudgetMeasurement[],
  lines: BudgetMeasurementItem[],
  advances: MeasurementAdvance[],
) {
  const prior = measurements
    .filter(
      (m) =>
        m.status === "aprovada" &&
        m.id !== target.id &&
        m.id !== target.replaces_id &&
        m.period_end < target.period_start,
    )
    .sort((a, b) => a.period_start.localeCompare(b.period_start) || a.id.localeCompare(b.id));
  let carry = 0;
  for (const m of prior) {
    carry = settle(
      measuredValue(lines.filter((l) => l.measurement_id === m.id)),
      Number(m.retention_percent ?? 0),
      sumAdvances(advances.filter((a) => a.measurement_id === m.id)),
      carry,
    ).carriedOut;
  }
  return carry;
}

/** Síntese financeira de uma medição salva. */
export function settlementFor(
  m: BudgetMeasurement,
  measurements: BudgetMeasurement[],
  lines: BudgetMeasurementItem[],
  advances: MeasurementAdvance[],
) {
  return settle(
    measuredValue(lines.filter((l) => l.measurement_id === m.id)),
    Number(m.retention_percent ?? 0),
    sumAdvances(advances.filter((a) => a.measurement_id === m.id)),
    carriedInFor(m, measurements, lines, advances),
  );
}

export interface UauAdvance {
  process: string;
  supplier: string;
  amount: number;
  paid_on: string | null;
  kind: string;
  who: string;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

const pad = (n: number) => String(n).padStart(2, "0");
/** Data do Excel (Date, número de série ou texto dd/mm/aaaa) para AAAA-MM-DD. */
export function excelDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return excelDate(d);
  }
  const t = String(value ?? "").trim();
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${pad(Number(br[2]))}-${pad(Number(br[1]))}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function money(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? cents(value) : null;
  let t = String(value ?? "")
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? cents(n) : null;
}

/**
 * Lê a exportação de adiantamentos do UAU (colunas Processo, Valor, Data, Nome Fornecedor…).
 * O cabeçalho pode estar em qualquer linha (a aba ADIANTAMENTO da medição começa na linha 3).
 */
export function parseUauAdvances(rows: unknown[][]): { rows: UauAdvance[]; error?: string } {
  const headerIndex = rows.findIndex((r) => {
    const cells = r.map(norm);
    return (
      cells.includes("processo") &&
      cells.includes("valor") &&
      cells.some((c) => c.includes("fornecedor"))
    );
  });
  if (headerIndex < 0)
    return {
      rows: [],
      error:
        'Não encontrei as colunas "Processo", "Valor" e "Nome Fornecedor" da exportação de adiantamentos do UAU.',
    };
  const header = rows[headerIndex]!.map(norm);
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const c = {
    process: col("processo"),
    amount: col("valor"),
    date: col("data"),
    supplier: col("nomefornecedor", "fornecedor"),
    kind: col("tipo"),
    who: col("quem"),
  };
  const list: UauAdvance[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(headerIndex + 1)) {
    const process = String(r[c.process] ?? "")
      .trim()
      .replace(/\.0+$/, "");
    const amount = money(r[c.amount]);
    if (!process || !amount || amount <= 0 || seen.has(process)) continue;
    seen.add(process);
    list.push({
      process: process.slice(0, 40),
      supplier:
        String(r[c.supplier] ?? "")
          .trim()
          .slice(0, 200) || "Fornecedor não informado",
      amount,
      paid_on: c.date >= 0 ? excelDate(r[c.date]) : null,
      kind: c.kind >= 0 ? String(r[c.kind] ?? "").trim() : "",
      who: c.who >= 0 ? String(r[c.who] ?? "").trim() : "",
    });
  }
  return list.length
    ? { rows: list }
    : { rows: [], error: "A exportação não tem pagamentos com processo e valor." };
}
