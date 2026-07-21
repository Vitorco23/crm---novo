// Guarded service worker registration.
// - Never registers in dev, Lovable preview, iframes, or when ?sw=off is set.
// - Unregisters any matching stale registrations in refused contexts.
// - Uses vite-plugin-pwa generated /sw.js (autoUpdate).
// - Forces update checks on every load and auto-reloads when a new SW takes control,
//   so installed PWAs pick up new versions without a manual reinstall.

const SW_PATH = "/sw.js";

function isRefusedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  try {
    if (window.top !== window.self) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          return url.endsWith(SW_PATH);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

export function registerPWA() {
  if (!("serviceWorker" in navigator)) return;
  if (isRefusedContext()) {
    void unregisterMatching();
    return;
  }

  // Reload once when a new SW takes control (autoUpdate + skipWaiting/clientsClaim).
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      // updateViaCache: "none" bypasses the browser's 24h HTTP cache for the SW script,
      // so installed PWAs re-check the SW file on every load.
      .register(SW_PATH, { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        // Kick off an immediate update check, then poll every 30 min while the app is open.
        reg.update().catch(() => {});
        setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
      })
      .catch(() => {
        /* ignore */
      });
  });

  // Also check for updates whenever the app comes back to the foreground.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    navigator.serviceWorker.getRegistration(SW_PATH).then((reg) => {
      reg?.update().catch(() => {});
    });
  });
}
