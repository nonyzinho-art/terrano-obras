import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  findStageLots,
  isDeduction,
  parseCostPlanRows,
  stageName,
  summarize,
  type CostPlanPreview,
} from "@/lib/cost-plan";
import { costPlanError, importCostPlan } from "@/lib/cost-plan-data";
import { fmtBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

type Sheet = { sheet: string; data: unknown[][] };

/** "CUSTO DE OBRAS DOM BOSCO - 11-26 REV 05.xlsx" → "REV 05". */
export function revisionName(filename: string) {
  const m = filename.match(/\b(?:REV|RV|R)\s*\.?\s*(\d{1,3})\b/i);
  return m ? `REV ${m[1]!.padStart(2, "0")}` : filename.replace(/\.xlsx$/i, "").slice(0, 120);
}

export function CostPlanImportDialog({ workId, onClose }: { workId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheet, setSheet] = useState("");
  const [preview, setPreview] = useState<CostPlanPreview | null>(null);
  const [filename, setFilename] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const reading = useRef(0);

  const choose = (next: string, list: Sheet[]) => {
    setSheet(next);
    const parsed = parseCostPlanRows(list.find((s) => s.sheet === next)?.data ?? []);
    const lots = findStageLots(list);
    parsed.stages = parsed.stages.map((s) => ({ ...s, lots: lots.get(s.stage) ?? null }));
    setPreview(parsed);
  };
  const read = async (file: File) => {
    const sequence = ++reading.current;
    setBusy(true);
    setError("");
    setPreview(null);
    setSheets([]);
    setFilename(file.name);
    setName(revisionName(file.name));
    key.current = crypto.randomUUID();
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("Escolha um arquivo Excel .xlsx.");
      if (file.size > 15 * 1024 * 1024) throw new Error("Use um arquivo com até 15 MB.");
      const { default: readExcel } = await import("read-excel-file/universal");
      const list = (await readExcel(await file.arrayBuffer())) as Sheet[];
      if (sequence !== reading.current) return;
      setSheets(list);
      const preferred =
        list.find((s) => /planejamento/i.test(s.sheet)) ??
        list.find((s) => !parseCostPlanRows(s.data).errors.length) ??
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
    if (!preview || preview.errors.length || !name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await importCostPlan({
        key: key.current,
        workId,
        name: name.trim(),
        filename,
        stages: preview.stages,
        items: preview.items,
      });
      await queryClient.invalidateQueries({ queryKey: ["cost-plans", workId] });
      toast.success("Planejamento importado como nova revisão.");
      onClose();
    } catch (e) {
      setError(costPlanError(e));
    } finally {
      setBusy(false);
    }
  };

  const top = preview?.items.filter((i) => i.parent === null) ?? [];
  const totals = summarize(top.filter((i) => !isDeduction(i.service)));
  const matches =
    preview?.sheetTotal && Math.abs(preview.sheetTotal.viability - totals.viability) <= 1;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar planejamento de custos</DialogTitle>
          <DialogDescription>
            Use a planilha "Custo de obras", aba Planejamento de obras. Cada importação vira uma
            nova revisão e as anteriores são preservadas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            type="file"
            accept=".xlsx"
            aria-label="Planilha de custo de obras"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void read(file);
            }}
          />
          {sheets.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
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
              <label className="text-sm">
                Nome da revisão
                <Input
                  className="mt-1"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            </div>
          )}
          {preview?.errors.map((e) => (
            <p key={e} role="alert" className="rounded-md border bg-danger-soft p-3 text-sm">
              {e}
            </p>
          ))}
          {preview && !preview.errors.length && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Frentes", String(top.filter((i) => !isDeduction(i.service)).length)],
                  ["Viabilidade", fmtBRL(totals.viability)],
                  ["Previsão ao término", fmtBRL(totals.forecast)],
                  ["Desvio", `${totals.deviation > 0 ? "+" : ""}${fmtBRL(totals.deviation)}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="num text-sm font-semibold">{value}</div>
                  </div>
                ))}
              </div>
              {preview.sheetTotal && (
                <p
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    matches ? "text-primary" : "text-warning-foreground",
                  )}
                >
                  {matches ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <TriangleAlert className="size-4" />
                  )}
                  {matches
                    ? "A soma confere com o total da planilha."
                    : "A soma não confere com o total da planilha. Confira os avisos."}
                </p>
              )}
              {preview.warnings.length > 0 && (
                <ul className="space-y-1 rounded-md border bg-warning-soft p-3 text-xs">
                  {preview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {preview.stages.length > 0 && (
                <div>
                  <div className="mb-2 text-sm font-medium">Lotes por etapa</div>
                  <div className="flex flex-wrap gap-3">
                    {preview.stages.map((s, index) => (
                      <label key={s.stage} className="text-xs">
                        {s.name}
                        <Input
                          className="mt-1 w-28"
                          type="number"
                          min={0}
                          step={1}
                          value={s.lots ?? ""}
                          onChange={(e) => {
                            const lots = e.target.value === "" ? null : Number(e.target.value);
                            setPreview({
                              ...preview,
                              stages: preview.stages.map((x, i) =>
                                i === index
                                  ? { ...x, lots: Number.isInteger(lots) ? lots : null }
                                  : x,
                              ),
                            });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="max-h-72 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-3 py-2 font-normal">Linha</th>
                      <th className="px-3 py-2 font-normal">Frente</th>
                      <th className="px-3 py-2 font-normal">Etapa</th>
                      <th className="px-3 py-2 text-right font-normal">Viabilidade</th>
                      <th className="px-3 py-2 text-right font-normal">Previsão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.map((item, index) => (
                      <tr key={index} className="border-b last:border-0">
                        <td className="num px-3 py-1.5 text-muted-foreground">{item.row}</td>
                        <td
                          className={cn(
                            "px-3 py-1.5",
                            item.parent !== null && "pl-6 text-muted-foreground",
                          )}
                        >
                          {item.service}
                        </td>
                        <td className="px-3 py-1.5">
                          {item.parent === null && !isDeduction(item.service) ? (
                            <select
                              aria-label={`Etapa da linha ${item.row}`}
                              className="rounded border bg-card px-1 py-0.5"
                              value={item.stage ?? ""}
                              onChange={(e) =>
                                setPreview({
                                  ...preview,
                                  items: preview.items.map((x, i) =>
                                    i === index
                                      ? {
                                          ...x,
                                          stage: e.target.value ? Number(e.target.value) : null,
                                        }
                                      : x,
                                  ),
                                })
                              }
                            >
                              <option value="">Geral</option>
                              {preview.stages.map((s) => (
                                <option key={s.stage} value={s.stage}>
                                  {stageName(s.stage)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-muted-foreground">
                              {item.parent !== null ? "detalhe" : "abatimento"}
                            </span>
                          )}
                        </td>
                        <td className="num px-3 py-1.5 text-right">{fmtBRL(item.viability)}</td>
                        <td className="num px-3 py-1.5 text-right">
                          {item.forecast === null ? "—" : fmtBRL(item.forecast)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
            <Button
              disabled={busy || !preview || !!preview.errors.length || !name.trim()}
              onClick={save}
            >
              {busy ? "Salvando…" : "Importar revisão"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
