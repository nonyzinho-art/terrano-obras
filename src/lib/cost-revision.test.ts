import { describe, expect, it } from "vitest";
import type { CostPlanItem } from "./cost-plan";
import type { DisbursementRow } from "./cost-flow";
import {
  distribute,
  forecastChanges,
  frontBalances,
  gridFromRows,
  gridToRows,
  monthRange,
  monthTotals,
  seedGrid,
  shiftRow,
  withForecast,
} from "./cost-revision";

const front = (position: number, values: Partial<CostPlanItem>): CostPlanItem => ({
  id: `f${position}`,
  plan_id: "p",
  position,
  parent_position: null,
  item_code: "",
  insumo: "",
  service: `FRENTE ${position}`,
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
const today = "2026-11-08";
const paving = front(0, {
  insumo: "I04363",
  viability: 1000,
  committed: 600,
  to_contract: 300,
  barter: 200,
  forecast: 1100,
  start_month: "2027-01-01",
  duration_months: 3,
});
const paid: DisbursementRow[] = [
  { insumo: "I04363", month: "2026-10-01", status: "pago", amount: 400 },
];

describe("grade mensal do replanejamento", () => {
  it("distribui o saldo sem perder centavos e adia a frente", () => {
    const row = distribute(1000, "2026-12-01", 3);
    expect([...row]).toEqual([
      ["2026-12-01", 333.33],
      ["2027-01-01", 333.33],
      ["2027-02-01", 333.34],
    ]);
    expect([...shiftRow(row, 1).keys()]).toEqual(["2027-01-01", "2027-02-01", "2027-03-01"]);
  });

  it("parte da projeção automática e calcula o não alocado por frente", () => {
    const grid = seedGrid([paving], paid, today);
    // contratado 600 − pago 400 = 200 em nov; a contratar 300 em jan, fev e mar.
    expect(gridToRows(grid)).toEqual([
      { position: 0, month: "2026-11-01", amount: 200 },
      { position: 0, month: "2027-01-01", amount: 100 },
      { position: 0, month: "2027-02-01", amount: 100 },
      { position: 0, month: "2027-03-01", amount: 100 },
    ]);
    expect(frontBalances([paving], grid, paid, today).balances.get(0)).toEqual({
      balance: 500,
      allocated: 500,
      unallocated: 0,
    });
    grid.get(0)!.delete("2027-03-01");
    expect(frontBalances([paving], grid, paid, today).balances.get(0)!.unallocated).toBe(100);
  });

  it("aplica nova previsão como o banco: a contratar = previsão − contratado − permuta", () => {
    const changed = withForecast(paving, 1500);
    expect(changed.to_contract).toBe(700);
    const grid = seedGrid([changed], paid, today);
    expect(frontBalances([changed], grid, paid, today).balances.get(0)!.balance).toBe(900);
    expect(forecastChanges([paving], [{ ...changed, note: "Aditivo" }])).toEqual([
      {
        position: 0,
        service: "FRENTE 0",
        forecastBefore: 1100,
        forecastAfter: 1500,
        note: "Aditivo",
      },
    ]);
  });

  it("reaproveita a grade da revisão anterior só a partir do mês atual", () => {
    const base = gridFromRows([
      { position: 0, month: "2026-10-01", amount: 50 },
      { position: 0, month: "2026-12-01", amount: 120 },
    ]);
    expect(gridToRows(seedGrid([paving], paid, today, base))).toEqual([
      { position: 0, month: "2026-12-01", amount: 120 },
    ]);
  });

  it("soma os meses da grade", () => {
    const grid = gridFromRows([
      { position: 0, month: "2026-12-01", amount: 10 },
      { position: 1, month: "2026-12-01", amount: 5.5 },
      { position: 1, month: "2027-01-01", amount: 1 },
    ]);
    const months = monthRange("2026-11-01", "2027-01-01");
    expect(months).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
    expect(monthTotals(grid, months)).toEqual([0, 15.5, 1]);
    expect(monthTotals(grid, months, new Set([1]))).toEqual([0, 5.5, 1]);
  });
});
