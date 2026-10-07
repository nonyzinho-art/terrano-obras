import { describe, it, expect } from "vitest";
import { parseBudgetRows } from "./budget-import";
import { latestProposals, proposalCoverage, type Proposal, type QuoteItem } from "./quotes";
const proposal = (id: string, invite: string, version: number) =>
  ({
    id,
    invite_id: invite,
    version,
    total: 100,
    supplier_name: invite,
    cnpj: "",
    contact: "",
    notes: "",
    created_at: "2026-10-07",
  }) as Proposal;
describe("cotações", () => {
  it("aceita planilha de cotação sem preço e não reaproveita preços preenchidos", () => {
    const rows = [
      ["ITEM", "DESCRIÇÃO", "UNID.", "QUANT."],
      ["1", "Grupo", null, null],
      ["1.1", "Tubo", "m", 2],
    ];
    const preview = parseBudgetRows(rows, { quotation: true });
    expect(preview.errors).toEqual([]);
    expect(preview.items[0]?.unitPrice).toBeNull();
    expect(preview.items[0]?.hierarchy).toEqual([{ code: "1", name: "Grupo" }]);
    expect(() => parseBudgetRows(rows)).toThrow("Preço unitário");
  });
  it("compara só a revisão mais recente de cada fornecedor", () => {
    expect(
      latestProposals([proposal("a1", "a", 1), proposal("a2", "a", 2), proposal("b1", "b", 1)]).map(
        (p) => p.id,
      ),
    ).toEqual(["a2", "b1"]);
  });
  it("não considera completo o escopo com itens não cotados ou omitidos", () => {
    const p = proposal("p", "a", 1);
    const items = [{ id: "i1" }, { id: "i2" }] as QuoteItem[];
    expect(
      proposalCoverage(p, items, [
        { proposal_id: "p", item_id: "i1", unit_price: 10 },
        { proposal_id: "p", item_id: "i2", unit_price: null },
      ]),
    ).toEqual({ quoted: 1, complete: false });
    expect(
      proposalCoverage(p, items, [
        { proposal_id: "p", item_id: "i1", unit_price: 10 },
        { proposal_id: "p", item_id: "i2", unit_price: 20 },
      ]).complete,
    ).toBe(true);
  });
});
