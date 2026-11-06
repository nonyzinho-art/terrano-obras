import type { BudgetItem } from "./types";
import type { ImportItem } from "./budget-import";

export interface ComparisonItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  quantity: number | null;
  price: number | null;
  group: string;
}
export type ComparisonStatus = "mantido" | "alterado" | "novo" | "removido" | "ambiguo";
const text = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
const known = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 0;
export const comparisonBudgetItems = (items: BudgetItem[]): ComparisonItem[] =>
  items.map((i) => ({
    id: i.id,
    code: i.code,
    description: i.description,
    unit: i.unit,
    quantity: i.quantity_pending ? null : i.planned_quantity,
    price: i.unit_price_pending ? null : i.unit_price,
    group: JSON.stringify(i.hierarchy ?? [{ code: "", name: i.group }]),
  }));
export const comparisonImportItems = (items: ImportItem[]): ComparisonItem[] =>
  items.map((i, index) => ({
    id: `preview-${index}`,
    code: i.code,
    description: i.description,
    unit: i.unit,
    quantity: i.quantity,
    price: i.unitPrice,
    group: JSON.stringify(i.hierarchy.length ? i.hierarchy : [{ code: "", name: i.group }]),
  }));

export function compareBudgetItems(
  before: ComparisonItem[],
  after: ComparisonItem[],
  executed: ReadonlyMap<string, number>,
) {
  const group = (items: ComparisonItem[]) => {
    const map = new Map<string, ComparisonItem[]>();
    for (const item of items) {
      const key = item.code.trim();
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  };
  const oldCodes = group(before),
    newCodes = group(after);
  const codes = [...new Set([...oldCodes.keys(), ...newCodes.keys()])].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { numeric: true }),
  );
  const rows = codes.map((code) => {
    const oldItems = oldCodes.get(code) ?? [],
      newItems = newCodes.get(code) ?? [];
    const ambiguous = !code || oldItems.length > 1 || newItems.length > 1;
    const old = oldItems[0],
      next = newItems[0];
    const changes: string[] = [];
    if (old && next && !ambiguous) {
      if (text(old.description) !== text(next.description)) changes.push("Descrição");
      if (text(old.unit) !== text(next.unit)) changes.push("Unidade");
      if (old.quantity !== next.quantity) changes.push("Quantidade");
      if (old.price !== next.price) changes.push("Preço unitário");
      if (old.group !== next.group) changes.push("Grupo");
    }
    const status: ComparisonStatus = ambiguous
      ? "ambiguo"
      : !old
        ? "novo"
        : !next
          ? "removido"
          : changes.length
            ? "alterado"
            : "mantido";
    const production = old && !ambiguous ? (executed.get(old.id) ?? 0) : 0;
    const warnings: string[] = [];
    if (ambiguous) warnings.push("Código ausente ou repetido: correspondência indefinida.");
    if (oldItems.some((i) => (executed.get(i.id) ?? 0) > 0) && ambiguous)
      warnings.push("Há execução aprovada entre os itens com código indefinido.");
    if (production > 0 && !next) warnings.push("Item removido possui execução aprovada.");
    if (production > 0 && next && text(old!.unit) !== text(next.unit))
      warnings.push("Unidade alterada: não é possível transportar a quantidade.");
    if (old && next && text(old.description) !== text(next.description))
      warnings.push("Mesmo código com descrição diferente: conferir se é o mesmo serviço.");
    if (next && (!known(next.quantity) || !known(next.price)))
      warnings.push("Nova versão tem quantidade ou preço pendente/inválido.");
    const compatible =
      !!old &&
      !!next &&
      !ambiguous &&
      text(old.unit) === text(next.unit) &&
      text(old.description) === text(next.description);
    if (compatible && known(next!.quantity) && production > next!.quantity!)
      warnings.push("Quantidade nova inferior ao executado aprovado.");
    if (production > 0 && changes.includes("Preço unitário"))
      warnings.push("Preço alterado: os valores das medições anteriores devem ser preservados.");
    return {
      code,
      oldItems,
      newItems,
      status,
      changes,
      production,
      warnings,
      simulatedBalance: compatible && known(next!.quantity) ? next!.quantity! - production : null,
    };
  });
  const total = (items: ComparisonItem[]) => {
    let cents = 0,
      pending = 0;
    for (const i of items) {
      if (known(i.quantity) && known(i.price)) cents += Math.round(i.quantity * i.price * 100);
      else pending++;
    }
    return { value: cents / 100, pending };
  };
  return {
    rows,
    beforeTotal: total(before),
    afterTotal: total(after),
    counts: {
      mantido: rows.filter((r) => r.status === "mantido").length,
      alterado: rows.filter((r) => r.status === "alterado").length,
      novo: rows.filter((r) => r.status === "novo").length,
      removido: rows.filter((r) => r.status === "removido").length,
      ambiguo: rows.filter((r) => r.status === "ambiguo").length,
    },
  };
}
