import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDisbursementRows, type DisbursementPreview } from "@/lib/cost-flow";
import { costPlanError, importDisbursements } from "@/lib/cost-plan-data";
import { fmtBRL } from "@/lib/format";

type Sheet = { sheet: string; data: unknown[][] };
const monthLabel = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

export function DisbursementImportDialog({
  workId,
  planInsumos,
  onClose,
}: {
  workId: string;
  planInsumos: Set<string>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheet, setSheet] = useState("");
  const [preview, setPreview] = useState<DisbursementPreview | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const reading = useRef(0);

  const choose = (next: string, list: Sheet[]) => {
    setSheet(next);
    setPreview(parseDisbursementRows(list.find((s) => s.sheet === next)?.data ?? []));
  };
  const read = async (file: File) => {
    const sequence = ++reading.current;
    setBusy(true);
    setError("");
    setPreview(null);
    setSheets([]);
    setFilename(file.name);
    key.current = crypto.randomUUID();
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("Escolha um arquivo Excel .xlsx.");
      if (file.size > 15 * 1024 * 1024) throw new Error("Use um arquivo com até 15 MB.");
      const { default: readExcel } = await import("read-excel-file/universal");
      const list = (await readExcel(await file.arrayBuffer())) as Sheet[];
      if (sequence !== reading.current) return;
      setSheets(list);
      const preferred =
        list.find((s) => /desembolso/i.test(s.sheet)) ??
        list.find((s) => !parseDisbursementRows(s.data).errors.length) ??
        list[0]!;
      choose(preferred.sheet, list);
    } catch (e) {
      if (sequence === reading.current)
        setError(e instanceof Error ? e.message : "Não consegui ler o Excel.");
    } finally {
      if (sequence === reading.current) setBusy(false);
    }
  };
  const save = async () => {
    if (!preview || preview.errors.length || busy) return;
    setBusy(true);
    setError("");
    try {
      await importDisbursements({
        key: key.current,
        workId,
        filename,
        uauWork: preview.uauWork,
        rows: preview.rows,
      });
      await queryClient.invalidateQueries({ queryKey: ["cost-disbursements", workId] });
      toast.success("Desembolso importado.");
      onClose();
    } catch (e) {
      setError(costPlanError(e));
    } finally {
      setBusy(false);
    }
  };

  const months = preview?.rows.map((r) => r.month).sort() ?? [];
  const linked = (preview?.rows ?? [])
    .filter((r) => r.status === "pago" && planInsumos.has(r.insumo))
    .reduce((sum, r) => sum + r.amount, 0);
  const linkedInsumos = new Set(
    (preview?.rows ?? []).filter((r) => planInsumos.has(r.insumo)).map((r) => r.insumo),
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar desembolso do UAU</DialogTitle>
          <DialogDescription>
            Use a exportação de desembolso do UAU (colunas Ano, Mes, Insumo, Valor Liquido e
            Status), que também está na aba "Desembolso" da planilha de custo. A nova importação
            substitui a anterior no fluxo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            type="file"
            accept=".xlsx"
            aria-label="Exportação de desembolso do UAU"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void read(file);
            }}
          />
          {sheets.length > 1 && (
            <label className="block text-sm">
              Aba
              <select
                className="mt-1 h-10 w-full rounded-md border bg-card px-3 text-sm"
                value={sheet}
                onChange={(e) => choose(e.target.value, sheets)}
              >
                {sheets.map((s) => (
                  <option key={s.sheet}>{s.sheet}</option>
                ))}
              </select>
            </label>
          )}
          {preview?.errors.map((e) => (
            <p key={e} role="alert" className="rounded-md border bg-danger-soft p-3 text-sm">
              {e}
            </p>
          ))}
          {preview && !preview.errors.length && (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Período", `${monthLabel(months[0]!)} a ${monthLabel(months.at(-1)!)}`],
                  ["Obra no UAU", preview.uauWork || "—"],
                  ["Pago no arquivo", fmtBRL(preview.paid)],
                  ["A pagar programado", fmtBRL(preview.scheduled)],
                  [
                    "Pago ligado ao plano",
                    `${fmtBRL(linked)} · ${linkedInsumos.size} de ${planInsumos.size} insumos`,
                  ],
                  ["Pago fora do plano", fmtBRL(preview.paid - linked)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border bg-muted/30 p-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="num font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                Só os insumos que aparecem no planejamento entram no fluxo da obra. Os demais
                (terreno, comercial, administrativo…) ficam guardados, mas não entram no cálculo.
              </p>
              {preview.warnings.length > 0 && (
                <ul className="space-y-1 rounded-md border bg-warning-soft p-3 text-xs">
                  {preview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="rounded-md border bg-warning-soft p-3 text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={busy || !preview || !!preview.errors.length} onClick={save}>
              {busy ? "Salvando…" : "Importar desembolso"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
