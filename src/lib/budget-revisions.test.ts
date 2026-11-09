import { expect, it } from "vitest";
import { groupRevisions, importRevisionProtection } from "./budget-revisions";
import type { Budget, BudgetMeasurement, DailyReport, Photo } from "./types";
const budget: Budget = {
  id: "b",
  work_id: "w",
  name: "Drenagem",
  status: "aprovado",
  updated_at: "2026-10-01",
};
it("permite revisão da frente sem histórico e separa obras e frentes distintas", () => {
  const m = { budget_id: "b", status: "aprovada" } as BudgetMeasurement;
  expect(importRevisionProtection([budget], [], [], [], "w", "Drenagem").blocked).toBe(false);
  expect(importRevisionProtection([budget], [m], [], [], "other", "Drenagem").blocked).toBe(false);
  expect(importRevisionProtection([budget], [m], [], [], "w", "Água").blocked).toBe(false);
});
it("protege histórico de qualquer versão, incluindo rascunhos e medições canceladas", () => {
  const family = [budget, { ...budget, id: "v2", revision: 2 }];
  for (const status of ["rascunho", "aprovada", "cancelada", "substituida"] as const) {
    expect(
      importRevisionProtection(
        family,
        [{ budget_id: "b", status } as BudgetMeasurement],
        [],
        [],
        "w",
        "  DRENAGEM ",
      ),
    ).toMatchObject({ blocked: true, measurementCount: 1 });
  }
});
it("protege diário sem quantidade e foto vinculada sem inventar produção", () => {
  expect(
    importRevisionProtection(
      [budget],
      [],
      [{ budget_id: "b" } as DailyReport],
      [],
      "w",
      "Drenagem",
    ),
  ).toMatchObject({ blocked: true, reportCount: 1, measurementCount: 0 });
  expect(
    importRevisionProtection([budget], [], [], [{ budget_id: "b" } as Photo], "w", "Drenagem"),
  ).toMatchObject({ blocked: true, photoCount: 1 });
});

it("agrupa as revisões de cada orçamento, com a mais recente primeiro", () => {
  const b = (id: string, name: string, revision: number) =>
    ({ id, work_id: "w", name, revision, status: "aprovado", updated_at: "2026-11-01" }) as Budget;
  const groups = groupRevisions([
    b("d1", "Drenagem", 1),
    b("p1", "Pavimentação", 1),
    b("d2", " drenagem ", 2),
  ]);
  expect(groups.map((g) => g.map((x) => x.id))).toEqual([["d2", "d1"], ["p1"]]);
});
