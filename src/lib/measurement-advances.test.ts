import { describe, expect, it } from "vitest";
import {
  carriedInFor,
  excelDate,
  parseUauAdvances,
  settle,
  settlementFor,
} from "./measurement-advances";
import type { BudgetMeasurement, BudgetMeasurementItem, MeasurementAdvance } from "./types";

const med = (id: string, start: string, end: string, extra: Partial<BudgetMeasurement> = {}) =>
  ({
    id,
    budget_id: "b",
    work_id: "w",
    period_start: start,
    period_end: end,
    notes: "",
    status: "aprovada",
    created_by: "u",
    created_at: start,
    approved_by: "u",
    approved_at: end,
    revision: 2,
    retention_percent: 0,
    ...extra,
  }) as BudgetMeasurement;
const line = (measurement_id: string, value: number) =>
  ({ measurement_id, quantity: 1, unit_price: value }) as BudgetMeasurementItem;
const adv = (measurement_id: string, amount: number) =>
  ({ measurement_id, amount }) as MeasurementAdvance;

describe("desconto de adiantamentos na medição", () => {
  it("desconta tudo quando cabe na medição", () => {
    expect(settle(100000, 0, 30000, 0)).toMatchObject({
      deducted: 30000,
      invoice: 70000,
      payable: 70000,
      carriedOut: 0,
    });
  });

  it("aplica a retenção sobre o valor medido e desconta da NF", () => {
    expect(settle(100000, 5, 30000, 0)).toMatchObject({
      retention: 5000,
      invoice: 70000,
      payable: 65000,
    });
  });

  it("leva para a próxima medição o adiantamento que não coube (caso Everest, 1ª medição)", () => {
    // 1ª medição: R$ 46.908,70 medidos e R$ 61.000,00 adiantados → sobraram R$ 14.091,30.
    const first = settle(46908.7, 0, 61000, 0);
    expect(first).toMatchObject({ deducted: 46908.7, invoice: 0, payable: 0, carriedOut: 14091.3 });
    const second = settle(100000, 0, 5000, first.carriedOut);
    expect(second).toMatchObject({ deducted: 19091.3, invoice: 80908.7, carriedOut: 0 });
  });

  it("nunca deixa o líquido negativo quando há retenção", () => {
    expect(settle(10000, 10, 50000, 0)).toMatchObject({
      retention: 1000,
      deducted: 9000,
      invoice: 1000,
      payable: 0,
      carriedOut: 41000,
    });
  });

  it("encadeia só as medições aprovadas anteriores e ignora a versão revisada", () => {
    const ms = [
      med("m1", "2026-08-21", "2026-09-20"),
      med("m2", "2026-09-21", "2026-10-20", { status: "substituida" }),
      med("r2", "2026-09-21", "2026-10-20", { replaces_id: "m2" }),
      med("c", "2026-09-01", "2026-09-10", { status: "cancelada" }),
      med("m3", "2026-10-21", "2026-11-20", { status: "rascunho" }),
    ];
    const lines = [line("m1", 10000), line("m2", 50000), line("r2", 5000), line("c", 99999)];
    const advances = [adv("m1", 25000), adv("m2", 1000), adv("r2", 1000), adv("c", 50000)];
    // m1: sobra 15.000; r2: 15.000 + 1.000 contra 5.000 medidos → sobra 11.000.
    expect(carriedInFor(ms[4]!, ms, lines, advances)).toBe(11000);
    // A revisão r2 recebe só o saldo de m1, não o dela mesma nem o da versão original.
    expect(settlementFor(ms[2]!, ms, lines, advances)).toMatchObject({
      carriedIn: 15000,
      deducted: 5000,
      carriedOut: 11000,
    });
  });
});

describe("importação de adiantamentos do UAU", () => {
  it("lê a exportação com cabeçalho fora da primeira linha e ignora repetidos e vazios", () => {
    const rows = [
      [],
      [null, "Relatório"],
      [
        null,
        "Adiant.",
        "Processo",
        "Cotação",
        "Tipo",
        "Valor",
        "Vinculados",
        "Data",
        "Quem",
        "Forn. Proc.",
        "Nome Fornecedor",
      ],
      [
        null,
        1,
        3221,
        null,
        "1 - Não compõe base cálculo",
        8145.16,
        0,
        new Date(Date.UTC(2026, 9, 16)),
        "EMILLY",
        22371,
        "ALCIMARIO CORDEIRO DE SOUZA",
      ],
      [null, 2, 3155, null, "1 - Não compõe", 8776.83, 0, 46311, "SAMILLA", 22204, "TELECOM LTDA"],
      [null, 3, 3155, null, "", 10, 0, 46311, "", 1, "REPETIDO"],
      [null, 4, null, null, "", 10, 0, 46311, "", 1, "SEM PROCESSO"],
      [null, 5, "3300", null, "", "1.234,56", 0, "05/11/2026", "", 1, ""],
    ];
    const { rows: list, error } = parseUauAdvances(rows);
    expect(error).toBeUndefined();
    expect(list).toEqual([
      expect.objectContaining({
        process: "3221",
        amount: 8145.16,
        paid_on: "2026-10-16",
        supplier: "ALCIMARIO CORDEIRO DE SOUZA",
        who: "EMILLY",
      }),
      expect.objectContaining({ process: "3155", amount: 8776.83, paid_on: "2026-10-16" }),
      expect.objectContaining({
        process: "3300",
        amount: 1234.56,
        paid_on: "2026-11-05",
        supplier: "Fornecedor não informado",
      }),
    ]);
  });

  it("avisa quando a planilha não é a exportação de adiantamentos", () => {
    expect(parseUauAdvances([["Código", "Serviço"]]).error).toMatch(/Processo/);
    expect(excelDate("lixo")).toBeNull();
  });
});
