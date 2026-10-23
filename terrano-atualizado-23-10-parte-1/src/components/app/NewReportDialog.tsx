import { canWriteWork } from "@/lib/access";
import { useState } from "react";
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
import { createDailyReport, getServices, getWorks, isCloudMode, TODAY } from "@/lib/repository";
import { users } from "@/lib/mock-data";
import type { Weather } from "@/lib/types";

const WEATHERS: Weather[] = ["Ensolarado", "Parcialmente nublado", "Nublado", "Chuvoso"];
const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type Item = { service_id: string; qty: string; description: string };

export function NewReportDialog({
  open,
  onOpenChange,
  defaultWorkId,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultWorkId?: string;
  defaultDate?: string;
}) {
  const works = getWorks().filter(
    (w) => canWriteWork(w.id) && (w.status !== "concluida" || w.id === defaultWorkId),
  );
  const [workId, setWorkId] = useState(
    works.find((w) => w.id === defaultWorkId)?.id ?? works[0]?.id ?? "",
  );
  const [date, setDate] = useState(defaultDate ?? TODAY);
  const [weather, setWeather] = useState<Weather>("Ensolarado");
  const [resp, setResp] = useState(isCloudMode() ? "" : users[0]!.name);
  const [workers, setWorkers] = useState("20");
  const [equip, setEquip] = useState("4");
  const [items, setItems] = useState<Item[]>([{ service_id: "", qty: "", description: "" }]);
  const [obs, setObs] = useState("");
  const [issues, setIssues] = useState("");
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const services = getServices(workId);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setItems([{ service_id: "", qty: "", description: "" }]);
    setObs("");
    setIssues("");
    setFiles([]);
  };
  const setItem = (i: number, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it, k) => (k === i ? { ...it, ...patch } : it)));

  const submit = async (status: "rascunho" | "finalizado") => {
    const valid = items.filter((i) => i.service_id && Number(i.qty) > 0);
    if (status === "finalizado" && !valid.length) {
      toast.error("Adicione ao menos um serviço com quantidade executada.");
      return;
    }
    if (saving || !workId || !canWriteWork(workId)) return;
    setSaving(true);
    try {
      await createDailyReport({
        report: {
          work_id: workId,
          date,
          weather,
          responsible_user: resp,
          workers_quantity: Number(workers) || 0,
          equipment: [],
          equipment_quantity: Number(equip) || 0,
          observations: obs,
          status,
        },
        items: valid.map((i) => ({
          service_id: i.service_id,
          executed_quantity: Number(i.qty),
          description: i.description,
        })),
        photoUrls: files.map((f) => f.url),
        issues: issues
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      toast.success(status === "finalizado" ? "Diário finalizado e salvo." : "Rascunho salvo.");
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar. Tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="eyebrow">Diário de obras</div>
          <DialogTitle>Novo registro de diário</DialogTitle>
          <DialogDescription>
            Registre o que foi executado em campo. Ao finalizar, os quantitativos atualizam o avanço
            físico.
          </DialogDescription>
        </DialogHeader>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Obra</Label>
            <select
              className={selectCls}
              value={workId}
              onChange={(e) => {
                setWorkId(e.target.value);
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
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
            {isCloudMode() ? (
              <Input
                placeholder="Nome do responsável"
                value={resp}
                onChange={(e) => setResp(e.target.value)}
              />
            ) : (
              <select className={selectCls} value={resp} onChange={(e) => setResp(e.target.value)}>
                {users.map((u) => (
                  <option key={u.id}>{u.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Trabalhadores</Label>
              <Input
                type="number"
                min={0}
                value={workers}
                onChange={(e) => setWorkers(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Equipamentos</Label>
              <Input
                type="number"
                min={0}
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
                    type="number"
                    min={0}
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
              Pendências <span className="font-normal text-muted-foreground">(uma por linha)</span>
            </Label>
            <Textarea
              rows={4}
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              placeholder="Ex.: Aguardar liberação de material para drenagem no setor B"
            />
          </div>
        </section>

        <section>
          <Label>Fotos</Label>
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
                const list = Array.from(e.target.files ?? []).map((f) => ({
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
                    onClick={() => setFiles(files.filter((_, k) => k !== i))}
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
