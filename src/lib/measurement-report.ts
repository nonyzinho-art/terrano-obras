import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { fmtBRL, fmtDate, fmtNum } from "./format";
import type { Budget, BudgetItem, BudgetMeasurement, BudgetMeasurementItem, Work } from "./types";

export interface ReportAuthors {
  author_name: string;
  author_email: string;
  approver_name: string | null;
  approver_email: string | null;
}
export interface ReportAttachment {
  data: string;
  width: number;
  height: number;
  description: string;
  date: string;
}
export interface MeasurementReportInput {
  work: Work;
  budget: Budget;
  measurement: BudgetMeasurement;
  items: BudgetItem[];
  lines: BudgetMeasurementItem[];
  previous: Map<string, number>;
  authors: ReportAuthors;
  photos: ReportAttachment[];
  issuedAt: string;
}
const text = (value: string) =>
  value
    .normalize("NFC")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\xff\n\r]/g, "");
const money = (value: number) => text(fmtBRL(value));
const number = (value: number) => text(fmtNum(value, 4));
const labels = {
  rascunho: "RASCUNHO - NÃO APROVADA",
  aprovada: "APROVADA",
  cancelada: "CANCELADA",
  substituida: "SUBSTITUÍDA POR REVISÃO",
};

export function buildMeasurementReport(input: MeasurementReportInput) {
  const { work, budget, measurement: m, authors } = input;
  if (m.budget_id !== budget.id || m.work_id !== work.id || budget.work_id !== work.id)
    throw new Error("A medição não pertence ao orçamento selecionado.");
  if (
    input.lines.some(
      (line) =>
        line.measurement_id !== m.id || line.budget_id !== budget.id || line.work_id !== work.id,
    )
  )
    throw new Error("Os itens não pertencem à medição selecionada.");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  pdf.setProperties({
    title: text(`Medição - ${work.name} - ${budget.name}`),
    author: "Terrano Obras",
    subject: text(`Período ${fmtDate(m.period_start)} a ${fmtDate(m.period_end)}`),
  });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = width - margin * 2;
  const green: [number, number, number] = [27, 67, 50];
  const common = {
    margin: { left: margin, right: margin, top: 24, bottom: 16 },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2.5, overflow: "linebreak" as const },
    headStyles: { fillColor: green },
    theme: "striped" as const,
  };
  const identity = (name: string | null, email: string | null) =>
    name ? text(name + (email && name !== email ? ` (${email})` : "")) : "Não aprovada";
  autoTable(pdf, {
    ...common,
    startY: 26,
    theme: "plain",
    styles: { ...common.styles, cellPadding: 1.6 },
    columnStyles: { 0: { cellWidth: 32, fontStyle: "bold" }, 1: { cellWidth: contentWidth - 32 } },
    body: [
      ["Obra", text(`${work.name} - ${work.location}`)],
      ["Orçamento", text(`${budget.name} - revisão ${budget.revision ?? 1}`)],
      ["Período", `${fmtDate(m.period_start)} a ${fmtDate(m.period_end)}`],
      ["Identificação", m.id],
      ["Elaborada por", identity(authors.author_name, authors.author_email)],
      [
        "Aprovação",
        m.approved_at
          ? `${identity(authors.approver_name, authors.approver_email)} - ${fmtDate(m.approved_at)}`
          : "Pendente - não compõe o executado aprovado",
      ],
      ...(m.replaces_id
        ? [
            ["Revisa medição", m.replaces_id],
            ["Justificativa", text(m.revision_reason ?? "")],
          ]
        : []),
    ],
  });
  let y = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  const rows = [...input.lines]
    .sort((a, b) => {
      const aItem = input.items.find((i) => i.id === a.budget_item_id);
      const bItem = input.items.find((i) => i.id === b.budget_item_id);
      return (aItem?.code ?? a.budget_item_id).localeCompare(
        bItem?.code ?? b.budget_item_id,
        "en",
        { numeric: true },
      );
    })
    .map((line) => {
      const item = input.items.find((i) => i.id === line.budget_item_id);
      if (!item) throw new Error("Não foi possível localizar um dos itens do orçamento.");
      const previous = input.previous.get(item.id) ?? 0;
      const accumulated = previous + Number(line.quantity);
      return [
        text(item.code),
        text(item.description),
        text(item.unit),
        number(line.planned_quantity),
        number(previous),
        number(line.quantity),
        number(accumulated),
        number(Math.max(0, line.planned_quantity - accumulated)),
        money(line.unit_price),
        money(Math.round(line.quantity * line.unit_price * 100) / 100),
      ];
    });
  const total =
    input.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unit_price * 100), 0) /
    100;
  autoTable(pdf, {
    ...common,
    startY: y,
    head: [
      [
        "Código",
        "Serviço / Insumo",
        "Un.",
        "Orçado",
        "Anterior",
        "No período",
        "Acumulado",
        "Saldo",
        "Preço unit.",
        "Valor período",
      ],
    ],
    body: rows,
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 76 },
      2: { cellWidth: 10 },
      ...Object.fromEntries(
        [3, 4, 5, 6, 7].map((key) => [key, { cellWidth: 22, halign: "right" }]),
      ),
      8: { cellWidth: 28, halign: "right" },
      9: { cellWidth: 31, halign: "right" },
    },
    foot: [
      [
        {
          content: "TOTAL DA MEDIÇÃO - EXECUÇÃO VALORIZADA",
          colSpan: 9,
          styles: { halign: "right" },
        },
        { content: money(total), styles: { halign: "right" } },
      ],
    ],
    showFoot: "lastPage",
    footStyles: { fillColor: [224, 237, 228], textColor: green },
    rowPageBreak: "avoid",
  });
  y = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  autoTable(pdf, {
    ...common,
    startY: y,
    theme: "plain",
    body: [
      [
        text(
          "Valores calculados pelos preços orçados, sem representar pagamentos ou custo real. Anterior e saldo usam as medições atualmente aprovadas anteriores ao período, além da quantidade desta versão.",
        ),
      ],
      ...(m.status === "substituida"
        ? [[text("VERSÃO HISTÓRICA SUBSTITUÍDA: esta medição não compõe mais o executado atual.")]]
        : []),
      ...(m.notes ? [[text(`Observações: ${m.notes}`)]] : []),
    ],
  });
  for (const [index, photo] of input.photos.entries()) {
    pdf.addPage();
    pdf.setFontSize(12);
    pdf.setTextColor(...green);
    pdf.text(`Registro fotográfico ${index + 1} de ${input.photos.length}`, margin, 30);
    pdf.setTextColor(55);
    pdf.setFontSize(9);
    pdf.text(text(`Data do registro: ${fmtDate(photo.date)}`), margin, 37);
    const maxW = contentWidth;
    const maxH = height - 88;
    const scale = Math.min(maxW / photo.width, maxH / photo.height);
    const w = photo.width * scale,
      h = photo.height * scale;
    pdf.addImage(photo.data, "JPEG", margin + (maxW - w) / 2, 43, w, h);
    const caption = pdf.splitTextToSize(
      text(photo.description || "Registro da execução"),
      contentWidth,
    );
    autoTable(pdf, { ...common, startY: 48 + h, theme: "plain", body: [[caption.join("\n")]] });
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFillColor(...green);
    pdf.rect(0, 0, width, 20, "F");
    pdf.setTextColor(255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("TERRANO OBRAS", margin, 9);
    pdf.setFontSize(9);
    pdf.text("RELATÓRIO DE MEDIÇÃO", width - margin, 8, { align: "right" });
    pdf.setFontSize(8);
    pdf.text(text(labels[m.status]), width - margin, 14, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(85);
    pdf.text(
      text(`Emitido em ${input.issuedAt} | Aprovação registrada no sistema`),
      margin,
      height - 8,
    );
    pdf.text(`Página ${page} de ${pages}`, width - margin, height - 8, { align: "right" });
  }
  return pdf;
}
