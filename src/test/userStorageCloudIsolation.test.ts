import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({ error: null })),
  deleteEq: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: mocks.upsert,
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: mocks.deleteEq })),
      })),
    })),
  },
}));

vi.mock("@/shared/services/idbCache", () => ({
  idbGet: vi.fn(async () => null),
  idbSet: vi.fn(async () => undefined),
  idbDelete: vi.fn(async () => undefined),
}));

import {
  saveAndConfirm,
  setCurrentUser,
  usave,
} from "@/shared/services/userStorage";

describe("userStorage cloud isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    mocks.upsert.mockClear();
    setCurrentUser(null);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("keeps a debounced write bound to the user who created it", async () => {
    setCurrentUser("user-a", "a@example.test");
    usave("p21_goals_settings", { target: 10 });

    setCurrentUser("user-b", "b@example.test");
    await vi.advanceTimersByTimeAsync(800);

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({
      user_id: "user-a",
      key: "p21_goals_settings",
      value: { target: 10 },
    });
  });

  it("keeps an immediate confirmed write bound across a session change", async () => {
    let release!: () => void;
    mocks.upsert.mockImplementationOnce(async (row) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { error: null, row };
    });

    setCurrentUser("user-a", "a@example.test");
    const write = saveAndConfirm("p21_leads", [{ id: "lead-1" }]);
    setCurrentUser("user-b", "b@example.test");

    await vi.waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    release();
    await write;

    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({
      user_id: "user-a",
      key: "p21_leads",
    });
  });
});
