import { useBlocker } from "@tanstack/react-router";
import { useBackgroundPause } from "@/lib/background-refresh";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/** Tab changes keep the mounted form; leaving its record requires an explicit choice. */
export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  useBackgroundPause(dirty);
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      dirty &&
      (current.pathname !== next.pathname ||
        (current.search as Record<string, unknown>)["medicao"] !==
          (next.search as Record<string, unknown>)["medicao"]),
    enableBeforeUnload: dirty,
    withResolver: true,
  });
  return (
    <Dialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterações não salvas</DialogTitle>
          <DialogDescription>
            Para salvar, continue editando e use Salvar rascunho ou Salvar alterações. Sair agora
            descarta o que ainda não foi salvo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => blocker.reset?.()}>Continuar editando</Button>
          <Button variant="outline" onClick={() => blocker.proceed?.()}>
            Descartar e sair
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
