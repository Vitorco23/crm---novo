import { useEffect, useRef } from "react";
import { getReminders, markReminderNotified } from "@/lib/reminders";

export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return Promise.resolve("denied" as NotificationPermission);
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Promise.resolve(Notification.permission);
  }
  return Notification.requestPermission();
}

export function useReminderNotifications() {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const check = () => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const now = Date.now();
      const due = getReminders().filter(
        (r) => r.status === "pending" && !r.notified && new Date(r.scheduledFor).getTime() <= now
      );
      due.forEach((r) => {
        try {
          const n = new Notification(r.title, {
            body: r.message.slice(0, 240),
            tag: r.id,
          });
          n.onclick = () => {
            window.focus();
            window.location.href = "/lembretes";
            n.close();
          };
          markReminderNotified(r.id);
        } catch {
          /* ignore */
        }
      });
    };
    check();
    timerRef.current = window.setInterval(check, 60_000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);
}
