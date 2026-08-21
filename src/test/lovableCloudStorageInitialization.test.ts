import { beforeEach, describe, expect, it, vi } from "vitest";

const idbMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({})),
  },
}));

vi.mock("@/shared/services/idbCache", () => ({
  idbGet: (key: string) => idbMocks.get(key),
  idbSet: (key: string, value: string) => idbMocks.set(key, value),
  idbDelete: (key: string) => idbMocks.delete(key),
}));

import { HEAVY_KEYS, SCOPED_KEYS, isHeavyKey } from "@/shared/services/storageConfig";
import {
  hydrateLocal,
  setCurrentUser,
  uload,
} from "@/shared/services/userStorage";

const HEAVY_STORAGE_KEYS = [
  "p21_leads",
  "p21_movements",
  "p21_sessions",
  "p21_meetings",
];

describe("Lovable Cloud storage initialization", () => {
  beforeEach(() => {
    localStorage.clear();
    setCurrentUser(null);
    idbMocks.get.mockReset();
    idbMocks.set.mockReset();
    idbMocks.delete.mockReset();
    idbMocks.get.mockResolvedValue(null);
    idbMocks.set.mockResolvedValue(undefined);
    idbMocks.delete.mockResolvedValue(undefined);
  });

  it("keeps every heavy key registered as a user-scoped key", () => {
    expect(Array.from(HEAVY_KEYS)).toEqual(HEAVY_STORAGE_KEYS);
    expect(SCOPED_KEYS.filter(isHeavyKey)).toEqual(HEAVY_STORAGE_KEYS);

    for (const key of HEAVY_KEYS) {
      expect(SCOPED_KEYS).toContain(key);
    }
  });

  it("hydrates a production-sized lead collection before the first render", async () => {
    const leads = Array.from({ length: 4_740 }, (_, index) => ({
      id: `lead-${index + 1}`,
      company: `Empresa ${index + 1}`,
      stage: "Novo Lead",
    }));
    const userId = "lovable-cloud-user";
    const leadsKey = `u:${userId}:p21_leads`;

    idbMocks.get.mockImplementation(async (key: string) =>
      key === leadsKey ? JSON.stringify(leads) : null
    );

    setCurrentUser(userId, "vitorco23@gmail.com");
    await hydrateLocal();

    expect(uload("p21_leads", [])).toHaveLength(4_740);
    expect(idbMocks.get).toHaveBeenCalledTimes(HEAVY_STORAGE_KEYS.length);
    expect(idbMocks.get).toHaveBeenCalledWith(leadsKey);
  });

  it("migrates legacy scoped leads to IndexedDB without losing them", async () => {
    const userId = "lovable-cloud-user";
    const leadsKey = `u:${userId}:p21_leads`;
    const leads = [{ id: "lead-1", company: "Empresa", stage: "Novo Lead" }];
    const serialized = JSON.stringify(leads);

    setCurrentUser(userId, "user@example.test");
    localStorage.setItem(leadsKey, serialized);

    await hydrateLocal();

    expect(idbMocks.set).toHaveBeenCalledWith(leadsKey, serialized);
    expect(localStorage.getItem(leadsKey)).toBeNull();
    expect(uload("p21_leads", [])).toEqual(leads);
  });
});
