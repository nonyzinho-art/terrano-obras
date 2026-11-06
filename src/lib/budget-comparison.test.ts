import { describe, expect, it } from "vitest";
import {
  compareBudgetItems,
  comparisonBudgetItems,
  comparisonImportItems,
  type ComparisonItem,
} from "./budget-comparison";
import type { BudgetItem } from "./types";
const item = (id: string, code: string, extra: Partial<ComparisonItem> = {}): ComparisonItem => ({
  id,
  code,
  description: "Tubo PVC",
  unit: "m",
  quantity: 10,
  price: 5,
  group: "Água",
  ...extra,
});
describe("comparação de versões", () => {
  it("classifica mantidos, alterações, novos e removidos em ordem hierárquica", () => {
    const result = compareBudgetItems(
      [item("a", "1.10"), item("b", "1.2"), item("c", "3")],
      [item("new-a", "1.10"), item("new-b", "1.2", { price: 7 }), item("d", "4")],
      new Map(),
    );
    expect(result.rows.map((r) => [r.code, r.status])).toEqual([
      ["1.2", "alterado"],
      ["1.10", "mantido"],
      ["3", "removido"],
      ["4", "novo"],
    ]);
    expect(result.beforeTotal.value).toBe(150);
    expect(result.afterTotal.value).toBe(170);
  });
  it("não transporta execução entre unidades ou descrições diferentes", () => {
    for (const extra of [{ unit: "un" }, { description: "Outro serviço" }]) {
      const row = compareBudgetItems(
        [item("old", "1")],
        [item("new", "1", extra)],
        new Map([["old", 4]]),
      ).rows[0]!;
      expect(row.simulatedBalance).toBeNull();
      expect(row.warnings.length).toBeGreaterThan(0);
    }
  });
  it("destaca redução abaixo da execução e alteração de preço sem alterar o mapa aprovado", () => {
    const executed = new Map([["old", 8]]);
    const row = compareBudgetItems(
      [item("old", "1")],
      [item("new", "1", { quantity: 6, price: 7 })],
      executed,
    ).rows[0]!;
    expect(row.simulatedBalance).toBe(-2);
    expect(row.warnings.join(" ")).toMatch(/inferior ao executado/);
    expect(row.warnings.join(" ")).toMatch(/valores das medições anteriores/);
    expect(executed.get("old")).toBe(8);
    expect(executed.has("new")).toBe(false);
  });
  it("não confunde mudança de código com serviço mantido e aponta execução removida", () => {
    const result = compareBudgetItems(
      [item("old", "1")],
      [item("new", "2")],
      new Map([["old", 3]]),
    );
    expect(result.counts).toMatchObject({ removido: 1, novo: 1, mantido: 0 });
    expect(result.rows[0]?.warnings).toContain("Item removido possui execução aprovada.");
  });
  it("códigos repetidos não recebem correspondência nem saldo simulado", () => {
    const row = compareBudgetItems(
      [item("a", "1"), item("b", "1", { unit: "un" })],
      [item("c", "1")],
      new Map([["b", 2]]),
    ).rows[0]!;
    expect(row.status).toBe("ambiguo");
    expect(row.simulatedBalance).toBeNull();
    expect(row.warnings.join(" ")).toContain("Há execução aprovada");
  });
  it("distingue preço zero de pendente e calcula totais parciais em centavos", () => {
    const result = compareBudgetItems(
      [],
      [
        item("a", "1", { quantity: 0.1, price: 0.2 }),
        item("b", "2", { price: 0 }),
        item("c", "3", { price: null }),
      ],
      new Map(),
    );
    expect(result.afterTotal).toEqual({ value: 0.02, pending: 1 });
    expect(result.rows[1]?.warnings).toEqual([]);
    expect(result.rows[2]?.warnings.join(" ")).toContain("pendente");
  });
  it("adapta planilha e itens cadastrados preservando campos pendentes", () => {
    const old = comparisonBudgetItems([
      {
        id: "i",
        code: "1",
        description: "Tubo",
        unit: "m",
        group: "Água",
        planned_quantity: 0,
        unit_price: 0,
        quantity_pending: true,
      } as BudgetItem,
    ]);
    const next = comparisonImportItems([
      {
        row: 1,
        code: "1",
        description: "Tubo",
        unit: "m",
        group: "Água",
        quantity: null,
        unitPrice: 0,
        sourceTotal: null,
        hierarchy: [],
      },
    ]);
    expect(compareBudgetItems(old, next, new Map()).rows[0]?.status).toBe("mantido");
    expect(next[0]?.quantity).toBeNull();
  });
});
