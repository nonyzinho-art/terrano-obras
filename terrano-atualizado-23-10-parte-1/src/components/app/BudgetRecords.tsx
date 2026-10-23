import { useState } from "react";
import { Panel } from "./bits";
import { PhotoLightbox } from "./PhotoLightbox";
import { ReportDetailDialog } from "./ReportDetailDialog";
import { fmtDate } from "@/lib/format";
import type { DailyReport, Photo } from "@/lib/types";

export function BudgetRecords({ reports, photos }: { reports: DailyReport[]; photos: Photo[] }) {
  const [selected, setSelected] = useState<DailyReport | null>(null);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const orderedReports = [...reports].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-5">
      <Panel title="Diários vinculados">
        {orderedReports.length ? (
          <div className="divide-y">
            {orderedReports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setSelected(report)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-md px-3 py-4 text-left hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span>
                  <span className="block font-semibold text-primary">
                    {fmtDate(report.date)} · {report.responsible_user}
                  </span>
                  <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">
                    {report.observations || "Sem observações."}
                  </span>
                </span>
                <span className="rounded bg-success-soft px-3 py-1 text-xs text-primary">
                  {report.status === "rascunho" ? "Rascunho" : "Finalizado"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            Nenhum diário vinculado a este orçamento. No Telegram, escolha a obra e este orçamento
            antes de enviar o registro.
          </p>
        )}
      </Panel>
      <Panel title={`Fotos vinculadas (${photos.length})`}>
        {photos.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setPhotoIndex(index)}
                className="overflow-hidden rounded-md border bg-card text-left hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
                aria-label={`Abrir foto: ${photo.description || fmtDate(photo.created_at)}`}
              >
                <img
                  src={photo.file_url}
                  alt={photo.description || "Registro da execução"}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <span className="block p-3 text-xs text-muted-foreground">
                  {fmtDate(photo.created_at)}
                  {photo.description && (
                    <span className="mt-1 block line-clamp-2">{photo.description}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            Nenhuma foto vinculada a este orçamento.
          </p>
        )}
      </Panel>
      <ReportDetailDialog report={selected} onClose={() => setSelected(null)} />
      <PhotoLightbox photos={photos} index={photoIndex} onChange={setPhotoIndex} />
    </div>
  );
}
