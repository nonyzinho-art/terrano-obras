import type { Work } from "@/lib/types";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { useAccess, setAccess } from "@/lib/access";
import { loadCloudData } from "@/lib/cloud-data";
import { replaceData } from "@/lib/repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function NewWorkDialog({ onClose, work }: { onClose: () => void; work?: Work }) {
  const { profile, canWriteWork } = useAccess();
  const id = useRef(work?.id ?? crypto.randomUUID());
  const [name, setName] = useState(work?.name ?? "");
  const [city, setCity] = useState(work?.city ?? "");
  const [state, setState] = useState(work?.state ?? "GO");
  const [start, setStart] = useState(work?.start_date ?? "");
  const [end, setEnd] = useState(work?.end_date ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (busy || !profile?.active || (work ? !canWriteWork(work.id) : profile.role === "engenheiro"))
      return;
    if (!name.trim() || !city.trim() || !start || !end || end < start) {
      setError(
        "Preencha o nome, a cidade e as datas. O término deve ser igual ou posterior ao início.",
      );
      return;
    }
    setBusy(true);
    setError("");
    let committed = false;
    try {
      const client = getSupabase();
      const payload = {
        name: name.trim(),
        city: city.trim(),
        state,
        location: `${city.trim()} / ${state}`,
        start_date: start,
        end_date: end,
      };
      if (work) {
        const result = await client.from("works").update(payload).eq("id", work.id).select("id");
        if (result.error) throw result.error;
        if (!result.data?.length) throw Error("Sem permissão para editar esta obra.");
      } else {
        const result = await client.from("works").insert({ id: id.current, ...payload });
        if (result.error) {
          const check = await client.from("works").select("id").eq("id", id.current).maybeSingle();
          if (!check.data) throw result.error;
        }
      }
      committed = true;
      const [data, permissions] = await Promise.all([
        loadCloudData(),
        client.rpc("my_work_permissions"),
      ]);
      if (permissions.error) throw permissions.error;
      setAccess(profile, permissions.data ?? []);
      replaceData(data);
      toast.success(work ? "Obra atualizada." : "Obra cadastrada.");
      onClose();
    } catch (e) {
      if (committed) {
        toast.success("Dados salvos. Clique em Atualizar para carregar a lista.");
        onClose();
      } else
        setError(
          e instanceof Error ? e.message : "Não foi possível cadastrar a obra. Tente novamente.",
        );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{work ? "Editar obra" : "Adicionar obra"}</DialogTitle>
          <DialogDescription>
            Cadastre os dados da obra. Depois, adicione as frentes, o orçamento e os documentos.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="block text-sm">
            Nome da obra
            <Input
              required
              maxLength={200}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Residencial Flor da Terra"
            />
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3">
            <label className="block text-sm">
              Cidade
              <Input
                required
                maxLength={120}
                value={city}
                disabled={busy}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex.: Mara Rosa"
              />
            </label>
            <label className="block text-sm">
              Estado
              <select
                aria-label="Estado"
                className="h-9 w-full rounded-md border bg-background px-3"
                disabled={busy}
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
                  .split(" ")
                  .map((uf) => (
                    <option key={uf}>{uf}</option>
                  ))}
              </select>
            </label>
          </div>
          {work && !work.city && (
            <p className="text-xs text-muted-foreground">
              Localização atual: {work.location}. Informe a cidade para completar o cadastro.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Início previsto
              <Input
                required
                type="date"
                value={start}
                disabled={busy}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Término previsto
              <Input
                required
                type="date"
                min={start || undefined}
                value={end}
                disabled={busy}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="rounded border bg-warning-soft p-3 text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={busy}>
              {busy ? "Salvando…" : work ? "Salvar alterações" : "Cadastrar obra"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
