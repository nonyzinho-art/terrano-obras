// Textos, botões e leitura das respostas do diário pelo Telegram (sem dependências,
// usado pelo bot no Deno e pelos testes no Vitest).

export type Weather = "Ensolarado" | "Parcialmente nublado" | "Nublado" | "Chuvoso";
export type Field = "weather" | "workers" | "equipment" | "issue" | "finalize";
export type Summary = {
  status: string;
  weather: string;
  workers: number;
  equipment: string[];
  equipment_quantity: number;
  has_observations: boolean;
  photos: number;
  issues: number;
  items: number;
};

export const WEATHER_BUTTONS: [string, Weather][] = [
  ["☀️ Ensolarado", "Ensolarado"],
  ["⛅ Parcialmente nublado", "Parcialmente nublado"],
  ["☁️ Nublado", "Nublado"],
  ["🌧️ Chuvoso", "Chuvoso"],
];

export const MENU = {
  photos: "📷 Fotos",
  weather: "☀️ Clima",
  workers: "👷 Efetivo",
  equipment: "🚜 Equipamentos",
  issue: "⚠️ Ocorrência",
  summary: "📋 Resumo",
  finalize: "✅ Finalizar diário",
  later: "⏸️ Terminar depois",
} as const;
export type MenuAction = keyof typeof MENU;
export const BACK = "↩️ Voltar";
export const CONFIRM = "✅ Confirmar finalização";

