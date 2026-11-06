// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildMeasurementReport, type MeasurementReportInput } from "./measurement-report";
const input: MeasurementReportInput = {
  work: {
    id: "w",
    name: "Obra",
    location: "Goiânia / GO",
    status: "em_andamento",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    actual_progress: 0,
    planned_progress: 0,
  },
  budget: { id: "b", work_id: "w", name: "Drenagem", status: "aprovado", updated_at: "2026-10-15" },
  measurement: {
    id: "m",
    budget_id: "b",
    work_id: "w",
    period_start: "2026-10-01",
    period_end: "2026-10-15",
    status: "rascunho",
    notes: "",
    created_by: "u",
    created_at: "2026-10-15",
    approved_by: null,
    approved_at: null,
    revision: 1,
  },
  items: [
    {
      id: "i",
      budget_id: "b",
      work_id: "w",
      code: "1.1",
      group: "Drenagem",
      description: "Tubo de concreto",
      unit: "m",
      planned_quantity: 10,
      unit_price: 100,
      total_price: 1000,
      executed_quantity: 0,
      status: "aprovado",
    },
  ],
  lines: [
    {
      id: "l",
      measurement_id: "m",
      budget_id: "b",
      work_id: "w",
      budget_item_id: "i",
      quantity: 2,
      unit_price: 100,
      planned_quantity: 10,
    },
  ],
  previous: new Map(),
  authors: {
    author_name: "Pessoa Teste",
    author_email: "teste@example.invalid",
    approver_name: null,
    approver_email: null,
  },
  photos: [],
  issuedAt: "15/10/2026 11:00",
};
describe("relatório de medição em PDF", () => {
  it("gera PDF sem fotos e com rascunho, sem depender de DOM ou impressão", () => {
    const pdf = buildMeasurementReport(input);
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(new TextDecoder().decode(new Uint8Array(pdf.output("arraybuffer")).slice(0, 5))).toBe(
      "%PDF-",
    );
  });
  it("pagina tabelas extensas com descrições longas", () => {
    const items = Array.from({ length: 80 }, (_, index) => ({
      ...input.items[0]!,
      id: `i${index}`,
      code: `1.1.${index}`,
      description: "ASSENTAMENTO DE TUBULAÇÃO DE CONCRETO COM REATERRO E COMPACTAÇÃO DO SOLO",
    }));
    const lines = items.map((item, index) => ({
      ...input.lines[0]!,
      id: `l${index}`,
      budget_item_id: item.id,
    }));
    expect(buildMeasurementReport({ ...input, items, lines }).getNumberOfPages()).toBeGreaterThan(
      1,
    );
  });
  it("recusa orçamento e itens de outra medição", () => {
    expect(() =>
      buildMeasurementReport({
        ...input,
        measurement: { ...input.measurement, budget_id: "outro" },
      }),
    ).toThrow("não pertence");
    expect(() =>
      buildMeasurementReport({
        ...input,
        lines: [{ ...input.lines[0]!, measurement_id: "outro" }],
      }),
    ).toThrow("não pertencem");
  });
});
