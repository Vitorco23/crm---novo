// PWA registration is disabled: this project ships a kill-switch service worker
// at /sw.js to evict a previously registered app-shell SW that was leaving
// tablets stuck on old builds. We keep the manifest for installability, but
// stop registering any app-shell SW ourselves.
//
// Behavior:
// - In production, on load: ensure the kill-switch /sw.js takes over any
//   old registration (browsers auto-check /sw.js byte-diff on navigation),
//   then unregister everything and clear own caches.
// - In dev / Lovable preview / iframes / ?sw=off: only unregister + clean.

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

async function unregisterAll() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  } catch {
    /* ignore */
  }
}

function isOwnAppCache(name: string): boolean {
  return (
    /^workbox-precache-v\d+/.test(name) ||
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
      names.filter(isOwnAppCache).map((n) => caches.delete(n)),
    );
  } catch {
    /* ignore */
  }
}

/** Manual "Forçar atualização": nuke SW + own caches, then hard reload. */
export async function forceUpdatePWA() {
  await unregisterAll();
  await clearOwnCaches();
  // Bypass HTTP cache on reload.
  window.location.reload();
}

export function registerPWA() {
  if (!("serviceWorker" in navigator)) return;

  if (isRefusedContext()) {
    void unregisterAll().then(clearOwnCaches);
    return;
  }

  window.addEventListener("load", async () => {
    try {
      // Register the kill-switch. Browsers with an old app-shell SW
      // already installed at /sw.js will fetch this new script, install it,
      // and its activate step wipes app caches and unregisters itself.
      // New visitors get the kill-switch, which also unregisters immediately.
      const reg = await navigator.serviceWorker.register(SW_PATH, {
        scope: "/",
        updateViaCache: "none",
      });
      reg.update().catch(() => {});
    } catch {
      // If register fails, still clear anything stale we can reach.
      await unregisterAll();
      await clearOwnCaches();
    }
  });
}
