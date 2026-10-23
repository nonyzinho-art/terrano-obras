import { describe, expect, it } from "vitest";
import { budgetAlerts } from "./budget-alerts";
import type { Work, Budget, BudgetItem, BudgetMeasurement } from "./types";
const work: Work = {
  id: "w",
  name: "Obra",
  location: "Goiás",
  status: "em_andamento",
  start_date: "2026-10-01",
  end_date: "2026-10-31",
  planned_progress: 0,
  actual_progress: 0,
};
const budget: Budget = {
  id: "b",
  work_id: "w",
  name: "Drenagem",
  status: "aprovado",
  updated_at: "2026-10-01",
  revision: 1,
};
const item: BudgetItem = {
  id: "i",
  budget_id: "b",
  work_id: "w",
  code: "1.1",
  group: "Rede",
  description: "Tubo",
  unit: "m",
  planned_quantity: 10,
  executed_quantity: 0,
  unit_price: 10,
  total_price: 100,
  status: "aprovado",
};
const alerts = (
  bs: Budget[] = [budget],
  its: BudgetItem[] = [item],
  ms: BudgetMeasurement[] = [],
  ws: Work[] = [work],
) => budgetAlerts(ws, bs, its, ms, [], "2026-10-15");
describe("alertas de acompanhamento", () => {
  it("pede planejamento sem acusar atraso quando faltam datas", () =>
    expect(alerts().map((a) => a.id)).toEqual(["plan-b"]));
  it("aponta atraso com base no planejamento e medições aprovadas", () =>
    expect(
      alerts([{ ...budget, planned_start: "2026-10-01", planned_end: "2026-10-31" }]).map(
        (a) => a.id,
      ),
    ).toEqual(["delay-b"]));
  it("ignora obras concluídas, orçamento concluído e cotação", () => {
    expect(alerts([budget], [item], [], [{ ...work, status: "concluida" }])).toEqual([]);
    expect(alerts([{ ...budget, execution_status: "concluido" }])).toEqual([]);
    expect(alerts([{ ...budget, status: "em_cotacao" }])).toEqual([]);
  });
  it("considera somente a última revisão aprovada", () =>
    expect(alerts([budget, { ...budget, id: "new", revision: 2 }]).map((a) => a.id)).toEqual([
      "plan-new",
    ]));
  it("leva o rascunho correto para conferência antes das demais pendências", () => {
    const draft: BudgetMeasurement = {
      id: "m",
      budget_id: "b",
      work_id: "w",
      period_start: "2026-10-10",
      period_end: "2026-10-14",
      notes: "",
      status: "rascunho",
      created_by: "u",
      created_at: "2026-10-14",
      approved_by: null,
      approved_at: null,
      revision: 1,
    };
    expect(alerts([budget], [{ ...item, unit_price_pending: true }], [draft])[0]).toMatchObject({
      measurementId: "m",
      tab: "medicoes",
      priority: 1,
    });
    expect(
      alerts([budget], [{ ...item, unit_price_pending: true }], [draft]).map((a) => a.id),
    ).toEqual(["measurement-m", "pending-b", "plan-b"]);
  });
});
