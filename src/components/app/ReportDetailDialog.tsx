import { useState } from "react";
import { PhotoLightbox } from "./PhotoLightbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getReportIssues, getReportItems, getReportPhotos, getService, getWork } from "@/lib/repository";
import { fmtDate, fmtNum } from "@/lib/format";
import type { DailyReport } from "@/lib/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="eyebrow">{label}</div><div className="mt-1 text-sm">{children}</div></div>;
}

export function ReportDetailDialog({ report, onClose }: { report: DailyReport | null; onClose: () => void }) {
  return (
    <Dialog open={!!report} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {report && <ReportBody report={report} />}
      </DialogContent>
    </Dialog>
  );
}

export function ReportBody({ report }: { report: DailyReport }) {
  const items = getReportItems(report.id);
  const photos = getReportPhotos(report.id);
  const issues = getReportIssues(report.id);
  const [lb, setLb] = useState<number | null>(null);
  return (
    <>
      <DialogHeader>
        <div className="eyebrow">Diário de obra · {report.status === "rascunho" ? "Rascunho" : "Finalizado"}</div>
        <DialogTitle className="text-lg">{getWork(report.work_id)?.name} — {fmtDate(report.date)}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4 rounded-md border bg-muted/40 p-4 sm:grid-cols-4">
        <Field label="Clima">{report.weather}</Field>
        <Field label="Responsável">{report.responsible_user}</Field>
        <Field label="Trabalhadores"><span className="num">{report.workers_quantity}</span></Field>
        <Field label="Equipamentos"><span className="num">{report.equipment_quantity ?? report.equipment.length}</span>{report.equipment.length > 0 && <span className="block text-xs text-muted-foreground">{report.equipment.join(", ")}</span>}</Field>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Serviços executados</h3>
        <div className="divide-y rounded-md border">
          {items.map((it) => {
            const s = getService(it.service_id);
            return (
              <div key={it.id} className="flex items-start justify-between gap-4 p-3">
                <div><div className="text-sm font-medium">{s?.name}</div><div className="text-xs text-muted-foreground">{it.description}</div></div>
                <div className="num shrink-0 text-sm font-semibold text-primary">{fmtNum(it.executed_quantity)} {s?.unit}</div>
              </div>
            );
          })}
        </div>
      </div>
      <Field label="Observações gerais">{report.observations || "—"}</Field>
      <div>
        <div className="eyebrow mb-1">Pendências</div>
        {issues.length ? (
          <ul className="space-y-1">{issues.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              <span className={`size-1.5 rounded-full ${i.status === "aberta" ? "bg-warning" : "bg-success"}`} />{i.description}
              <span className="text-xs text-muted-foreground">({i.status === "aberta" ? "aberta" : "concluída"})</span>
            </li>))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Nenhuma pendência registrada.</p>}
      </div>
      <div>
        <div className="eyebrow mb-2">Fotos ({photos.length})</div>
        {photos.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p, i) => <button key={p.id} onClick={() => setLb(i)} className="overflow-hidden rounded-sm"><img src={p.file_url} alt={p.description || "Foto da obra"} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform hover:scale-105" /></button>)}
          </div>
        ) : <p className="text-sm text-muted-foreground">Sem fotos.</p>}
      </div>
      <PhotoLightbox photos={photos} index={lb} onChange={setLb} />
    </>
  );
}
