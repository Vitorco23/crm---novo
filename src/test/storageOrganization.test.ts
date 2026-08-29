import { describe, expect, it } from "vitest";
import {
  isEmptyStorageValue,
  isHeavyKey,
  isProtectedConfigKey,
  isScopedKey,
} from "@/shared/services/storageConfig";
import {
  formatDurationLabel,
  formatSchedulingValue,
  normalizePhoneBR,
} from "@/shared/services/inboundFormatting";

describe("storage configuration", () => {
  it("classifies storage keys without duplicating rules in the sync service", () => {
    expect(isScopedKey("p21_leads")).toBe(true);
    expect(isScopedKey("unrelated")).toBe(false);
    expect(isHeavyKey("p21_leads")).toBe(true);
    expect(isHeavyKey("p21_goals_settings")).toBe(false);
    expect(isProtectedConfigKey("p21_scripts")).toBe(true);
  });

  it("recognizes only structurally empty values", () => {
    expect(isEmptyStorageValue(null)).toBe(true);
    expect(isEmptyStorageValue([])).toBe(true);
    expect(isEmptyStorageValue({})).toBe(true);
    expect(isEmptyStorageValue("")).toBe(false);
    expect(isEmptyStorageValue([0])).toBe(false);
    expect(isEmptyStorageValue({ enabled: false })).toBe(false);
  });
});

describe("inbound formatting", () => {
  it("keeps the existing canonical Brazilian phone format", () => {
    expect(normalizePhoneBR("+55 (79) 99989-9212")).toBe("5579999899212");
    expect(normalizePhoneBR("07999899212")).toBe("5507999899212");
    // Regression: this used to assert "5507999899212" (an extra "0" bug in the
    // 10/11-digit branch of normalizePhoneBR) — that bug caused real inbound
    // interactions (Matteline + the WhatsApp dispatch agent) to silently fail
    // to match leads whose phone was stored without the "55" country code.
    // See src/shared/services/inboundFormatting.test.ts for the fix coverage.
    expect(normalizePhoneBR("7999899212")).toBe("557999899212");
  });

  it("formats durations and scheduling data predictably", () => {
    expect(formatDurationLabel(125)).toBe("2m05s");
    expect(formatSchedulingValue({ date: "2026-08-20", time: "14:30:00" }))
      .toBe("20/08/2026 às 14:30");
    expect(formatSchedulingValue({ notes: "retornar" })).toBe("(retornar)");
    expect(formatSchedulingValue(null)).toBe("");
  });
});
