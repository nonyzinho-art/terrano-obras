import { useEffect } from "react";

const editors = new Set<symbol>();
export function useBackgroundPause(paused: boolean) {
  useEffect(() => {
    if (!paused) return;
    const token = Symbol();
    editors.add(token);
    return () => {
      editors.delete(token);
    };
  }, [paused]);
}
export function backgroundPaused() {
  return (
    editors.size > 0 ||
    !!document.querySelector('[role="dialog"][data-state="open"]') ||
    !!document.activeElement?.closest('input, textarea, select, [contenteditable="true"]')
  );
}

/** One request at a time; focus events are throttled and hidden/offline tabs do no work. */
export function startBackgroundRefresh(refresh: () => Promise<void>, canRefresh = () => true) {
  let live = true;
  let running = false;
  let lastAttempt = Date.now();
  const attempt = async () => {
    if (
      !live ||
      running ||
      document.visibilityState === "hidden" ||
      !navigator.onLine ||
      Date.now() - lastAttempt < 15_000 ||
      !canRefresh()
    )
      return;
    running = true;
    lastAttempt = Date.now();
    try {
      await refresh();
    } finally {
      running = false;
    }
  };
  const tick = () => {
    void attempt().catch(() => {
      /* Caller retains data and reports status. */
    });
  };
  const timer = window.setInterval(tick, 60_000);
  window.addEventListener("focus", tick);
  window.addEventListener("online", tick);
  document.addEventListener("visibilitychange", tick);
  return () => {
    live = false;
    clearInterval(timer);
    window.removeEventListener("focus", tick);
    window.removeEventListener("online", tick);
    document.removeEventListener("visibilitychange", tick);
  };
}
