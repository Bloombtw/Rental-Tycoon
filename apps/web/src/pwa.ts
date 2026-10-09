import { registerSW } from "virtual:pwa-register";

/** How often a running game checks for a new version. */
const UPDATE_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Registers the service worker and keeps the installed PWA up to date. An iPhone home-screen app
 * only looks for a new version on a cold start, so a game reopened from the background kept the old
 * build for days: check again whenever the game comes back to the foreground and every 30 minutes.
 * With `registerType: "autoUpdate"` a new version activates and reloads the page; the autosave
 * flushes on `pagehide`, so nothing is lost.
 */
export function registerPwa(): void {
  if (!("serviceWorker" in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = (): void => {
        if (navigator.onLine) void registration.update().catch(() => undefined);
      };
      setInterval(check, UPDATE_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });
}