export const menuKeyboard = {
  keyboard: [
    [{ text: MENU.photos }],
    [{ text: MENU.weather }, { text: MENU.workers }],
    [{ text: MENU.equipment }, { text: MENU.issue }],
    [{ text: MENU.summary }, { text: MENU.finalize }],
    [{ text: MENU.later }],
  ],
  resize_keyboard: true,
};
export const backKeyboard = { keyboard: [[{ text: BACK }]], resize_keyboard: true };
export const weatherKeyboard = {
  keyboard: [
    [{ text: WEATHER_BUTTONS[0]![0] }, { text: WEATHER_BUTTONS[1]![0] }],
    [{ text: WEATHER_BUTTONS[2]![0] }, { text: WEATHER_BUTTONS[3]![0] }],
    [{ text: BACK }],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
};
export const confirmKeyboard = {
  keyboard: [[{ text: CONFIRM }], [{ text: BACK }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s,;.\n-]/gu, "")
    .trim()
    .toLowerCase();

export function menuAction(text: string): MenuAction | undefined {
  const t = plain(text);
  if (!t) return undefined;
  const found = (Object.keys(MENU) as MenuAction[]).find((k) => plain(MENU[k]) === t);
  if (found) return found;
  if (/^\/concluir(@kanteiro_bot)?$/i.test(text.trim())) return "later";
  if (/^\/resumo(@kanteiro_bot)?$/i.test(text.trim())) return "summary";
  if (/^\/finalizar(@kanteiro_bot)?$/i.test(text.trim())) return "finalize";
  return undefined;
}

export const isBack = (text: string) => plain(text) === plain(BACK) || /^voltar$/i.test(text.trim());
export const isConfirm = (text: string) => plain(text) === plain(CONFIRM);

export function parseWeather(text: string): Weather | undefined {
  const t = plain(text);
  return WEATHER_BUTTONS.find(([, w]) => plain(w) === t)?.[1] ?? (t === "sol" ? "Ensolarado" : t === "chuva" ? "Chuvoso" : undefined);
}

/** "12", "12 pessoas", "efetivo 12" → 12. */
export function parseWorkers(text: string): number | undefined {
  const match = plain(text).match(/^(?:efetivo\s*)?(\d{1,4})(?:\s*(?:pessoas?|funcionarios?|colaboradores?|trabalhadores?))?$/);
  if (!match) return undefined;
  const n = Number(match[1]);
  return n <= 5000 ? n : undefined;
}

/**
 * "2 retroescavadeiras, caminhão basculante x3; rolo" → itens com quantidade e o total.
 * "0" ou "nenhum" limpa a lista.
 */
export function parseEquipment(text: string): { items: string[]; quantity: number } | undefined {
  const raw = text.trim();
  if (/^(0|nenhum|nenhuma|sem equipamentos?)$/i.test(plain(raw))) return { items: [], quantity: 0 };
  const parts = raw
    .split(/[,;\n]+/)
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (!parts.length || parts.length > 50) return undefined;
  let quantity = 0;
  const items: string[] = [];
  for (const part of parts) {
    const lead = part.match(/^(\d{1,3})\s*(?:x\s*)?(.+)$/i);
    const tail = part.match(/^(.+?)\s*(?:x\s*|\()(\d{1,3})\)?$/i);
    const [count, name] = lead
      ? [Number(lead[1]), lead[2]!]
      : tail
        ? [Number(tail[2]), tail[1]!]
        : [1, part];
    const clean = name.trim().slice(0, 100);
    if (!clean || count < 1 || /^\d+$/.test(clean)) return undefined;
    quantity += count;
    items.push(count > 1 ? `${clean} (${count})` : clean);
  }
  return quantity <= 5000 ? { items, quantity } : undefined;
}

export const PHOTO_HELP =
  "📷 Para enviar fotos: toque no clipe 📎 ao lado da caixa de mensagem, escolha Galeria (ou Câmera) e selecione uma ou várias fotos de uma vez. Se quiser, escreva uma legenda antes de enviar.\n\nAs fotos entram direto no diário de hoje. Envie como foto, não como arquivo.";

export const QUESTIONS: Record<Exclude<Field, "finalize">, string> = {
  weather: "Como está o tempo hoje na obra?",
  workers: "Quantas pessoas trabalharam hoje na obra? Responda só com o número (ex.: 12).",
  equipment:
    "Quais equipamentos trabalharam hoje? Separe por vírgula, com a quantidade na frente.\nEx.: 2 retroescavadeiras, 1 caminhão basculante, rolo compactador\nEnvie 0 se não houve equipamento.",
  issue:
    "Descreva a ocorrência (atraso, chuva, falta de material, acidente, visita…). Ela entra como pendência do diário.",
};

export const INVALID: Record<Exclude<Field, "finalize">, string> = {
  weather: "Escolha o clima pelos botões.",
  workers: "Não entendi o efetivo. Responda só com o número de pessoas, ex.: 12.",
  equipment: "Não entendi a lista. Ex.: 2 retroescavadeiras, 1 caminhão basculante (ou 0 se nenhum).",
  issue: "Escreva a ocorrência em texto (até 2.000 caracteres).",
};

export function savedText(field: Field, s: Summary) {
  if (field === "weather") return `Clima salvo: ${s.weather}.`;
  if (field === "workers") return `Efetivo salvo: ${s.workers} pessoa(s).`;
  if (field === "equipment")
    return s.equipment.length
      ? `Equipamentos salvos: ${s.equipment.join(", ")} — ${s.equipment_quantity} no total.`
      : "Sem equipamentos hoje.";
  if (field === "issue") return `Ocorrência registrada (${s.issues} no diário de hoje).`;
  return "Diário finalizado.";
}

export function summaryText(s: Summary | null, place: string, date: string) {
  if (!s) return `📋 ${place} — ${date}\nAinda não há nada registrado hoje.`;
  return [
    `📋 ${place} — ${date}${s.status === "finalizado" ? " (finalizado)" : " (rascunho)"}`,
    `Clima: ${s.weather}`,
    `Efetivo: ${s.workers ? `${s.workers} pessoa(s)` : "não informado"}`,
    `Equipamentos: ${s.equipment.length ? `${s.equipment.join(", ")} (${s.equipment_quantity})` : "nenhum informado"}`,
    `Fotos: ${s.photos} · Ocorrências: ${s.issues} · Observações: ${s.has_observations ? "sim" : "não"}`,
  ].join("\n");
}

/** Pontos que a coordenação costuma cobrar antes de finalizar. */
export function missing(s: Summary | null) {
  if (!s) return ["fotos ou informações"];
  const list: string[] = [];
  if (!s.workers) list.push("efetivo");
  if (!s.photos) list.push("fotos");
  return list;
}

export type ReminderWork = { work: string; draft: boolean; photos: number };
/** Lembrete das 17:30 para quem ainda não finalizou o diário das suas obras. */
export function reminderText(date: string, works: ReminderWork[]) {
  const lines = works.map((w) =>
    w.draft
      ? `• ${w.work}: rascunho aberto${w.photos ? ` (${w.photos} foto(s))` : ""} — falta finalizar`
      : `• ${w.work}: ainda sem diário hoje`,
  );
  return [
    `⏰ Lembrete do diário — ${date}`,
    "",
    "Ainda falta registrar:",
    ...lines,
    "",
    "Toque em /diario para registrar agora. Se a obra não trabalhou hoje, registre isso numa observação e finalize.",
  ].join("\n");
}
export const reminderKeyboard = {
  keyboard: [[{ text: "/diario" }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};
