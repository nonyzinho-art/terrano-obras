import type {
  Activity,
  Budget,
  BudgetItem,
  DailyReport,
  DailyReportItem,
  Issue,
  Photo,
  User,
  Work,
  WorkService,
  Weather,
} from "./types";
import p1 from "@/assets/obra-1.jpg";
import p2 from "@/assets/obra-2.jpg";
import p3 from "@/assets/obra-3.jpg";
import p4 from "@/assets/obra-4.jpg";

export const PHOTO_POOL = [p1, p2, p3, p4];
export const TODAY = "2026-10-05";

export const users: User[] = [
  { id: "u1", name: "Eng. Rafael Moura", role: "Engenheiro residente" },
  { id: "u2", name: "Eng. Camila Duarte", role: "Engenheira de obras" },
  { id: "u3", name: "Téc. Marcos Lima", role: "Técnico de edificações" },
];

export const works: Work[] = [
  {
    id: "brisas-do-sul",
    name: "Brisas do Sul",
    location: "Loteamento · Quadras 01–24",
    status: "atencao",
    start_date: "2026-03-02",
    end_date: "2027-02-26",
    planned_progress: 42,
    actual_progress: 38,
  },
  {
    id: "flor-da-terra",
    name: "Flor da Terra",
    location: "Condomínio horizontal · 312 lotes",
    status: "em_andamento",
    start_date: "2026-01-12",
    end_date: "2026-12-18",
    planned_progress: 61,
    actual_progress: 63,
  },
  {
    id: "campao",
    name: "Campão",
    location: "Infraestrutura viária · 4,2 km",
    status: "atrasada",
    start_date: "2025-11-03",
    end_date: "2026-11-30",
    planned_progress: 74,
    actual_progress: 58,
  },
  {
    id: "jardim-acacias",
    name: "Jardim das Acácias",
    location: "Loteamento · Quadras 01–12",
    status: "em_andamento",
    start_date: "2026-05-04",
    end_date: "2027-05-28",
    planned_progress: 22,
    actual_progress: 24,
  },
  {
    id: "dom-bosco",
    name: "Dom Bosco",
    location: "Loteamento · 248 lotes",
    status: "atencao",
    start_date: "2026-02-02",
    end_date: "2027-01-29",
    planned_progress: 55,
    actual_progress: 49,
  },
  {
    id: "silvania",
    name: "Silvânia",
    location: "Loteamento · 186 lotes",
    status: "concluida",
    start_date: "2025-02-10",
    end_date: "2026-08-28",
    planned_progress: 100,
    actual_progress: 100,
  },
];

type SvcTpl = {
  name: string;
  unit: string;
  qty: number;
  s: number;
  e: number;
  group: string;
  code: string;
  price: number;
};
// s/e = fraction of the work's duration where the service is planned
const SERVICE_TEMPLATES: SvcTpl[] = [
  {
    name: "Terraplenagem",
    unit: "m³",
    qty: 48000,
    s: 0,
    e: 0.25,
    group: "Terraplenagem",
    code: "01.01.01",
    price: 18.5,
  },
  {
    name: "Rede de drenagem",
    unit: "m",
    qty: 6200,
    s: 0.15,
    e: 0.5,
    group: "Drenagem",
    code: "04.01.01",
    price: 120,
  },
  {
    name: "Rede de água",
    unit: "m",
    qty: 8400,
    s: 0.25,
    e: 0.6,
    group: "Abastecimento de água",
    code: "05.02.01",
    price: 64,
  },
  {
    name: "Rede de esgoto",
    unit: "m",
    qty: 7600,
    s: 0.3,
    e: 0.68,
    group: "Esgotamento sanitário",
    code: "06.01.03",
    price: 96,
  },
  {
    name: "Meio-fio",
    unit: "m",
    qty: 11800,
    s: 0.5,
    e: 0.8,
    group: "Pavimentação",
    code: "07.03.01",
    price: 42,
  },
  {
    name: "Pavimentação",
    unit: "m²",
    qty: 52000,
    s: 0.62,
    e: 0.95,
    group: "Pavimentação",
    code: "07.01.02",
    price: 58,
  },
  {
    name: "Paisagismo",
    unit: "m²",
    qty: 9800,
    s: 0.85,
    e: 1,
    group: "Paisagismo",
    code: "09.01.01",
    price: 22,
  },
];

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

function serviceProgressFor(work: Work, i: number): number {
  if (work.status === "concluida") return 1;
  const t0 = Date.parse(work.start_date),
    t1 = Date.parse(work.end_date);
  const nowFrac = (Date.parse(TODAY) - t0) / (t1 - t0);
  const tpl = SERVICE_TEMPLATES[i]!;
  const plannedFrac = Math.min(1, Math.max(0, (nowFrac - tpl.s) / (tpl.e - tpl.s)));
  const ratio = work.actual_progress / Math.max(1, work.planned_progress);
  return Math.min(1, Math.max(0, plannedFrac * ratio));
}

