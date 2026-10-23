import type { BudgetItem, BudgetStatus } from "./types";
export const normalizeBudgetSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
export function filterBudgetItems(
  items: BudgetItem[],
  query: string,
  status: BudgetStatus | "",
  unit: string,
) {
  const term = normalizeBudgetSearch(query);
  return items.filter(
    (item) =>
      (!status || item.status === status) &&
      (!unit || item.unit === unit) &&
      normalizeBudgetSearch(item.code + " " + item.description).includes(term),
  );
}
