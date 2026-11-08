import { describe, expect, it } from "vitest";
import {
  BACK,
  CONFIRM,
  MENU,
  WEATHER_BUTTONS,
  isBack,
  isConfirm,
  menuAction,
  missing,
  parseEquipment,
  parseWeather,
  parseWorkers,
  savedText,
  summaryText,
  type Summary,
} from "../../supabase/functions/telegram-bot/diary.ts";

const base: Summary = {
  status: "rascunho",
  weather: "Chuvoso",
  workers: 12,
  equipment: ["Retroescavadeira (2)", "Caminhão basculante"],
  equipment_quantity: 3,
  has_observations: true,
  photos: 4,
  issues: 1,
  items: 0,
};

describe("diário pelo Telegram", () => {
  it("reconhece os botões do menu, mesmo digitados sem emoji", () => {
    expect(menuAction(MENU.weather)).toBe("weather");
    expect(menuAction("efetivo")).toBe("workers");
    expect(menuAction("Equipamentos")).toBe("equipment");
    expect(menuAction(MENU.finalize)).toBe("finalize");
    expect(menuAction("/concluir")).toBe("later");
    expect(menuAction("concreto lançado no trecho 3")).toBeUndefined();
    expect(isBack(BACK)).toBe(true);
    expect(isConfirm(CONFIRM)).toBe(true);
    expect(isConfirm("sim")).toBe(false);
  });

  it("lê clima e efetivo", () => {
    for (const [button, weather] of WEATHER_BUTTONS) expect(parseWeather(button)).toBe(weather);
    expect(parseWeather("parcialmente nublado")).toBe("Parcialmente nublado");
    expect(parseWeather("granizo")).toBeUndefined();
    expect(parseWorkers("12")).toBe(12);
    expect(parseWorkers("12 pessoas")).toBe(12);
    expect(parseWorkers("0")).toBe(0);
    expect(parseWorkers("doze")).toBeUndefined();
    expect(parseWorkers("99999")).toBeUndefined();
  });

  it("lê a lista de equipamentos com quantidades", () => {
    expect(parseEquipment("2 retroescavadeiras, caminhão basculante x3; rolo compactador")).toEqual(
      {
        items: ["retroescavadeiras (2)", "caminhão basculante (3)", "rolo compactador"],
        quantity: 6,
      },
    );
    expect(parseEquipment("Escavadeira (2)\nPá carregadeira")).toEqual({
      items: ["Escavadeira (2)", "Pá carregadeira"],
      quantity: 3,
    });
    expect(parseEquipment("nenhum")).toEqual({ items: [], quantity: 0 });
    expect(parseEquipment("0")).toEqual({ items: [], quantity: 0 });
    expect(parseEquipment("3")).toBeUndefined();
  });

  it("monta o resumo e avisa o que falta antes de finalizar", () => {
    const text = summaryText(base, "Brisas do Sul → DRENAGEM", "08/11/2026");
    expect(text).toContain("Brisas do Sul → DRENAGEM — 08/11/2026 (rascunho)");
    expect(text).toContain("Efetivo: 12 pessoa(s)");
    expect(text).toContain("Retroescavadeira (2), Caminhão basculante (3)");
    expect(text).toContain("Fotos: 4 · Ocorrências: 1 · Observações: sim");
    expect(summaryText(null, "X", "08/11/2026")).toContain("Ainda não há nada registrado");
    expect(missing(base)).toEqual([]);
    expect(missing({ ...base, workers: 0, photos: 0 })).toEqual(["efetivo", "fotos"]);
    expect(savedText("workers", base)).toBe("Efetivo salvo: 12 pessoa(s).");
    expect(savedText("equipment", { ...base, equipment: [], equipment_quantity: 0 })).toBe(
      "Sem equipamentos hoje.",
    );
  });
});
