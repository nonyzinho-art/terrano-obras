import { describe, expect, it } from "vitest";
import type { CostPlanItem } from "./cost-plan";
import { addMonths, buildCashFlow, parseDisbursementRows, type DisbursementRow } from "./cost-flow";

const front = (position: number, service: string, values: Partial<CostPlanItem>): CostPlanItem => ({
  id: `f${position}`,
  plan_id: "p",
  position,
  parent_position: null,
  item_code: "",
  insumo: "",
  service,
  stage: 1,
  viability: 0,
  committed: 0,
  to_contract: 0,
  adjustment: 0,
  barter: 0,
  forecast: null,
  start_month: null,
  duration_months: null,
  ...values,
});
const paid = (insumo: string, month: string, amount: number): DisbursementRow => ({
  insumo,
  month,
  status: "pago",
  amount,
});

describe("desembolso do UAU", () => {
  const header = [
    "Emp",
    "Obra",
    "Ano",
    "Mes",
    "Produto",
    "ItemPL",
    "Composição",
    "Insumo",
    "Banco",
    "c/c",
    "Valor Liquido",
    "Status",
  ];
  it("soma por insumo, mês e status, separando pago de a pagar", () => {
    const p = parseDisbursementRows([
      header,
      [92, "SCPDB", 2026, 10, 1, "01.04", "C1", "I04363", 756, "x", 1000, "Pago"],
      [92, "SCPDB", 2026, 10, 1, "01.04", "C1", "I04363", 756, "x", 250.5, "Pago"],
      [92, "TDOM1", 2027, 1, 1, "01.04", "C1", "I04363", 756, "x", 300, "Pagar"],
      [92, "SCPDB", 2026, 13, 1, "01.04", "C1", "I04363", 756, "x", 1, "Pago"],
    ]);
    expect(p.errors).toEqual([]);
    expect(p.rows).toEqual([
      { insumo: "I04363", month: "2026-10-01", status: "pago", amount: 1250.5 },
      { insumo: "I04363", month: "2027-01-01", status: "a_pagar", amount: 300 },
    ]);
    expect(p).toMatchObject({ paid: 1250.5, scheduled: 300, uauWork: "SCPDB, TDOM1" });
    expect(p.warnings.join(" ")).toMatch(/1 linhas ignoradas.*mais de uma obra/);
  });
  it("explica quando a aba não é a exportação de desembolso", () => {
    expect(parseDisbursementRows([["ITEM", "SERVIÇO"]]).errors[0]).toMatch(/Valor Liquido/);
  });
});

describe("fluxo financeiro", () => {
  const today = "2026-11-08";
  const pav = front(0, "PAVIMENTAÇÃO", {
    insumo: "I04363",
    committed: 600,
    to_contract: 300,
    barter: 1000,
    forecast: 1900,
    start_month: "2027-01-01",
    duration_months: 3,
  });
  const material = front(1, "PAVIMENTAÇÃO - MATERIAL", {
    insumo: "I04363",
    committed: 300,
    forecast: 300,
  });
  const indirect = front(2, "INDIRETOS", {
    insumo: "13",
    committed: 100,
    to_contract: 0,
    forecast: 100,
    stage: null,
  });
  const detail = front(3, "CANTEIRO", { insumo: "I04388", parent_position: 2, stage: null });
  const barter = front(4, "PERMUTAS - FUTURAS", { viability: -500, forecast: -500, stage: null });
  const all = [pav, material, indirect, detail, barter];
  const top = all.filter((i) => i.parent_position === null);
  const flow = buildCashFlow(
    all,
    top,
    [
      paid("I04363", "2026-10-01", 450),
      { insumo: "I04363", month: "2026-09-01", status: "a_pagar", amount: 30 },
      { insumo: "I04363", month: "2027-02-01", status: "a_pagar", amount: 60 },
      paid("I04388", "2026-08-01", 40),
      paid("I99999", "2026-10-01", 9999),
      paid("I04363", "2027-01-01", 77),
    ],
    today,
  );

  // Caixa (contratado + a contratar): pavimentação 900, material 300 → 75% e 25% do I04363.
  it("divide insumo compartilhado na proporção do caixa e ignora insumos fora do plano", () => {
    expect(flow.perFront.get("f0")!.realized).toBe(337.5);
    expect(flow.perFront.get("f1")!.realized).toBe(112.5);
    expect(flow.perFront.get("f2")!.realized).toBe(40);
    expect(flow.realized).toBe(490);
  });

  it("não transforma permuta em desembolso e projeta a partir do mês atual", () => {
    // Programado no UAU: 30 vencido (vai para nov), 60 em fev e 77 lançado em jan → 167.
    // Pavimentação: contratado 600 − pago 337,5 − programado 125,25 = 137,25 em nov;
    // a contratar 300 dividido em jan, fev e mar/27. A permuta de 1.000 não vira caixa.
    expect(flow.perFront.get("f0")!.remaining).toBe(562.5);
    const at = (m: string) => flow.series.find((s) => s.month === m)!;
    // nov: pav 137,25 + 22,5 · material 145,75 + 7,5 · indiretos 100 − 40 = 60
    expect(at("2026-11-01").projected).toBeCloseTo(373, 2);
    expect(at("2027-01-01").projected).toBeCloseTo(100 + 77, 2);
    expect(at("2027-02-01").projected).toBeCloseTo(100 + 60, 2);
    expect(at("2027-03-01").projected).toBeCloseTo(100, 2);
    expect(flow.series.some((s) => s.month === "2027-04-01")).toBe(false);
    expect(flow.scheduled).toBe(167);
    expect(flow.end).toBe("2027-03-01");
    expect(flow.series.at(-1)!.cumulative).toBeCloseTo(flow.realized + flow.remaining, 2);
  });

  it("aponta pagamento acima do contratado + a contratar", () => {
    const over = buildCashFlow([material], [material], [paid("I04363", "2026-05-01", 500)], today);
    expect(over.perFront.get("f1")).toEqual({ realized: 500, remaining: 0, overrun: 200 });
  });

  it("soma meses atravessando o ano", () => {
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });
});
