export interface ImportItem {
  hierarchy: { code: string; name: string }[];
  row: number;
  code: string;
  description: string;
  unit: string;
  group: string;
  quantity: number | null;
  unitPrice: number | null;
  sourceTotal: number | null;
}
export interface ImportPreview {
  items: ImportItem[];
  errors: string[];
  warnings: string[];
  groups: number;
  total: number;
  pending: number;
}
const clean = (v: unknown) => String(v ?? "").trim();
const normalize = (v: unknown) =>
  clean(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || clean(value) === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value > 1e12) throw new Error("valor inválido");
    return Math.round(value * 10000) / 10000;
  }
  if (typeof value !== "string") throw new Error("valor inválido");
  let text = value
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "");
  if (text.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*,\d+$|^\d+,\d+$/.test(text)) throw new Error("número inválido");
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  else if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("número inválido");
  const n = Number(text);
  if (!Number.isFinite(n) || n > 1e12) throw new Error("valor fora do limite");
  return Math.round(n * 10000) / 10000;
}
export function parseBudgetRows(
  rows: unknown[][],
  options: { quotation?: boolean } = {},
): ImportPreview {
  const aliases = {
    code: ["codigo", "codigoeap", "item"],
    description: ["descricao", "servicoinsumo", "servico"],
    unit: ["unidade", "unid"],
    quantity: ["quant", "quantidade", "qtd", "qtdcalculada", "quantidadeprevista"],
    unitPrice: [
      "custounitarior",
      "custounitario",
      "precounitario",
      "precounitarior",
      "precounitr",
      "precounit",
      "valorunitario",
    ],
    sourceTotal: ["custototalr", "custototal", "valortotal", "total", "totalrealr", "totalr"],
  };
  const header = rows.findIndex(
    (r) =>
      r.some((v) => aliases.description.includes(normalize(v))) &&
      r.some((v) => aliases.unit.includes(normalize(v))),
  );
  if (header < 0) throw new Error("Não encontrei o cabeçalho de Descrição e Unidade.");
  const columns = Object.fromEntries(
    Object.entries(aliases).map(([key, values]) => [
      key,
      rows[header]!.findIndex((v) => values.includes(normalize(v))),
    ]),
  ) as Record<keyof typeof aliases, number>;
  for (const name of ["code", "description", "unit", "quantity", "unitPrice"] as const)
    if (columns[name] === -1 && !(options.quotation && name === "unitPrice"))
      throw new Error(
        "Coluna ausente: " +
          (
            {
              code: "Código",
              description: "Descrição",
              unit: "Unidade",
              quantity: "Quantidade",
              unitPrice: "Preço unitário",
            } as Record<string, string>
          )[name],
      );
  if (rows.length > 10050) throw new Error("Use uma planilha com até 10.000 linhas.");
  const items: ImportItem[] = [],
    errors: string[] = [],
    warnings: string[] = [];
  const data = rows.slice(header + 1).map((r, i) => ({
    r,
    row: header + i + 2,
    code: clean(r[columns.code!]),
    description: clean(r[columns.description!]),
    unit: clean(r[columns.unit!]),
  }));
  const parents = new Set<string>();
  for (const entry of data) {
    const parts = entry.code.split(".");
    while (parts.length > 1) {
      parts.pop();
      parents.add(parts.join("."));
    }
  }
  const groups = new Map<string, string>();
  let currentGroup = "";
  const seen = new Set<string>();
  for (const entry of data) {
    const { r, row, code, description, unit } = entry;
    if (r.every((v) => clean(v) === "")) continue;
    if (!/^\d+(\.\d+)*$/.test(code) && !unit) continue;
    if (
      parents.has(code) ||
      (description &&
        (unit === "-" || unit === "—" || !unit) &&
        clean(r[columns.quantity!]) === "" &&
        clean(r[columns.unitPrice!]) === "")
    ) {
      groups.set(code, description);
      currentGroup = description;
      continue;
    }
    if (!code || !description || !unit) {
      errors.push("Linha " + row + ": preencha código, descrição e unidade.");
      continue;
    }
    if (seen.has(code)) errors.push("Linha " + row + ": código repetido " + code + ".");
    seen.add(code);
    try {
      const quantity = parseAmount(r[columns.quantity!]),
        unitPrice = options.quotation ? null : parseAmount(r[columns.unitPrice!]);
      const sourceTotal =
        !options.quotation && columns.sourceTotal! >= 0
          ? parseAmount(r[columns.sourceTotal!])
          : null;
      const ancestors = code.split(".");
      const names: string[] = [];
      const hierarchy: { code: string; name: string }[] = [];
      while (ancestors.length > 1) {
        ancestors.pop();
        const name = groups.get(ancestors.join("."));
        if (name) {
          names.unshift(name);
          hierarchy.unshift({ code: ancestors.join("."), name });
        }
      }
      items.push({
        hierarchy,
        row,
        code,
        description,
        unit,
        quantity,
        unitPrice,
        sourceTotal,
        group: names.join(" / ") || currentGroup,
      });
      if (
        quantity !== null &&
        unitPrice !== null &&
        sourceTotal !== null &&
        Math.abs(quantity * unitPrice - sourceTotal) > 0.015
      )
        warnings.push(
          "Linha " +
            row +
            ": total da planilha difere do cálculo. Será usado quantidade × preço unitário.",
        );
    } catch {
      errors.push(
        "Linha " +
          row +
          ": quantidade, preço ou total inválido. Use números positivos ou deixe o campo vazio.",
      );
    }
  }
  if (!items.length) errors.push("Nenhum item de orçamento encontrado.");
  return {
    items,
    errors,
    warnings,
    groups: groups.size,
    total: items.reduce((sum, i) => sum + (i.quantity ?? 0) * (i.unitPrice ?? 0), 0),
    pending: items.filter((i) => i.quantity === null || i.unitPrice === null).length,
  };
}
