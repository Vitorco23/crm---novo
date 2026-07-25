// Guarded service worker registration.
// - Never registers in dev, Lovable preview, iframes, or when ?sw=off is set.
// - Unregisters any matching stale registrations in refused contexts.
// - Auto-migrates on new build: unregisters stale SW + clears Workbox caches
//   so devices stuck on old versions self-heal on first load after deploy.
// - Uses vite-plugin-pwa generated /sw.js (autoUpdate).

declare const __APP_BUILD_ID__: string;

const SW_PATH = "/sw.js";
const BUILD_ID_STORAGE_KEY = "p21_app_build_id";
const CURRENT_BUILD_ID =
  typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev";

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

// Only touch caches created by this app's Workbox config. Never wipe
// Firebase Messaging, OneSignal, or other integrations' caches.
function isOwnWorkboxCache(name: string): boolean {
  return (
    name.startsWith("workbox-precache-v") ||
    name.startsWith("workbox-runtime") ||
    name === "html-navigations" ||
    name === "static-assets" ||
    name === "image-assets"
  );
}

async function clearOwnCaches() {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.allSettled(
      names.filter(isOwnWorkboxCache).map((n) => caches.delete(n)),
    );
  } catch {
    /* ignore */
  }
}

/** Force-clean SW + own caches, then hard reload. Exposed for manual button. */
export async function forceUpdatePWA() {
  await unregisterMatching();
  await clearOwnCaches();
  try {
    localStorage.removeItem(BUILD_ID_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

async function runBuildMigrationIfNeeded() {
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(BUILD_ID_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (previous === CURRENT_BUILD_ID) return;
  // New build detected on this device — evict stale SW + caches once.
  await unregisterMatching();
  await clearOwnCaches();
  try {
    localStorage.setItem(BUILD_ID_STORAGE_KEY, CURRENT_BUILD_ID);
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

  window.addEventListener("load", async () => {
    await runBuildMigrationIfNeeded();
    try {
      const reg = await navigator.serviceWorker.register(SW_PATH, {
        scope: "/",
        updateViaCache: "none",
      });
      reg.update().catch(() => {});
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    } catch {
      /* ignore */
    }
  });

  // Also check for updates whenever the app comes back to the foreground.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    navigator.serviceWorker.getRegistration(SW_PATH).then((reg) => {
      reg?.update().catch(() => {});
    });
  });
}