export const services: WorkService[] = works.flatMap((w) => {
  const t0 = Date.parse(w.start_date),
    t1 = Date.parse(w.end_date);
  return SERVICE_TEMPLATES.map((tpl, i) => {
    let executed = Math.round(tpl.qty * serviceProgressFor(w, i));
    if (w.id === "brisas-do-sul" && tpl.name === "Rede de água") executed = 5100;
    return {
      id: `${w.id}-s${i}`,
      work_id: w.id,
      name: tpl.name,
      unit: tpl.unit,
      planned_start: iso(t0 + (t1 - t0) * tpl.s),
      planned_end: iso(t0 + (t1 - t0) * tpl.e),
      planned_quantity: tpl.qty,
      executed_quantity: executed,
    };
  });
});

// Commercial statuses/dates are illustrative and independent of execution.
export const BUDGET_FRONTS = [
  { id: "terraplenagem", name: "Terraplenagem" },
  { id: "drenagem", name: "Drenagem" },
  { id: "rede-de-agua", name: "Rede de Água" },
  { id: "rede-de-esgoto", name: "Rede de Esgoto" },
  { id: "meio-fio", name: "Meio-fio" },
  { id: "pavimentacao", name: "Pavimentação" },
  { id: "paisagismo", name: "Paisagismo" },
];
export const budgets: Budget[] = works.flatMap((w) =>
  BUDGET_FRONTS.map((f, i) => ({
    id: `${w.id}-${f.id}`,
    work_id: w.id,
    name: f.name,
    status: i < 2 ? "aprovado" : i < 5 ? "cotado" : "em_cotacao",
    updated_at: TODAY,
  })),
);
function budgetId(workId: string, group: string, description: string) {
  const front =
    description === "Meio-fio"
      ? "meio-fio"
      : (
          {
            Terraplenagem: "terraplenagem",
            Drenagem: "drenagem",
            "Abastecimento de água": "rede-de-agua",
            "Esgotamento sanitário": "rede-de-esgoto",
            Pavimentação: "pavimentacao",
            Paisagismo: "paisagismo",
          } as Record<string, string>
        )[group];
  if (!front) throw new Error(`Frente desconhecida: ${group}`);
  return `${workId}-${front}`;
}
export const budgetItems: BudgetItem[] = works.flatMap((w) => {
  const svc = services.filter((s) => s.work_id === w.id);
  const extra: Omit<BudgetItem, "budget_id" | "status">[] = [
    {
      id: `${w.id}-b-pead`,
      work_id: w.id,
      code: "04.01.02",
      group: "Drenagem",
      description: "Tubo PEAD Ø600",
      unit: "m",
      planned_quantity: 2450,
      executed_quantity:
        w.id === "brisas-do-sul" ? 420 : Math.round((2450 * w.actual_progress) / 100),
      unit_price: 120,
      total_price: 294000,
    },
    {
      id: `${w.id}-b-bl`,
      work_id: w.id,
      code: "04.02.01",
      group: "Drenagem",
      description: "Boca de lobo simples",
      unit: "un",
      planned_quantity: 86,
      executed_quantity: Math.round((86 * w.actual_progress) / 100),
      unit_price: 1850,
      total_price: 159100,
    },
    {
      id: `${w.id}-b-pv`,
      work_id: w.id,
      code: "06.02.01",
      group: "Esgotamento sanitário",
      description: "Poço de visita em concreto",
      unit: "un",
      planned_quantity: 142,
      executed_quantity: Math.round((142 * w.actual_progress) / 100),
      unit_price: 2400,
      total_price: 340800,
    },
    {
      id: `${w.id}-b-hd`,
      work_id: w.id,
      code: "05.03.01",
      group: "Abastecimento de água",
      description: "Hidrômetro e ligação predial",
      unit: "un",
      planned_quantity: 312,
      executed_quantity: Math.round((312 * w.actual_progress) / 120),
      unit_price: 380,
      total_price: 118560,
    },
  ];
  const main = svc.map((s, i) => {
    const tpl = SERVICE_TEMPLATES[i]!;
    return {
      id: `${w.id}-b${i}`,
      work_id: w.id,
      code: tpl.code,
      group: tpl.group,
      description: s.name,
      unit: s.unit,
      planned_quantity: s.planned_quantity,
      executed_quantity: s.executed_quantity,
      unit_price: tpl.price,
      total_price: tpl.price * s.planned_quantity,
    };
  });
  return [...main, ...extra]
    .map((item) => {
      const id = budgetId(item.work_id, item.group, item.description);
      return { ...item, budget_id: id, status: budgets.find((b) => b.id === id)!.status };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
});

const WEATHERS: Weather[] = [
  "Ensolarado",
  "Ensolarado",
  "Parcialmente nublado",
  "Nublado",
  "Chuvoso",
];
const EQUIP = [
  "Escavadeira hidráulica",
  "Retroescavadeira",
  "Rolo compactador",
  "Caminhão basculante",
  "Motoniveladora",
  "Vibroacabadora",
];
const DESCS: Record<string, string> = {
  Terraplenagem: "Corte e aterro compactado na via",
  "Rede de drenagem": "Assentamento de tubos de concreto e PEAD",
  "Rede de água": "Execução de rede de distribuição de água",
  "Rede de esgoto": "Assentamento de rede coletora de esgoto",
  "Meio-fio": "Execução de meio-fio pré-moldado",
  Pavimentação: "Aplicação de CBUQ e compactação",
  Paisagismo: "Plantio de grama e mudas no canteiro",
};

const PHOTO_CAPTIONS = [
  "Assentamento de tubulação na vala",
  "Frente de meio-fio — trecho principal",
  "Vala de drenagem aberta",
  "Compactação de base",
  "Vista geral da frente de serviço",
  "Pavimentação em execução",
];

// Deterministic pseudo-random
let seed = 7;
const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

export const dailyReports: DailyReport[] = [];
export const dailyReportItems: DailyReportItem[] = [];
export const photos: Photo[] = [];
export const issues: Issue[] = [];

const activeWorks = works.filter((w) => w.status !== "concluida");
for (let t = Date.parse("2026-08-31"); t <= Date.parse(TODAY); t += DAY) {
  const d = new Date(t);
  if (d.getUTCDay() === 0) continue;
  for (const w of activeWorks) {
    if (iso(t) !== TODAY && rnd() < 0.35) continue;
    if (iso(t) === TODAY && w.id === "jardim-acacias") continue;
    const id = `dr-${w.id}-${iso(t)}`;
    const user = users[Math.floor(rnd() * users.length)]!;
    const weather = WEATHERS[Math.floor(rnd() * WEATHERS.length)]!;
    dailyReports.push({
      id,
      work_id: w.id,
      date: iso(t),
      weather,
      responsible_user: user.name,
      workers_quantity: 12 + Math.floor(rnd() * 26),
      equipment: EQUIP.filter(() => rnd() < 0.4).slice(0, 3),
      observations:
        weather === "Chuvoso"
          ? "Chuva no período da tarde reduziu a produtividade da equipe."
          : "Frente de serviço operando normalmente, sem intercorrências.",
      status: iso(t) === TODAY && w.id === "campao" ? "rascunho" : "finalizado",
    });
    const svc = services.filter(
      (s) =>
        s.work_id === w.id && s.executed_quantity < s.planned_quantity && s.planned_start <= iso(t),
    );
    const pick = svc.slice(-3).filter(() => rnd() < 0.7);
    (pick.length ? pick : svc.slice(-1)).forEach((s, k) => {
      const qty =
        s.name === "Rede de água" && w.id === "brisas-do-sul" && iso(t) === TODAY
          ? 84
          : Math.round((s.unit === "m" ? 40 : 300) + rnd() * (s.unit === "m" ? 90 : 900));
      dailyReportItems.push({
        id: `${id}-i${k}`,
        daily_report_id: id,
        service_id: s.id,
        executed_quantity: qty,
        description:
          s.name === "Rede de água" && w.id === "brisas-do-sul" && iso(t) === TODAY
            ? "Execução de rede de distribuição de água próximo à quadra 18."
            : `${DESCS[s.name] ?? s.name} — quadra ${String(1 + Math.floor(rnd() * 24)).padStart(2, "0")}.`,
      });
    });
    const nPhotos = Math.floor(rnd() * 5);
    for (let k = 0; k < nPhotos; k++) {
      photos.push({
        id: `${id}-p${k}`,
        daily_report_id: id,
        file_url: PHOTO_POOL[(k + Math.floor(rnd() * 4)) % 4]!,
        description: PHOTO_CAPTIONS[Math.floor(rnd() * PHOTO_CAPTIONS.length)]!,
        created_at: `${iso(t)}T15:${10 + k}:00`,
      });
    }
    if (rnd() < 0.18) {
      issues.push({
        id: `${id}-iss`,
        work_id: w.id,
        daily_report_id: id,
        description: [
          "Interferência com rede elétrica existente na quadra 07",
          "Aguardando liberação de licença ambiental do trecho B",
          "Falta de tubos Ø400 no canteiro",
          "Reparo necessário em PV danificado",
          "Retrabalho de compactação no trecho 3",
        ][Math.floor(rnd() * 5)]!,
        status: rnd() < 0.55 ? "aberta" : "concluida",
        created_at: iso(t),
      });
    }
  }
}

// Reference record from the spec (Brisas do Sul, 05/10/2026)
{
  const id = `dr-brisas-do-sul-${TODAY}`;
  const r = dailyReports.find((x) => x.id === id)!;
  Object.assign(r, {
    responsible_user: "Eng. Lucas de Castro",
    weather: "Ensolarado",
    workers_quantity: 23,
    equipment: [
      "Escavadeira hidráulica",
      "Retroescavadeira",
      "Rolo compactador",
      "Caminhão basculante",
      "Caminhão pipa",
      "Minicarregadeira",
    ],
    equipment_quantity: 6,
    observations: "Execução de rede próxima à quadra 18 e avanço no trecho principal de meio-fio.",
  });
  for (let i = dailyReportItems.length - 1; i >= 0; i--)
    if (dailyReportItems[i]!.daily_report_id === id) dailyReportItems.splice(i, 1);
  dailyReportItems.push(
    {
      id: `${id}-i0`,
      daily_report_id: id,
      service_id: "brisas-do-sul-s2",
      executed_quantity: 84,
      description: "Execução de rede de distribuição de água próximo à quadra 18.",
    },
    {
      id: `${id}-i1`,
      daily_report_id: id,
      service_id: "brisas-do-sul-s4",
      executed_quantity: 210,
      description: "Meio-fio pré-moldado no trecho principal.",
    },
  );
  for (let i = issues.length - 1; i >= 0; i--)
    if (issues[i]!.daily_report_id === id) issues.splice(i, 1);
  issues.push({
    id: `${id}-iss`,
    work_id: "brisas-do-sul",
    daily_report_id: id,
    description: "Aguardar liberação de material para drenagem no setor B",
    status: "aberta",
    created_at: TODAY,
  });
  if (!photos.some((p) => p.daily_report_id === id))
    PHOTO_POOL.forEach((u, k) =>
      photos.push({
        id: `${id}-p${k}`,
        daily_report_id: id,
        file_url: u,
        description: PHOTO_CAPTIONS[k]!,
        created_at: `${TODAY}T15:0${k}:00`,
      }),
    );
}

export const activities: Activity[] = [
  {
    id: "a1",
    work_id: "brisas-do-sul",
    text: "Eng. Lucas de Castro registrou 84 m de rede de água",
    at: `${TODAY}T16:42:00`,
    kind: "diario",
  },
  {
    id: "a2",
    work_id: "flor-da-terra",
    text: "Foram adicionadas 4 fotos ao diário",
    at: `${TODAY}T15:18:00`,
    kind: "foto",
  },
  {
    id: "a3",
    work_id: "campao",
    text: "Serviço de meio-fio atualizado para 72%",
    at: `${TODAY}T14:05:00`,
    kind: "servico",
  },
  {
    id: "a4",
    work_id: "brisas-do-sul",
    text: "Pendência concluída: reparo em PV da quadra 11",
    at: `${TODAY}T11:30:00`,
    kind: "pendencia",
  },
  {
    id: "a5",
    work_id: "jardim-acacias",
    text: "Eng. Camila Duarte registrou 1.240 m³ de terraplenagem",
    at: "2026-10-03T17:10:00",
    kind: "diario",
  },
  {
    id: "a6",
    work_id: "campao",
    text: "Nova pendência: falta de tubos Ø400 no canteiro",
    at: "2026-10-03T09:22:00",
    kind: "pendencia",
  },
  {
    id: "a8",
    work_id: "dom-bosco",
    text: "Nova pendência: interferência com rede elétrica na quadra 07",
    at: "2026-10-05T10:12:00",
    kind: "pendencia",
  },
  {
    id: "a9",
    work_id: "dom-bosco",
    text: "Eng. Camila Duarte registrou 156 m de rede de esgoto",
    at: "2026-10-04T16:20:00",
    kind: "diario",
  },
  {
    id: "a10",
    work_id: "brisas-do-sul",
    text: "Foram adicionadas 6 fotos da drenagem — setor B",
    at: "2026-10-02T14:40:00",
    kind: "foto",
  },
  {
    id: "a7",
    work_id: "flor-da-terra",
    text: "Pavimentação atualizada: 2.860 m² executados",
    at: "2026-10-02T16:00:00",
    kind: "servico",
  },
];
