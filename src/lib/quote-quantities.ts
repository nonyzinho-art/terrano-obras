import { parseAmount, type ImportItem } from "./budget-import";
export function prepareQuoteItems(
  items: ImportItem[],
  quantities: Record<string, string>,
  omitZero: boolean,
) {
  const edited = items.map((item) => {
    let quantity: number | null = null;
    try {
      quantity = parseAmount(quantities[item.code] ?? item.quantity);
    } catch {
      quantity = null;
    }
    return { ...item, quantity };
  });
  const excluded = omitZero ? edited.filter((i) => i.quantity === 0) : [];
  const included = edited.filter((i) => !omitZero || i.quantity !== 0);
  const invalid = included.filter((i) => i.quantity === null || i.quantity <= 0);
  return { edited, included, excluded, invalid };
}
