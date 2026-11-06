import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { startBackgroundRefresh, backgroundPaused, useBackgroundPause } from "./background-refresh";
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("consulta a cada minuto, limita foco repetido e remove os listeners ao sair", async () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const stop = startBackgroundRefresh(refresh);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(0);
  expect(refresh).toHaveBeenCalledTimes(1);
  stop();
  await vi.advanceTimersByTimeAsync(120_000);
  window.dispatchEvent(new Event("focus"));
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("não sobrepõe requisições nem consulta aba oculta ou offline", async () => {
  let finish!: () => void;
  const refresh = vi.fn().mockImplementation(
    () =>
      new Promise<void>((r) => {
        finish = r;
      }),
  );
  const stop = startBackgroundRefresh(refresh);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  finish();
  await vi.advanceTimersByTimeAsync(0);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  stop();
});
it("pausa durante edição e retoma depois sem perder a assinatura", async () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(({ dirty }) => useBackgroundPause(dirty), {
    initialProps: { dirty: true },
  });
  const stop = startBackgroundRefresh(refresh, () => !backgroundPaused());
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).not.toHaveBeenCalled();
  hook.rerender({ dirty: false });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  stop();
});
it("continua tentando depois de falha sem disparar chamadas em sequência", async () => {
  const refresh = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  const stop = startBackgroundRefresh(refresh);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
});
