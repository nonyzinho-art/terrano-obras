// Cost planning (fase 1): reads the "PLANEJAMENTO DE OBRAS" sheet of the
// "CUSTO DE OBRAS" workbook and summarizes viability × forecast per front and stage.

export type CostPlanStage = { stage: number; name: string; lots: number | null };

export interface CostPlanImportItem {
  row: number;
  code: string;
  insumo: string;
  service: string;
  stage: number | null;
  /** Index (in `items`) of the parent row; detail rows are excluded from totals. */
  parent: number | null;
  viability: number;
  committed: number;
  toContract: number;
  adjustment: number;
  barter: number;
  forecast: number | null;
  startMonth: string | null;
  duration: number | null;
}

export interface CostPlanPreview {
  items: CostPlanImportItem[];
  stages: CostPlanStage[];
  errors: string[];
  warnings: string[];
  /** Totals row found at the end of the sheet, used to double-check the import. */
  sheetTotal: { viability: number; forecast: number | null } | null;
}

/** Row stored in Supabase (`cost_plan_items`). */
export interface CostPlanItem {
  id: string;
  plan_id: string;
  position: number;
  parent_position: number | null;
  item_code: string;
  insumo: string;
  service: string;
  stage: number | null;
  viability: number;
  committed: number;
  to_contract: number;
  adjustment: number;
  barter: number;
  forecast: number | null;
  start_month: string | null;
  duration_months: number | null;
  /** Engineer's justification when the forecast changes in a monthly revision. */
  note?: string;
}

export interface CostPlan {
  id: string;
  work_id: string;
  name: string;
  revision: number;
  source_filename: string | null;
  stages: CostPlanStage[];
  imported_at: string;
  /** Monthly re-planning workflow; imports start approved. */
  status?: "rascunho" | "enviada" | "aprovada" | "devolvida";
  competence?: string;
  base_plan_id?: string | null;
  version?: number;
  submitted_at?: string | null;
  decided_at?: string | null;
  decision_comment?: string;
}

const clean = (v: unknown) => String(v ?? "").trim();
const normalize = (v: unknown) =>
  clean(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Accepts numbers and pt-BR text ("1.234,56", "-R$ 10,00"); negatives are valid here. */
export function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || clean(value) === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) >= 1e13) throw new Error("valor inválido");
    return Math.round(value * 100) / 100;
  }
  if (typeof value !== "string") throw new Error("valor inválido");
  let text = value.trim().replace(/\s/g, "");
  const negative = /^-|^\(.*\)$/.test(text);
  text = text.replace(/^[-(]|\)$/g, "").replace(/^R\$/i, "");
  if (text === "-" || text === "") return 0;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("número inválido");
  const n = Math.round(Number(text) * 100) / 100;
  return negative ? -n : n;
}

