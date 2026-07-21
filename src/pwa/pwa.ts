// PWA runtime helpers: standalone detection + notifications scaffolding.

export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)");
  // iOS Safari exposes navigator.standalone.
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(mql?.matches) || iosStandalone;
}

/** Toggles a `pwa-standalone` class on <html> so CSS can hide browser-only chrome. */
export function applyStandaloneClass() {
  if (typeof document === "undefined") return;
  const update = () => {
    document.documentElement.classList.toggle("pwa-standalone", isStandalonePWA());
  };
  update();
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", update);
}

/** Request Notification API permission — scaffolding for future push/reminders. */
export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}
