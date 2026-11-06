import { PhotoImage } from "@/components/app/PhotoImage";
import { canWriteWork, canEditDiary } from "@/lib/access";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createDailyReport,
  getServices,
  getWorks,
  TODAY,
  getReportItems,
  getReportPhotos,
  getReportIssues,
  getMeasurementProgress,
  getBudget,
  getItemsByBudget,
} from "@/lib/repository";
import { parseAmount } from "@/lib/budget-import";
import type { Weather, DailyReport } from "@/lib/types";

const WEATHERS: Weather[] = ["Ensolarado", "Parcialmente nublado", "Nublado", "Chuvoso"];
const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type Item = { service_id: string; qty: string; description: string };

export function NewReportDialog({
  open,
  onOpenChange,
  defaultWorkId,
  defaultDate,
  existingReport,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultWorkId?: string;
  defaultDate?: string;
  existingReport?: DailyReport;
}) {
  const works = getWorks().filter(
    (w) =>
      canWriteWork(w.id) &&
      (w.status !== "concluida" || w.id === defaultWorkId || w.id === existingReport?.work_id),
  );
  const [workId, setWorkId] = useState(
    existingReport?.work_id ?? works.find((w) => w.id === defaultWorkId)?.id ?? works[0]?.id ?? "",
  );
  const [budgetId, setBudgetId] = useState(existingReport?.budget_id ?? "");
  const [recordId, setRecordId] = useState(() => existingReport?.id ?? crypto.randomUUID());
  const [date, setDate] = useState(existingReport?.date ?? defaultDate ?? TODAY);
  const [weather, setWeather] = useState<Weather>(existingReport?.weather ?? "Ensolarado");
  const [resp, setResp] = useState(existingReport?.responsible_user ?? "");
  const [workers, setWorkers] = useState(
    existingReport ? String(existingReport.workers_quantity) : "",
  );
  const [equip, setEquip] = useState(
    existingReport
      ? String(existingReport.equipment_quantity ?? existingReport.equipment.length)
      : "",
  );
  const [items, setItems] = useState<Item[]>(() =>
    existingReport
      ? getReportItems(existingReport.id).map((i) => ({
          service_id: i.budget_item_id ? "b:" + i.budget_item_id : (i.service_id ?? ""),
          qty: String(i.executed_quantity),
          description: i.description,
        }))
      : [{ service_id: "", qty: "", description: "" }],
  );
  const [obs, setObs] = useState(existingReport?.observations ?? "");
  const [issues, setIssues] = useState("");
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const existingPhotos = existingReport ? getReportPhotos(existingReport.id) : [];
  const existingIssues = existingReport ? getReportIssues(existingReport.id) : [];
  const budgets = getMeasurementProgress(workId)
    .summaries.map((s) => s.budget)
    .filter((b) => b.execution_status !== "concluido");
  const originalBudget = existingReport?.budget_id
    ? getBudget(workId, existingReport.budget_id)
    : undefined;
  if (originalBudget && !budgets.some((b) => b.id === originalBudget.id))
    budgets.push(originalBudget);
  const services = budgetId
    ? [...getItemsByBudget(budgetId)]
        .sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }))
        .map((i) => ({ id: "b:" + i.id, name: i.code + " — " + i.description, unit: i.unit }))
        .concat(
          getServices(workId)
            .filter((i) => items.some((row) => row.service_id === i.id))
            .map((i) => ({ id: i.id, name: "Cadastro anterior — " + i.name, unit: i.unit })),
        )
    : getServices(workId);
  const pendingRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const signature = JSON.stringify({
    workId,
    budgetId,
    date,
    weather,
    resp,
    workers,
    equip,
    items,
    obs,
    issues,
    files,
  });
  const [initialSignature] = useState(signature);
  const dirty = signature !== initialSignature;
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(
    () => () => {
      filesRef.current.forEach((f) => URL.revokeObjectURL(f.url));
    },
    [],
  );
  useEffect(() => {
    if (!open || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, dirty]);
  const requestClose = (next: boolean) => {
    if (saving) return;
    if (!next && dirty && !window.confirm("Descartar as alterações não salvas deste diário?"))
      return;
    if (!next && !existingReport) reset();
    onOpenChange(next);
  };
  const reset = () => {
    files.forEach((f) => URL.revokeObjectURL(f.url));
    setItems([{ service_id: "", qty: "", description: "" }]);
    setObs("");
    setIssues("");
    setFiles([]);
    pendingRequest.current = null;
    if (!existingReport) {
      setRecordId(crypto.randomUUID());
      setWorkers("");
      setEquip("");
      setResp("");
      setWeather("Ensolarado");
      setDate(defaultDate ?? TODAY);
      setBudgetId("");
    }
  };
  const setItem = (i: number, patch: Partial<Item>) =>
    setItems((rows) => rows.map((row, index) => (index === i ? { ...row, ...patch } : row)));
  const submit = async (status: "rascunho" | "finalizado") => {
    if (
      saving ||
      !workId ||
      !canWriteWork(workId) ||
      (existingReport && !canEditDiary(existingReport))
    )
      return;
    if (
      [workers, equip].some(
        (v) => v.trim() === "" || !Number.isSafeInteger(Number(v)) || Number(v) < 0,
      )
    ) {
      toast.error(
        "Informe a quantidade de trabalhadores e equipamentos. Use zero quando não houver.",
      );
      return;
    }
    let valid: { service_id: string; qty: number; description: string }[];
    try {
      valid = items
        .filter((i) => i.service_id || i.qty.trim())
        .map((i) => {
          const qty = parseAmount(i.qty);
          if (!i.service_id || qty === null || qty <= 0 || qty !== Math.round(qty * 10000) / 10000)
            throw Error();
          return { ...i, qty };
        });
    } catch {
      toast.error(
        "Selecione o serviço e informe quantidade positiva com até quatro casas decimais.",
      );
      return;
    }
    if (
      status === "finalizado" &&
      !valid.length &&
      !obs.trim() &&
      !files.length &&
      !existingPhotos.length &&
      !issues.trim() &&
      !existingIssues.length
    ) {
      toast.error("Registre serviço, observação, ocorrência ou foto antes de finalizar.");
      return;
    }
    if (!pendingRequest.current || pendingRequest.current.fingerprint !== signature + status)
      pendingRequest.current = { fingerprint: signature + status, id: crypto.randomUUID() };
    setSaving(true);
    try {
      await createDailyReport({
        id: recordId,
        requestId: pendingRequest.current.id,
        ...(existingReport ? { expectedRevision: existingReport.revision ?? 1 } : {}),
        report: {
          work_id: workId,
          budget_id: budgetId || null,
          date,
          weather,
          responsible_user: resp,
          workers_quantity: Number(workers),
          equipment: existingReport?.equipment ?? [],
          equipment_quantity: Number(equip),
          observations: obs,
          status,
        },
        items: valid.map((i) =>
          i.service_id.startsWith("b:")
            ? {
                service_id: null,
                budget_item_id: i.service_id.slice(2),
                budget_id: budgetId,
                executed_quantity: i.qty,
                description: i.description,
              }
            : { service_id: i.service_id, executed_quantity: i.qty, description: i.description },
        ),
        photoUrls: files.map((f) => f.url),
        issues: issues
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
      });
      toast.success(status === "finalizado" ? "Diário finalizado e salvo." : "Rascunho salvo.");
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : ((error as { message?: string })?.message ??
              "Não foi possível salvar. Tente novamente."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="eyebrow">Diário de obras</div>
          <DialogTitle>
            {existingReport ? "Complementar diário em rascunho" : "Novo registro de diário"}
          </DialogTitle>
          <DialogDescription>
            Registre os serviços, ocorrências e fotos da obra. O avanço do orçamento é atualizado
            pelas medições aprovadas.
          </DialogDescription>
        </DialogHeader>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Obra</Label>
            <select
              className={selectCls}
              value={workId}
              disabled={!!existingReport || saving}
              aria-label="Obra do diário"
              onChange={(e) => {
                if (
                  items.some((i) => i.service_id) &&
                  !window.confirm("Trocar a obra limpa os serviços selecionados. Continuar?")
                )
                  return;
                setWorkId(e.target.value);
                setBudgetId("");
                setItems([{ service_id: "", qty: "", description: "" }]);
              }}
            >
              {works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label>Orçamento vinculado</Label>
            <select
              aria-label="Orçamento do diário"
              className={selectCls}
              value={budgetId}
              disabled={!!existingReport?.budget_id || saving}
              onChange={(e) => {
                if (
                  items.some((i) => i.service_id) &&
                  !window.confirm("Trocar o orçamento limpa os serviços selecionados. Continuar?")
                )
                  return;
                setBudgetId(e.target.value);
                setItems([{ service_id: "", qty: "", description: "" }]);
              }}
            >
              <option value="">Registro geral / cadastro anterior</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · Revisão {b.revision ?? 1}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Selecione um orçamento para lançar seus itens. Observações e paralisações também podem
              ser registradas sem produção.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input
              type="date"
              max={TODAY}
              aria-label="Data do diário"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Clima</Label>
            <select
              className={selectCls}
              value={weather}
              onChange={(e) => setWeather(e.target.value as Weather)}
            >
              {WEATHERS.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Input
              aria-label="Responsável do diário"
              placeholder="Seu nome será usado se deixar em branco"
              value={resp}
              onChange={(e) => setResp(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Trabalhadores</Label>
              <Input
                aria-label="Quantidade de trabalhadores"
                placeholder="Informe a quantidade"
                type="number"
                min={0}
                step={1}
                value={workers}
                onChange={(e) => setWorkers(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Equipamentos</Label>
              <Input
                aria-label="Quantidade de equipamentos"
                placeholder="Informe a quantidade"
                type="number"
                min={0}
                step={1}
                value={equip}
                onChange={(e) => setEquip(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Serviços executados</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems([...items, { service_id: "", qty: "", description: "" }])}
            >
              <Plus className="size-3.5" />
              Adicionar serviço
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => {
              const svc = services.find((s) => s.id === it.service_id);
              return (
                <div
                  key={i}
                  className="grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1.4fr_110px_70px_1.6fr_auto]"
                >
                  <select
                    className={selectCls}
                    value={it.service_id}
                    onChange={(e) => setItem(i, { service_id: e.target.value })}
                    aria-label="Serviço"
                  >
                    <option value="">Selecione o serviço…</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="Qtd."
                    value={it.qty}
                    onChange={(e) => setItem(i, { qty: e.target.value })}
                    aria-label="Quantidade executada"
                  />
                  <Input
                    value={svc?.unit ?? "—"}
                    readOnly
                    aria-label="Unidade"
                    className="bg-muted text-center"
                  />
                  <Input
                    placeholder="Descrição complementar (ex.: quadra 18)"
                    value={it.description}
                    onChange={(e) => setItem(i, { description: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={items.length === 1}
                    onClick={() => setItems(items.filter((_, k) => k !== i))}
                    aria-label="Remover"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Observações gerais</Label>
            <Textarea
              rows={4}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Condições da frente de serviço, interferências, ocorrências…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              {existingReport ? "Novas pendências" : "Pendências"}{" "}
              <span className="font-normal text-muted-foreground">(uma por linha)</span>
            </Label>
            <Textarea
              rows={4}
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              placeholder="Ex.: Aguardar liberação de material para drenagem no setor B"
            />
          </div>
        </section>

        {existingReport && (
          <section className="rounded-md border p-3 text-sm">
            <p>{existingPhotos.length} fotos existentes serão preservadas.</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {existingPhotos.map((photo) => (
                <PhotoImage
                  key={photo.id}
                  photo={photo}
                  alt={photo.description || "Foto existente do diário"}
                  className="aspect-[4/3] w-full rounded object-cover"
                />
              ))}
            </div>
            {!!existingIssues.length && (
              <>
                <p className="mt-3 font-medium">Pendências já registradas</p>
                <ul className="list-inside list-disc">
                  {existingIssues.map((issue) => (
                    <li key={issue.id}>
                      {issue.description} ({issue.status})
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
        <section>
          <Label>{existingReport ? "Adicionar fotos" : "Fotos"}</Label>
          <label className="mt-1.5 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/30 px-4 py-6 text-sm text-muted-foreground hover:border-primary/50">
            <Upload className="size-5 text-primary" />
            <span>
              <span className="font-medium text-primary">Clique para enviar</span> ou arraste várias
              fotos
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                if (
                  selected.some(
                    (f) =>
                      !f.type.startsWith("image/") || f.size === 0 || f.size > 10 * 1024 * 1024,
                  ) ||
                  selected.length + files.length > 50
                ) {
                  toast.error("Selecione até 50 imagens válidas, com até 10 MB por foto.");
                  e.target.value = "";
                  return;
                }
                const list = selected.map((f) => ({
                  name: f.name,
                  url: URL.createObjectURL(f),
                }));
                setFiles((prev) => [...prev, ...list]);
                e.target.value = "";
              }}
            />
          </label>
          {files.length > 0 && (
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {files.map((f, i) => (
                <div key={f.url} className="relative">
                  <img
                    src={f.url}
                    alt={f.name}
                    className="aspect-square w-full rounded-sm object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(f.url);
                      setFiles(files.filter((_, k) => k !== i));
                    }}
                    className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-card/90"
                    aria-label="Remover foto"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <DialogFooter className="gap-2 border-t pt-4">
          <Button
            disabled={saving || !workId || !canWriteWork(workId)}
            variant="outline"
            onClick={() => submit("rascunho")}
          >
            Salvar rascunho
          </Button>
          <Button
            disabled={saving || !workId || !canWriteWork(workId)}
            onClick={() => submit("finalizado")}
          >
            Finalizar diário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
