type Group = { code: string; name: string };
type Hierarchical = { code: string; group?: string; hierarchy?: Group[] };
export type HierarchyRow<T> =
  | { kind: "group"; code: string; name: string; depth: number; items: T[] }
  | { kind: "item"; item: T };
export function budgetHierarchy<T extends Hierarchical>(items: T[]): HierarchyRow<T>[] {
  const rows: HierarchyRow<T>[] = [];
  const groups = new Map<string, Extract<HierarchyRow<T>, { kind: "group" }>>();
  for (const item of [...items].sort((a, b) =>
    a.code.localeCompare(b.code, "en", { numeric: true }),
  )) {
    const parts = item.code.split(".");
    const hierarchy =
      item.hierarchy ??
      item.group
        ?.split(" / ")
        .filter(Boolean)
        .map((name, i) => ({ name, code: parts.slice(0, i + 1).join(".") }))
        .filter((g) => g.code !== item.code) ??
      [];
    for (const g of hierarchy) {
      let row = groups.get(g.code);
      if (!row) {
        row = {
          kind: "group",
          code: g.code,
          name: g.name,
          depth: g.code.split(".").length,
          items: [],
        };
        groups.set(g.code, row);
        rows.push(row);
      }
      row.items.push(item);
    }
    rows.push({ kind: "item", item });
  }
  return rows;
}
export function hiddenByGroup(code: string, collapsed: Set<string>) {
  return [...collapsed].some((parent) => code.startsWith(parent + "."));
}