function toMonth(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 7) + "-01";
  if (typeof value === "number" && value > 20000 && value < 80000) {
    // Excel serial date (days since 1899-12-30).
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return d.toISOString().slice(0, 7) + "-01";
  }
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-01`;
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) ?? text.match(/^(\d{2})\/(\d{4})$/);
  if (br) return br.length === 4 ? `${br[3]}-${br[2]}-01` : `${br[2]}-${br[1]}-01`;
  return null;
}

const COLUMNS = {
  code: (h: string) => h === "item",
  insumo: (h: string) => h === "insumo",
  service: (h: string) => h === "servico" || h === "frentedeservico",
  viability: (h: string) => h === "viabilidade",
  committed: (h: string) => h === "comprometido",
  toContract: (h: string) => h === "acontratar",
  adjustment: (h: string) => h.startsWith("aditivo"),
  barter: (h: string) => h === "permuta",
  forecast: (h: string) => h.startsWith("prevaotermino") || h.startsWith("previsao"),
  startMonth: (h: string) => h === "mes",
  duration: (h: string) => h === "duracao",
} as const;
type Column = keyof typeof COLUMNS;

/** Stage from codes like "8.2" (2ª etapa). Plain codes ("5", "10") carry no stage. */
const explicitStage = (code: string) => {
  const m = code.match(/^\d+\.(\d{1,2})$/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 20 ? n : null;
};

export const stageName = (stage: number) => `${stage}ª etapa`;

/** "PERMUTAS - FUTURAS": a deduction shown apart; the workbook total does not include it. */
export const isDeduction = (service: string) => normalize(service).startsWith("permuta");

export function parseCostPlanRows(data: unknown[][]): CostPlanPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const headerIndex = data.findIndex((row) => {
    const h = row.map(normalize);
    return h.some(COLUMNS.service) && h.includes("viabilidade");
  });
  if (headerIndex < 0)
    return {
      items: [],
      stages: [],
      errors: ["Não encontrei o cabeçalho com SERVIÇO e VIABILIDADE nesta aba."],
      warnings,
      sheetTotal: null,
    };
  const header = data[headerIndex]!.map(normalize);
  const col = {} as Record<Column, number>;
  for (const key of Object.keys(COLUMNS) as Column[]) col[key] = header.findIndex(COLUMNS[key]);
  for (const key of ["service", "viability", "committed"] as const)
    if (col[key] < 0) errors.push(`Coluna obrigatória não encontrada: ${key}.`);
  if (errors.length) return { items: [], stages: [], errors, warnings, sheetTotal: null };

  const cell = (row: unknown[], key: Column) => (col[key] < 0 ? null : row[col[key]]);
  const items: CostPlanImportItem[] = [];
  let sheetTotal: CostPlanPreview["sheetTotal"] = null;
  let parent: number | null = null;
  for (let r = headerIndex + 1; r < data.length; r++) {
    const row = data[r]!;
    const service = clean(cell(row, "service"));
    const code = clean(cell(row, "code"));
    let money: Record<"viability" | "committed" | "toContract" | "adjustment" | "barter", number>;
    let forecast: number | null;
    try {
      money = {
        viability: parseMoney(cell(row, "viability")) ?? 0,
        committed: parseMoney(cell(row, "committed")) ?? 0,
        toContract: parseMoney(cell(row, "toContract")) ?? 0,
        adjustment: parseMoney(cell(row, "adjustment")) ?? 0,
        barter: parseMoney(cell(row, "barter")) ?? 0,
      };
      forecast = parseMoney(cell(row, "forecast"));
    } catch {
      errors.push(`Linha ${r + 1}: valor que não é número.`);
      continue;
    }
    if (!service) {
      // A row of numbers without a service is the sheet's totals line.
      if (parseMoney(cell(row, "viability")) !== null) {
        sheetTotal = { viability: money.viability, forecast };
        break;
      }
      continue;
    }
    const name = normalize(service);
    if (code || name.startsWith("permuta")) parent = null;
    const isDetail = parent !== null && !code;
    const durationCell = cell(row, "duration");
    const durationRaw = clean(durationCell) === "" ? NaN : Number(durationCell);
    items.push({
      row: r + 1,
      code,
      insumo: clean(cell(row, "insumo")),
      service,
      stage: null,
      parent: isDetail ? parent : null,
      ...money,
      forecast,
      startMonth: toMonth(cell(row, "startMonth")),
      duration:
        Number.isInteger(durationRaw) && durationRaw >= 0 && durationRaw <= 240
          ? durationRaw
          : null,
    });
    if (code && name.includes("indireto")) parent = items.length - 1;
  }
  if (!items.length) errors.push("Nenhuma frente de serviço encontrada abaixo do cabeçalho.");

  // Stages: explicit by code; repeated fronts without a code suffix inherit the block above.
  const top = items.filter((i) => i.parent === null);
  const repeats = new Map<string, number>();
  for (const i of top)
    repeats.set(normalize(i.service), (repeats.get(normalize(i.service)) ?? 0) + 1);
  let lastStage: number | null = null;
  for (const item of top) {
    const stage = explicitStage(item.code);
    if (stage) lastStage = stage;
    item.stage = stage ?? ((repeats.get(normalize(item.service)) ?? 0) > 1 ? lastStage : null);
  }

  for (const item of top)
    if (
      item.forecast !== null &&
      Math.abs(item.committed + item.toContract + item.barter - item.forecast) > 1
    )
      warnings.push(
        `Linha ${item.row} (${item.service}): previsão ao término difere de comprometido + a contratar + permuta.`,
      );
  const totals = summarize(top.filter((i) => !isDeduction(i.service)));
  if (sheetTotal && Math.abs(sheetTotal.viability - totals.viability) > 1)
    warnings.push(
      `A soma da viabilidade (${totals.viability.toFixed(2)}) difere do total da planilha (${sheetTotal.viability.toFixed(2)}).`,
    );
  const stageNumbers = [...new Set(top.map((i) => i.stage).filter((s): s is number => !!s))].sort(
    (a, b) => a - b,
  );
  return {
    items,
    stages: stageNumbers.map((stage) => ({ stage, name: stageName(stage), lots: null })),
    errors,
    warnings,
    sheetTotal,
  };
}

/** Finds "1ª ETAPA | 513 | LOTES" style cells in any sheet of the workbook. */
export function findStageLots(sheets: { data: unknown[][] }[]) {
  const lots = new Map<number, number>();
  for (const { data } of sheets)
    for (const row of data)
      row.forEach((value, i) => {
        const m = normalize(value).match(/^(\d{1,2})a?etapa$/);
        if (!m || lots.has(Number(m[1]))) return;
        const next = row.slice(i + 1).find((v) => typeof v === "number");
        if (typeof next === "number" && Number.isInteger(next) && next > 0 && next < 100000)
          lots.set(Number(m[1]), next);
      });
  return lots;
}

type Amounts = {
  viability: number;
  committed: number;
  toContract: number;
  adjustment: number;
  barter: number;
  forecast: number | null;
};

/** Totals of top-level rows. A blank forecast counts as the viability (no deviation). */
export function summarize(rows: Amounts[]) {
  const sum = (pick: (r: Amounts) => number) =>
    Math.round(rows.reduce((total, r) => total + pick(r), 0) * 100) / 100;
  const viability = sum((r) => r.viability);
  const forecast = sum((r) => r.forecast ?? r.viability);
  return {
    viability,
    committed: sum((r) => r.committed),
    toContract: sum((r) => r.toContract),
    barter: sum((r) => r.barter),
    forecast,
    deviation: Math.round((forecast - viability) * 100) / 100,
    deviationPct: viability ? ((forecast - viability) / Math.abs(viability)) * 100 : 0,
  };
}

/** Maps a stored row to the shape used by `summarize`. */
export const storedAmounts = (i: CostPlanItem): Amounts => ({
  viability: Number(i.viability),
  committed: Number(i.committed),
  toContract: Number(i.to_contract),
  adjustment: Number(i.adjustment),
  barter: Number(i.barter),
  forecast: i.forecast === null ? null : Number(i.forecast),
});
