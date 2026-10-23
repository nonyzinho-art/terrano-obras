import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getWork, getWorkPhotos, getItemsByBudget } from "@/lib/repository";
import { getSupabase } from "@/lib/supabase";
import { approvedQuantities } from "@/lib/measurement-progress";
import { quoteRows as readRows } from "@/lib/quotes";
import { fmtDate } from "@/lib/format";
import type { Budget, BudgetMeasurement, BudgetMeasurementItem, Photo } from "@/lib/types";
import type { ReportAttachment, ReportAuthors } from "@/lib/measurement-report";

async function preparePhoto(photo: Photo): Promise<ReportAttachment> {
  const response = await fetch(photo.file_url);
  if (!response.ok)
    throw new Error(
      "Uma foto não pôde ser carregada. Atualize os dados do sistema e tente novamente.",
    );
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Não foi possível ler uma das fotos selecionadas."));
      image.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("O navegador não conseguiu preparar as fotos.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      data: canvas.toDataURL("image/jpeg", 0.85),
      width: canvas.width,
      height: canvas.height,
      description: photo.description,
      date: new Date(photo.created_at).toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      }),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function MeasurementReportDialog({
  budget,
  measurement,
  disabled,
}: {
  budget: Budget;
  measurement: BudgetMeasurement;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const photos = getWorkPhotos(budget.work_id).filter((p) => p.budget_id === budget.id);
  async function download() {
    setBusy(true);
    setMessage("");
    try {
      const work = getWork(budget.work_id);
      if (!work) throw new Error("Obra não encontrada.");
      const [history, lines] = await Promise.all([
        readRows<BudgetMeasurement>("budget_measurements", "budget_id", budget.id),
        readRows<BudgetMeasurementItem>("budget_measurement_items", "budget_id", budget.id),
      ]);
      const saved = history.find((m) => m.id === measurement.id);
      if (!saved) throw new Error("Atualize os dados antes de gerar o relatório.");
      if (saved.revision !== measurement.revision || saved.status !== measurement.status)
        throw new Error(
          "Esta medição foi alterada. Atualize os dados e confira a versão salva antes de gerar o PDF.",
        );
      const { data, error } = await getSupabase().rpc("measurement_report_authors", {
        p_measurement: saved.id,
      });
      if (error) throw error;
      const authors = (data as ReportAuthors[] | null)?.[0];
      if (!authors) throw new Error("Não foi possível identificar os responsáveis da medição.");
      const attachments: ReportAttachment[] = [];
      for (const photo of photos.filter((p) => selected.includes(p.id)))
        attachments.push(await preparePhoto(photo));
      const { buildMeasurementReport } = await import("@/lib/measurement-report");
      const previous = approvedQuantities(
        history.filter((m) => m.period_end < saved.period_start && m.id !== saved.replaces_id),
        lines,
        saved.period_start,
      );
      const pdf = buildMeasurementReport({
        work,
        budget,
        measurement: saved,
        items: getItemsByBudget(budget.id),
        lines: lines.filter((line) => line.measurement_id === saved.id),
        previous,
        authors,
        photos: attachments,
        issuedAt: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });
      const filename =
        `medicao-${work.name}-${budget.name}-${saved.period_end}-${saved.id.slice(0, 8)}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9-]/g, "-")
          .slice(0, 180);
      pdf.save(`${filename}.pdf`);
      setMessage("PDF gerado. Confira o arquivo baixado.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ((error as { message?: string })?.message ?? "Não foi possível gerar o PDF."),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          setSelected([]);
          setMessage("");
          setOpen(true);
        }}
      >
        Relatório PDF
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Relatório de medição</DialogTitle>
            <DialogDescription>
              {budget.name} · {fmtDate(measurement.period_start)} a{" "}
              {fmtDate(measurement.period_end)}. O PDF usa a versão salva e identifica sua situação
              de aprovação.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O relatório inclui itens medidos, quantidades, valores e responsáveis. Selecione até 20
            fotos vinculadas a este orçamento para anexar; sem seleção, o PDF será gerado sem fotos.
          </p>
          {photos.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo) => (
                <label
                  key={photo.id}
                  className="cursor-pointer overflow-hidden rounded-md border bg-card"
                >
                  <img
                    src={photo.file_url}
                    alt={photo.description || "Foto da execução"}
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                  />
                  <span className="flex gap-2 p-3 text-xs">
                    <input
                      type="checkbox"
                      disabled={busy || (selected.length >= 20 && !selected.includes(photo.id))}
                      checked={selected.includes(photo.id)}
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked
                            ? [...ids, photo.id]
                            : ids.filter((id) => id !== photo.id),
                        )
                      }
                      aria-label={`Incluir foto ${photo.description || photo.id}`}
                    />
                    <span>
                      {fmtDate(photo.created_at)}
                      <span className="mt-1 block line-clamp-2">
                        {photo.description || "Sem legenda"}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-md border p-4 text-sm text-muted-foreground">
              Nenhuma foto vinculada a este orçamento. O relatório pode ser gerado normalmente.
            </p>
          )}
          {message && (
            <p role="status" className="rounded-md border bg-muted/30 p-3 text-sm">
              {message}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {selected.length} fotos selecionadas
            </span>
            <Button type="button" disabled={busy} onClick={() => void download()}>
              {busy ? "Gerando PDF…" : "Baixar PDF"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
