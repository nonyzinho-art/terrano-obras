import { useMemo, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtBRL, fmtDate, fmtNum } from "@/lib/format";
import { parseUauAdvances, type Settlement, type UauAdvance } from "@/lib/measurement-advances";
import type { MeasurementAdvance } from "@/lib/types";

export interface AdvanceDraft {
  key: string;
  supplier: string;
  invoice: string;
  uau_process: string;
  paid_on: string;
  description: string;
  amount: string;
  source: "manual" | "uau";
}

export const advanceDraft = (a?: Partial<MeasurementAdvance>): AdvanceDraft => ({
  key: crypto.randomUUID(),
  supplier: a?.supplier ?? "",
  invoice: a?.invoice ?? "",
  uau_process: a?.uau_process ?? "",
  paid_on: a?.paid_on ?? "",
  description: a?.description ?? "",
  amount: a?.amount != null ? String(a.amount).replace(".", ",") : "",
  source: a?.source ?? "manual",
});

/** Forma comparável (sem a chave da linha) para detectar alterações não salvas. */
export const advancesSignature = (list: AdvanceDraft[]) =>
  JSON.stringify(list.map(({ key: _key, ...rest }) => rest));

const fields: { name: keyof AdvanceDraft; label: string; className: string; type?: string }[] = [
  { name: "supplier", label: "Fornecedor", className: "min-w-52" },
  { name: "invoice", label: "NF", className: "w-24" },
  { name: "uau_process", label: "Processo UAU", className: "w-28" },
  { name: "paid_on", label: "Data", className: "w-36", type: "date" },
  { name: "amount", label: "Valor (R$)", className: "w-32 text-right" },
];

