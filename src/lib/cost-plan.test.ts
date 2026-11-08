import { describe, expect, it } from "vitest";
import { findStageLots, isDeduction, parseCostPlanRows, parseMoney, summarize } from "./cost-plan";

const H = [
  "ITEM",
  "INSUMO",
  "SERVIÇO",
  "VIABILIDADE",
  "COMPROMETIDO",
  "À CONTRATAR",
  "ADITIVO/SUPRESSAO",
  "PERMUTA",
  "PREV. AO TERMINO",
  "CUSTO X VIAB.",
  null,
  "Início",
  "Mês",
  "Duração",
  "Término",
];
const dec = new Date(Date.UTC(2026, 11, 1));
const row = (
  code: string | null,
  service: string | null,
  v: number | null,
  c: number,
  t: number,
  p: number | null,
  f: number | null,
  dur: number | null = 1,
) => [code, "I0", service, v, c, t, null, p, f, null, null, 40, dur === null ? null : dec, dur, 40];

const sheet = [
  [null, null, null, null, null, null, null, null, null, null, null, "CRONOGRAMA DE OBRAS"],
  H,
  row("1.1", "LIMPEZA VEGETAL", 100, 100, 0, null, 100),
  row("5", "GALERIA DE AGUA PLUVIAL", 1000, 600, 200, 300, 1100),
  row(null, "SISTEMA DE ESGOTAMENTO SANITARIO", 500, 400, 200, null, 600),
  row("1.2", "LIMPEZA VEGETAL", 80, 0, 80, null, 80),
  row("5", "GALERIA DE AGUA PLUVIAL", 900, 0, 900, null, 900),
  row("6.2", "SISTEMA DE ESGOTAMENTO SANITARIO", 300, 0, 300, null, 300),
  row("10", "BUEIRO", 200, 150, 50, null, 200),
  row("13", "INDIRETOS", 400, 250, 150, null, 400),
  row(null, "DESPESAS DE CANTEIRO", 0, 120, -120, null, null, null),
  row(null, "PERMUTAS - FUTURAS", -1000, -400, -600, null, -1000),
  [null, null, null, 3480, 1500, 1460, null, 300, 3680],
  [null, null, null, null, null, null, null, null, null, null, null, "FLUXO FINANCEIRO"],
];

describe("planejamento de custos", () => {
  const p = parseCostPlanRows(sheet);
  const top = p.items.filter((i) => i.parent === null);

  it("lê frentes, etapas e o mês de início", () => {
    expect(p.errors).toEqual([]);
    expect(p.items.map((i) => [i.service, i.stage])).toEqual([
      ["LIMPEZA VEGETAL", 1],
      ["GALERIA DE AGUA PLUVIAL", 1],
      ["SISTEMA DE ESGOTAMENTO SANITARIO", 1],
      ["LIMPEZA VEGETAL", 2],
      ["GALERIA DE AGUA PLUVIAL", 2],
      ["SISTEMA DE ESGOTAMENTO SANITARIO", 2],
      ["BUEIRO", null],
      ["INDIRETOS", null],
      ["DESPESAS DE CANTEIRO", null],
      ["PERMUTAS - FUTURAS", null],
    ]);
    expect(p.stages.map((s) => s.name)).toEqual(["1ª etapa", "2ª etapa"]);
    expect(p.items[0]).toMatchObject({ startMonth: "2026-12-01", duration: 1, row: 3 });
  });

  it("trata os subitens dos indiretos como detalhe, fora da soma", () => {
    const detail = p.items.find((i) => i.service === "DESPESAS DE CANTEIRO")!;
    expect(detail.parent).toBe(7);
    expect(detail.duration).toBeNull();
    expect(top.some((i) => i.service === "DESPESAS DE CANTEIRO")).toBe(false);
  });

  it("confere com o total da planilha, que não desconta as permutas futuras", () => {
    expect(p.sheetTotal).toEqual({ viability: 3480, forecast: 3680 });
    expect(p.warnings).toEqual([]);
    const main = summarize(top.filter((i) => !isDeduction(i.service)));
    expect(main).toMatchObject({ viability: 3480, forecast: 3680, deviation: 200, barter: 300 });
    expect(main.deviationPct).toBeCloseTo(5.75, 2);
  });

  it("avisa quando a previsão não fecha com comprometido + a contratar + permuta", () => {
    const broken = sheet.map((r, i) =>
      i === 3 ? row("5", "GALERIA", 1000, 600, 200, 0, 1100) : r,
    );
    expect(parseCostPlanRows(broken).warnings.join(" ")).toMatch(/Linha 4 \(GALERIA\)/);
  });

  it("explica quando a aba não tem o cabeçalho esperado", () => {
    expect(
      parseCostPlanRows([
        ["A", "B"],
        [1, 2],
      ]).errors[0],
    ).toMatch(/SERVIÇO e VIABILIDADE/);
  });

  it("acha os lotes por etapa em qualquer aba", () => {
    const lots = findStageLots([
      {
        data: [
          ["TOTAL", 1341, "LOTES"],
          ["1ª ETAPA", 513, "LOTES"],
        ],
      },
      {
        data: [
          ["2ªEtapa", 359],
          ["3ª ETAPA", "x", 469],
        ],
      },
    ]);
    expect([...lots]).toEqual([
      [1, 513],
      [2, 359],
      [3, 469],
    ]);
  });

  it("aceita valores negativos e texto no formato brasileiro", () => {
    expect(parseMoney(-109924.28)).toBe(-109924.28);
    expect(parseMoney("-R$ 1.234,56")).toBe(-1234.56);
    expect(parseMoney("(500,00)")).toBe(-500);
    expect(parseMoney("")).toBeNull();
    expect(() => parseMoney("abc")).toThrow();
  });
});
