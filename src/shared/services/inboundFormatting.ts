export function normalizePhoneBR(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.startsWith("0")) return `55${digits}`;
  if (digits.length === 10 || digits.length === 11) return `550${digits}`;
  return digits;
}

export function formatDurationLabel(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes > 0
    ? `${minutes}m${remainder.toString().padStart(2, "0")}s`
    : `${remainder}s`;
}

type SchedulingObject = {
  data?: unknown;
  date?: unknown;
  dia?: unknown;
  day?: unknown;
  hora?: unknown;
  time?: unknown;
  horario?: unknown;
  hour?: unknown;
  observacoes?: unknown;
  observações?: unknown;
  observations?: unknown;
  notes?: unknown;
  note?: unknown;
};

export function formatSchedulingValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value !== "object" || Array.isArray(value)) return "";

  const scheduling = value as SchedulingObject;
  const rawDate = scheduling.data ?? scheduling.date ?? scheduling.dia ?? scheduling.day ?? "";
  const rawTime = scheduling.hora ?? scheduling.time ?? scheduling.horario ?? scheduling.hour ?? "";
  const notes = scheduling.observacoes ?? scheduling.observações ??
    scheduling.observations ?? scheduling.notes ?? scheduling.note ?? "";

  let formattedDate = "";
  if (rawDate) {
    const raw = String(rawDate);
    const iso = raw.length <= 10 && /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T00:00:00`
      : raw;
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      formattedDate = `${day}/${month}/${date.getFullYear()}`;
    } else {
      formattedDate = raw;
    }
  }

  const formattedTime = rawTime ? String(rawTime).slice(0, 5) : "";
  const parts: string[] = [];
  if (formattedDate && formattedTime) parts.push(`${formattedDate} às ${formattedTime}`);
  else if (formattedDate) parts.push(formattedDate);
  else if (formattedTime) parts.push(formattedTime);
  if (notes) parts.push(`(${String(notes).trim()})`);
  return parts.join(" ").trim();
}