export function MeasurementAdvances({
  advances,
  onChange,
  editable,
  settlement,
  used,
  period,
}: {
  advances: AdvanceDraft[];
  onChange: (next: AdvanceDraft[]) => void;
  editable: boolean;
  settlement: Settlement;
  /** Processos UAU já lançados em outras medições deste contrato → descrição da medição. */
  used: Map<string, string>;
  period: { start: string; end: string };
}) {
  const [importing, setImporting] = useState(false);
  const update = (key: string, name: keyof AdvanceDraft, value: string) =>
    onChange(advances.map((a) => (a.key === key ? { ...a, [name]: value } : a)));
  const s = settlement;
  const summary: [string, number, string?][] = [
    ["Valor medido", s.measured],
    [`Retenção (${fmtNum(s.retentionPercent, 2)}%)`, s.retention ? -s.retention : 0],
    ["Adiantamentos desta medição", s.advances],
    ["Saldo de medições anteriores", s.carriedIn],
    ["Descontado nesta medição", s.deducted ? -s.deducted : 0],
  ];
  return (
    <section className="space-y-3 rounded-md border p-3" aria-label="Adiantamentos a descontar">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Adiantamentos a descontar</h3>
          <p className="text-xs text-muted-foreground">
            Pagamentos feitos pela Terrano em nome do empreiteiro (material, locação, mão de obra).
            O que não couber nesta medição fica como saldo para a próxima.
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange([...advances, advanceDraft()])}
            >
              <Plus className="mr-1 h-4 w-4" /> Adicionar adiantamento
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setImporting(true)}>
              <Upload className="mr-1 h-4 w-4" /> Importar do UAU
            </Button>
          </div>
        )}
      </div>
      {advances.length ? (
        <div className="relative overflow-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Adiantamentos descontados nesta medição</caption>
            <thead>
              <tr className="border-b text-left">
                {fields.map((f) => (
                  <th key={f.name} scope="col" className="p-2">
                    {f.label}
                  </th>
                ))}
                <th scope="col" className="p-2">
                  <span className="sr-only">Remover</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {advances.map((a, i) => (
                <tr key={a.key} className="border-b">
                  {fields.map((f) => (
                    <td key={f.name} className="p-1.5">
                      {editable ? (
                        <Input
                          aria-label={`${f.label} do adiantamento ${i + 1}`}
                          type={f.type ?? "text"}
                          inputMode={f.name === "amount" ? "decimal" : undefined}
                          className={f.className}
                          maxLength={f.name === "supplier" ? 200 : 60}
                          value={a[f.name]}
                          onChange={(e) => update(a.key, f.name, e.target.value)}
                        />
                      ) : (
                        <span className={f.name === "amount" ? "num block text-right" : ""}>
                          {f.name === "paid_on"
                            ? a.paid_on && fmtDate(a.paid_on)
                            : f.name === "amount"
                              ? fmtBRL(Number(a.amount.replace(/\./g, "").replace(",", ".")))
                              : a[f.name]}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="p-1.5 text-right">
                    {editable && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover adiantamento ${i + 1}`}
                        onClick={() => onChange(advances.filter((x) => x.key !== a.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum adiantamento nesta medição.</p>
      )}
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {summary.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-dashed py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="num">{fmtBRL(value)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-b border-dashed py-1">
          <dt className="text-muted-foreground">Saldo a descontar na próxima</dt>
          <dd className={`num ${s.carriedOut ? "font-semibold text-amber-700" : ""}`}>
            {fmtBRL(s.carriedOut)}
          </dd>
        </div>
      </dl>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-muted/40 p-3">
          <div className="eyebrow">Valor para emissão da NF</div>
          <div className="num mt-1 text-lg font-semibold text-primary">{fmtBRL(s.invoice)}</div>
          <div className="text-xs text-muted-foreground">Medido − adiantamentos descontados</div>
        </div>
        <div className="rounded-md bg-muted/40 p-3">
          <div className="eyebrow">Líquido a pagar</div>
          <div className="num mt-1 text-lg font-semibold">{fmtBRL(s.payable)}</div>
          <div className="text-xs text-muted-foreground">NF − retenção</div>
        </div>
      </div>
      {importing && (
        <UauImportDialog
          used={used}
          current={new Set(advances.map((a) => a.uau_process.trim()).filter(Boolean))}
          period={period}
          onClose={() => setImporting(false)}
          onAdd={(rows) => {
            onChange([
              ...advances,
              ...rows.map((r) =>
                advanceDraft({
                  supplier: r.supplier,
                  uau_process: r.process,
                  paid_on: r.paid_on,
                  amount: r.amount,
                  source: "uau",
                }),
              ),
            ]);
            setImporting(false);
          }}
        />
      )}
    </section>
  );
}

type Sheet = { sheet: string; data: unknown[][] };

function UauImportDialog({
  used,
  current,
  period,
  onClose,
  onAdd,
}: {
  used: Map<string, string>;
  current: Set<string>;
  period: { start: string; end: string };
  onClose: () => void;
  onAdd: (rows: UauAdvance[]) => void;
}) {
  const [rows, setRows] = useState<UauAdvance[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const blocked = (p: string) =>
    current.has(p) ? "já está nesta medição" : used.has(p) ? `já lançado: ${used.get(p)}` : "";
  const read = async (file: File) => {
    setBusy(true);
    setError("");
    setRows([]);
    setSelected(new Set());
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("Escolha um arquivo Excel .xlsx.");
      if (file.size > 15 * 1024 * 1024) throw new Error("Use um arquivo com até 15 MB.");
      const { default: readExcel } = await import("read-excel-file/universal");
      const sheets = (await readExcel(await file.arrayBuffer())) as Sheet[];
      const ordered = [
        ...sheets.filter((s) => /adiant/i.test(s.sheet)),
        ...sheets.filter((s) => !/adiant/i.test(s.sheet)),
      ];
      const found = ordered.map((s) => parseUauAdvances(s.data)).find((r) => r.rows.length);
      if (!found) throw new Error(parseUauAdvances(ordered[0]?.data ?? []).error);
      setRows(found.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui ler o Excel.");
    } finally {
      setBusy(false);
    }
  };
  const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter((r) =>
        norm(`${r.process} ${r.supplier} ${r.who} ${r.kind}`).includes(norm(search.trim())),
      ),
    [rows, search],
  );
  const toggle = (p: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  const inPeriod = rows.filter(
    (r) => r.paid_on && r.paid_on >= period.start && r.paid_on <= period.end && !blocked(r.process),
  );
  const chosen = rows.filter((r) => selected.has(r.process));
  const total = chosen.reduce((s, r) => s + r.amount, 0);
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar adiantamentos do UAU</DialogTitle>
          <DialogDescription>
            Use a exportação de adiantamentos do UAU (colunas Processo, Valor, Data e Nome
            Fornecedor) ou a própria planilha de medição com a aba ADIANTAMENTO. Marque os
            pagamentos que entram nesta medição. Processos já lançados em outra medição deste
            contrato ficam bloqueados.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="file"
          accept=".xlsx"
          aria-label="Arquivo de adiantamentos do UAU"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void read(file);
          }}
        />
        {busy && <p className="text-sm text-muted-foreground">Lendo a planilha…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="max-w-xs"
                aria-label="Buscar adiantamento"
                placeholder="Buscar fornecedor ou processo"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!inPeriod.length}
                onClick={() => setSelected(new Set(inPeriod.map((r) => r.process)))}
              >
                Marcar os pagos no período ({inPeriod.length})
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!selected.size}
                onClick={() => setSelected(new Set())}
              >
                Limpar seleção
              </Button>
            </div>
            <div className="relative max-h-[45vh] overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left">
                    <th scope="col" className="p-2">
                      <span className="sr-only">Selecionar</span>
                    </th>
                    <th scope="col" className="p-2">
                      Processo
                    </th>
                    <th scope="col" className="p-2">
                      Fornecedor
                    </th>
                    <th scope="col" className="p-2">
                      Data
                    </th>
                    <th scope="col" className="p-2 text-right">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const why = blocked(r.process);
                    return (
                      <tr key={r.process} className={`border-b ${why ? "opacity-50" : ""}`}>
                        <td className="p-2">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar processo ${r.process}`}
                            disabled={!!why}
                            checked={selected.has(r.process)}
                            onChange={() => toggle(r.process)}
                          />
                        </td>
                        <td className="p-2">{r.process}</td>
                        <td className="p-2">
                          {r.supplier}
                          {why && <span className="block text-xs text-amber-700">{why}</span>}
                        </td>
                        <td className="p-2">{r.paid_on ? fmtDate(r.paid_on) : "—"}</td>
                        <td className="num p-2 text-right">{fmtBRL(r.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {chosen.length} selecionado(s) · {fmtBRL(total)}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" disabled={!chosen.length || busy} onClick={() => onAdd(chosen)}>
              Adicionar à medição
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
