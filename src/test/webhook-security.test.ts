import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  escapeHtml,
  readWebhookJson,
} from "../../supabase/functions/_shared/webhook-security";

describe("webhook security helpers", () => {
  it("compares shared secrets without accepting prefixes", () => {
    expect(constantTimeEqual("secret", "secret")).toBe(true);
    expect(constantTimeEqual("secret", "secre")).toBe(false);
    expect(constantTimeEqual("secret", "secret-extra")).toBe(false);
  });

  it("escapes untrusted values used in notification HTML", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)"> & test')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; test",
    );
  });

  it("accepts JSON objects and keeps the raw body for signature checks", async () => {
    const raw = '{"object":"whatsapp_business_account"}';
    const result = await readWebhookJson(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.raw).toBe(raw);
      expect(result.value.object).toBe("whatsapp_business_account");
    }
  });

  it("rejects oversized, malformed and non-object payloads", async () => {
    const oversized = await readWebhookJson(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "300000" },
      body: "{}",
    }));
    expect(oversized).toMatchObject({ ok: false, status: 413 });

    const malformed = await readWebhookJson(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));
    expect(malformed).toMatchObject({ ok: false, status: 400, error: "invalid_json" });

    const array = await readWebhookJson(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "[]",
    }));
    expect(array).toMatchObject({ ok: false, status: 400, error: "invalid_payload" });
  });
});
