import type { BudgetItem } from "./types";

export function analyzeBudget(items: BudgetItem[]) {
  const groups = new Map<
    string,
    { code: string; name: string; count: number; pending: number; cents: number }
  >();
  const priced: { item: BudgetItem; cents: number }[] = [];
  let pendingCount = 0;
  let zeroCount = 0;
  for (const item of items) {
    const root = [...(item.hierarchy ?? [])].sort(
      (a, b) => a.code.split(".").length - b.code.split(".").length,
    )[0];
    const name = root?.name || item.group?.split(" / ")[0] || "Sem grupo";
    const code = root?.code ?? "";
    const key = `${code}\u0000${name}`;
    const group = groups.get(key) ?? { code, name, count: 0, pending: 0, cents: 0 };
    group.count++;
    const pending =
      item.quantity_pending ||
      item.unit_price_pending ||
      !Number.isFinite(item.planned_quantity) ||
      !Number.isFinite(item.unit_price) ||
      item.planned_quantity < 0 ||
      item.unit_price < 0;
    if (pending) {
      group.pending++;
      pendingCount++;
    } else {
      const cents = Math.round(item.planned_quantity * item.unit_price * 100);
      group.cents += cents;
      if (cents > 0) priced.push({ item, cents });
      else zeroCount++;
    }
    groups.set(key, group);
  }
  const totalCents = [...groups.values()].reduce((sum, group) => sum + group.cents, 0);
  priced.sort(
    (a, b) =>
      b.cents - a.cents ||
      a.item.code.localeCompare(b.item.code, "en", { numeric: true }) ||
      a.item.id.localeCompare(b.item.id),
  );
  let cumulative = 0;
  const abc = priced.map(({ item, cents }, index) => {
    // The item that crosses a threshold remains in the class it started in.
    const category: "A" | "B" | "C" =
      cumulative * 100 < totalCents * 80 ? "A" : cumulative * 100 < totalCents * 95 ? "B" : "C";
    cumulative += cents;
    return {
      item,
      rank: index + 1,
      value: cents / 100,
      share: (cents / totalCents) * 100,
      cumulative: (cumulative / totalCents) * 100,
      category,
    };
  });
  return {
    total: totalCents / 100,
    pendingCount,
    zeroCount,
    abc,
    groups: [...groups.values()]
      .sort(
        (a, b) =>
          a.code.localeCompare(b.code, "en", { numeric: true }) ||
          a.name.localeCompare(b.name, "pt-BR"),
      )
      .map((group) => ({
        ...group,
        value: group.cents / 100,
        share: totalCents ? (group.cents / totalCents) * 100 : 0,
      })),
    classes: (["A", "B", "C"] as const).map((category) => {
      const rows = abc.filter((row) => row.category === category);
      const cents = rows.reduce((sum, row) => sum + Math.round(row.value * 100), 0);
      return {
        category,
        count: rows.length,
        value: cents / 100,
        share: totalCents ? (cents / totalCents) * 100 : 0,
      };
    }),
  };
}
