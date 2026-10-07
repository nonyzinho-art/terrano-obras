import { budgetHierarchy } from "@/lib/budget-hierarchy";
import { canWriteWork } from "@/lib/access";
import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWorks, replaceData, isCloudMode } from "@/lib/repository";
import { getSupabase } from "@/lib/supabase";
import { loadCloudData } from "@/lib/cloud-data";
import { parseBudgetRows, type ImportPreview } from "@/lib/budget-import";
import { fmtBRL, fmtNum } from "@/lib/format";
type Sheet = { sheet: string; data: unknown[][] };
export function BudgetImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const works = getWorks().filter((w) => canWriteWork(w.id));
  const navigate = useNavigate();
  const [work, setWork] = useState(works[0]?.id ?? "");
  const [front, setFront] = useState("");
  const [sheets, setSheets] = useState<Sheet[]>([]),
    [sheet, setSheet] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filename, setFilename] = useState(""),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const key = useRef(""),
    reading = useRef(0);
  const selectSheet = (next: string, list = sheets) => {
    setSheet(next);
    setError("");
    setPreview(null);
    try {
      setPreview(parseBudgetRows(list.find((s) => s.sheet === next)!.data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui ler essa aba.");
    }
  };
  const read = async (file: File) => {
    const sequence = ++reading.current;
    setBusy(true);
    setSaved(false);
    setPreview(null);
    setError("");
    setSheets([]);
    setFilename(file.name);
    key.current = crypto.randomUUID();
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("Escolha um arquivo Excel .xlsx.");
      if (file.size > 10 * 1024 * 1024) throw new Error("Use um arquivo com até 10 MB.");
      const { default: readExcel } = await import("read-excel-file/universal");
      const list = await readExcel(await file.arrayBuffer());
      if (sequence !== reading.current) return;
      setSheets(list);
      selectSheet(
        list.find((s) => s.sheet.toUpperCase() === "ESPELHO")?.sheet ?? list[0]!.sheet,
        list,
      );
    } catch (e) {
      if (sequence === reading.current)
        setError(e instanceof Error ? e.message : "Não consegui ler o Excel.");
    } finally {
      if (sequence === reading.current) setBusy(false);
    }
  };
  const save = async () => {
    if (!preview || preview.errors.length || !work || !front.trim() || busy || saved) return;
    setBusy(true);
    setError("");
    try {
      if (!isCloudMode()) throw new Error("Entre no sistema para salvar o orçamento.");
      const { data, error: rpcError } = await getSupabase().rpc("import_budget", {
        p_key: key.current,
        p_work: work,
        p_name: front.trim(),
        p_filename: filename,
        p_items: preview.items,
      });
      if (rpcError) throw rpcError;
      setSaved(true);
      try {
        replaceData(await loadCloudData());
      } catch {
        toast.success("Orçamento salvo. Clique em Atualizar para carregar a nova revisão.");
        onOpenChange(false);
        return;
      }
      toast.success("Orçamento importado como nova revisão.");
      onOpenChange(false);
      await navigate({
        to: "/orcamentos/$obraId/$orcamentoId",
        params: { obraId: work, orcamentoId: String(data) },
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível importar. A prévia foi preservada.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar orçamento aprovado</DialogTitle>
          <DialogDescription>
            Selecione a obra e a frente do orçamento aprovado. Confira a hierarquia e os valores.
            Cada envio cria uma nova revisão.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            Obra
            <select
              aria-label="Obra do orçamento"
              disabled={busy || saved}
              className="h-9 w-full rounded-md border bg-background px-3"
              value={work}
              onChange={(e) => {
                setWork(e.target.value);
                key.current = crypto.randomUUID();
              }}
            >
              {works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Frente
            <Input
              disabled={busy || saved}
              maxLength={120}
              placeholder="Ex.: Rede de Água"
              value={front}
              onChange={(e) => {
                setFront(e.target.value);
                key.current = crypto.randomUUID();
              }}
            />
          </label>
        </div>
        <label className="space-y-1 text-sm">
          Planilha Excel
          <Input
            type="file"
            accept=".xlsx"
            disabled={busy || saved}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void read(file);
              e.target.value = "";
            }}
          />
        </label>
        {filename && <p className="text-xs text-muted-foreground">Arquivo: {filename}</p>}
        {sheets.length > 1 && (
          <label className="text-sm">
            Aba
            <select
              className="ml-3 rounded border p-2"
              disabled={busy || saved}
              value={sheet}
              onChange={(e) => {
                key.current = crypto.randomUUID();
                selectSheet(e.target.value);
              }}
            >
              {sheets.map((s) => (
                <option key={s.sheet}>{s.sheet}</option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="rounded border bg-warning-soft p-3 text-sm">
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className="text-sm">
            Processando orçamento…
          </p>
        )}
        {preview && (
          <>
            <div className="rounded border bg-muted/30 p-3 text-sm">
              {preview.items.length} itens · {preview.groups} agrupamentos · {preview.pending} itens
              com campos pendentes
              <br />
              <strong>
                {preview.pending ? "Valor parcial calculado" : "Valor total calculado"}:{" "}
                {fmtBRL(preview.total)}
              </strong>
            </div>
            <p className="text-xs text-muted-foreground">
              Agrupamentos organizam os itens e não entram novamente na soma. Peso físico não é
              importado. Quantidades e preços ausentes ficam identificados como pendentes.
            </p>
            {preview.errors.length > 0 && (
              <div role="alert" className="rounded border bg-warning-soft p-3 text-sm">
                <strong>Corrija a planilha antes de importar:</strong>
                {preview.errors.slice(0, 15).map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
                {preview.errors.length > 15 && <p>Mais {preview.errors.length - 15} erros.</p>}
              </div>
            )}
            {preview.warnings.length > 0 && (
              <details className="text-sm">
                <summary>{preview.warnings.length} divergências de total para conferir</summary>
                {preview.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </details>
            )}
            <div className="max-h-80 overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {[
                      "Linha",
                      "Código",
                      "Descrição",
                      "Unidade",
                      "Quantidade",
                      "Preço unitário",
                      "Total",
                    ].map((h) => (
                      <th key={h} className="p-2 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {budgetHierarchy(preview.items).map((row) => {
                    if (row.kind === "group")
                      return (
                        <tr
                          key={`group-${row.code}`}
                          className={
                            row.depth === 1
                              ? "bg-primary text-primary-foreground"
                              : "bg-success-soft text-primary"
                          }
                        >
                          <td />
                          <td className="p-2 font-semibold">{row.code}</td>
                          <td
                            colSpan={5}
                            className="p-2 font-semibold"
                            style={{ paddingLeft: 8 + (row.depth - 1) * 12 }}
                          >
                            {row.name}
                          </td>
                        </tr>
                      );
                    const i = row.item;
                    return (
                      <tr key={i.row} className="border-t bg-card">
                        <td className="p-2">{i.row}</td>
                        <td className="p-2">{i.code}</td>
                        <td className="min-w-64 p-2">{i.description}</td>
                        <td className="p-2">{i.unit}</td>
                        <td className="p-2 whitespace-nowrap">
                          {i.quantity === null ? "Quantidade pendente" : fmtNum(i.quantity, 4)}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {i.unitPrice === null ? "Preço pendente" : fmtBRL(i.unitPrice)}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {i.quantity === null || i.unitPrice === null
                            ? "Pendente"
                            : fmtBRL(i.quantity * i.unitPrice)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!isCloudMode() && (
          <p className="text-sm text-muted-foreground">
            Prévia local. Entre no sistema para salvar na sua obra.
          </p>
        )}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={
              !isCloudMode() ||
              busy ||
              saved ||
              !work ||
              !front.trim() ||
              !preview ||
              Boolean(preview.errors.length)
            }
            onClick={save}
          >
            Importar como aprovado
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
