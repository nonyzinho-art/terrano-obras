import { describe, expect, it } from "vitest";
import { earnedValue } from "./earned-value";
import type { BudgetMeasurement, BudgetMeasurementItem, MeasurementAdvance } from "./types";

const med = (id: string, start: string, end: string, status = "aprovada") =>
  ({
    id,
    budget_id: "b",
    work_id: "w",
    period_start: start,
    period_end: end,
    status,
    retention_percent: 0,
  }) as BudgetMeasurement;
const line = (measurement_id: string, value: number) =>
  ({ measurement_id, budget_id: "b", quantity: 1, unit_price: value }) as BudgetMeasurementItem;
const adv = (measurement_id: string, amount: number, paid_on: string | null) =>
  ({ measurement_id, budget_id: "b", amount, paid_on }) as MeasurementAdvance;

// Contrato de R$ 300.000 planejado de 01/01 a 31/03/2026 (cerca de R$ 100 mil por mês).
const contract = { id: "b", total: 300000, planned_start: "2026-01-01", planned_end: "2026-03-31" };

describe("Curva S financeira", () => {
  it("monta previsto, executado e pago acumulados por mês", () => {
    const ms = [
      med("m1", "2026-01-01", "2026-01-31"),
      med("x", "2026-02-01", "2026-02-10", "rascunho"),
    ];
    const lines = [line("m1", 80000), line("x", 999999)];
    const advances = [adv("m1", 30000, "2026-01-10")];
    const ev = earnedValue([contract], ms, lines, advances, "2026-02-15");
    expect(ev.series.map((p) => p.month)).toEqual([
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    const [dec, jan, feb, mar] = ev.series;
    expect(dec).toMatchObject({ planned: 0, executed: 0, paid: 0 });
    // 30 dos 89 dias do contrato passados em 31/01.
    expect(jan!.planned).toBeCloseTo((300000 * 30) / 89, 1);
    expect(mar!.planned).toBe(300000);
    // Rascunho não conta como executado.
    expect(jan!.executed).toBe(80000);
    expect(feb!.executed).toBe(80000);
    // Pago: adiantamento de 30 mil + líquido da medição (80 − 30 = 50 mil).
    expect(jan!.paid).toBe(80000);
    // Meses futuros ficam sem executado e pago.
    expect(mar!.executed).toBeNull();
    expect(ev.executed).toBe(80000);
  });

  it("calcula o atraso em dias e o índice de prazo", () => {
    const ms = [med("m1", "2026-01-01", "2026-01-31")];
    const ev = earnedValue([contract], ms, [line("m1", 50000)], [], "2026-03-01");
    // Previsto chegou a R$ 50 mil por volta de 15/01 → ~45 dias de atraso em 01/03.
    expect(ev.delayDays).toBeGreaterThanOrEqual(43);
    expect(ev.delayDays).toBeLessThanOrEqual(46);
    expect(ev.spi).toBeCloseTo(50000 / ev.plannedToday, 5);
  });

  it("mostra adiantado quando o executado passa do previsto", () => {
    const ms = [med("m1", "2026-01-01", "2026-01-20")];
    const ev = earnedValue([contract], ms, [line("m1", 150000)], [], "2026-01-31");
    expect(ev.delayDays).toBeLessThan(0);
  });

  it("aponta o que foi pago acima do executado (adiantamento ainda sem produção)", () => {
    const ms = [med("m1", "2026-01-01", "2026-01-31")];
    const ev = earnedValue(
      [contract],
      ms,
      [line("m1", 20000)],
      [adv("m1", 61000, "2026-01-05")],
      "2026-02-01",
    );
    // Medido 20 mil, adiantado 61 mil: descontou 20 mil, líquido 0; pago 61 mil.
    expect(ev.paid).toBe(61000);
    expect(ev.paidAhead).toBe(41000);
  });

  it("sem datas planejadas não calcula previsto nem atraso", () => {
    const ev = earnedValue([{ id: "b", total: 1000 }], [], [], [], "2026-02-01");
    expect(ev.hasPlan).toBe(false);
    expect(ev.delayDays).toBeNull();
    expect(ev.withoutPlan).toBe(1);
  });

  it("mede o atraso pela linha de base mesmo depois de replanejar", () => {
    const ms = [med("m1", "2026-01-01", "2026-01-31")];
    // Replanejado para abril a junho, mas a linha de base continua janeiro a março.
    const replanned = {
      ...contract,
      planned_start: "2026-04-01",
      planned_end: "2026-06-30",
      baseline: { planned_start: "2026-01-01", planned_end: "2026-03-31" },
    };
    const ev = earnedValue([replanned], ms, [line("m1", 50000)], [], "2026-03-01");
    expect(ev.usesBaseline).toBe(true);
    expect(ev.replannedDiffers).toBe(true);
    // Mesmo atraso do caso sem replanejamento (~45 dias), não "adiantado".
    expect(ev.delayDays).toBeGreaterThanOrEqual(43);
    const feb = ev.series.find((p) => p.month === "2026-02-01")!;
    expect(feb.planned).toBeGreaterThan(150000);
    expect(feb.replanned).toBe(0);
  });

  it("sem diferença de datas não desenha o replanejado", () => {
    const same = {
      ...contract,
      baseline: { planned_start: "2026-01-01", planned_end: "2026-03-31" },
    };
    const ev = earnedValue([same], [], [], [], "2026-02-01");
    expect(ev.replannedDiffers).toBe(false);
    expect(ev.series.every((p) => p.replanned === null)).toBe(true);
  });
});
