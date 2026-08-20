export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export type WebhookBodyResult =
  | { ok: true; raw: string; value: Record<string, unknown> }
  | { ok: false; status: 400 | 413 | 415; error: "invalid_json" | "invalid_payload" | "payload_too_large" | "unsupported_media_type" };

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function readWebhookJson(
  req: Request,
  maxBytes = MAX_WEBHOOK_BODY_BYTES,
): Promise<WebhookBodyResult> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return { ok: false, status: 415, error: "unsupported_media_type" };
  }

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, status: 413, error: "payload_too_large" };
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, status: 413, error: "payload_too_large" };
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, status: 400, error: "invalid_payload" };
    }
    return { ok: true, raw, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}
