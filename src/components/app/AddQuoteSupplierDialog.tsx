import { useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { quoteError, type Quote } from "@/lib/quotes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function AddQuoteSupplierDialog({
  quote,
  onClose,
  onSaved,
}: {
  quote: Quote;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [deadline, setDeadline] = useState(quote.deadline);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const attempted = useRef("");
  const save = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const signature = JSON.stringify([name.trim(), email.trim(), deadline]);
      if (attempted.current && attempted.current !== signature) key.current = crypto.randomUUID();
      attempted.current = signature;
      const { error } = await getSupabase().rpc("add_quote_supplier", {
        p_quote: quote.id,
        p_key: key.current,
        p_name: name.trim(),
        p_email: email.trim(),
        p_deadline: deadline,
      });
      if (error) throw error;
      toast.success("Fornecedor adicionado. Copie o novo link na lista de convites.");
      onSaved();
      onClose();
    } catch (e) {
      setError(quoteError(e));
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
          <DialogTitle>Adicionar fornecedor</DialogTitle>
          <DialogDescription>
            Gere um novo convite para esta cotação. As propostas recebidas serão preservadas.
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
            Nome do fornecedor
            <Input
              required
              maxLength={200}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            E-mail (opcional)
            <Input
              type="email"
              maxLength={254}
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Prazo da cotação
            <Input
              required
              type="date"
              min={new Date().toLocaleDateString("en-CA")}
              value={deadline}
              disabled={busy}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Se alterar o prazo, a nova data valerá para todos os fornecedores desta cotação. O link
            será disponibilizado para você copiar e enviar.
          </p>
          {error && (
            <p role="alert" className="rounded border bg-warning-soft p-3 text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={busy}>{busy ? "Salvando…" : "Adicionar e gerar link"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
