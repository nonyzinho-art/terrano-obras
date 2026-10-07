import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format";
import { getReports, getWork } from "@/lib/repository";
import type { Photo } from "@/lib/types";

export function PhotoLightbox({ photos, index, onChange }: { photos: Photo[]; index: number | null; onChange: (i: number | null) => void }) {
  const p = index !== null ? photos[index] : undefined;
  const report = p ? getReports().find((r) => r.id === p.daily_report_id) : undefined;
  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && onChange(null)}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        {p && (
          <>
            <div className="relative bg-foreground">
              <img src={p.file_url} alt={p.description} className="max-h-[70vh] w-full object-contain" />
              {index! > 0 && <button onClick={() => onChange(index! - 1)} className="absolute left-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-card/90" aria-label="Anterior"><ChevronLeft className="size-5" /></button>}
              {index! < photos.length - 1 && <button onClick={() => onChange(index! + 1)} className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-card/90" aria-label="Próxima"><ChevronRight className="size-5" /></button>}
            </div>
            <div className="flex items-center justify-between gap-4 p-4">
              <div>
                <DialogTitle className="text-sm">{p.description || "Foto da obra"}</DialogTitle>
                {report && <p className="mt-0.5 text-xs text-muted-foreground">Diário de {fmtDate(report.date)} · {getWork(report.work_id)?.name} · {report.responsible_user}</p>}
              </div>
              <span className="num text-xs text-muted-foreground">{index! + 1} / {photos.length}</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
