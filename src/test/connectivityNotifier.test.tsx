import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  syncFromCloud: vi.fn(),
  loading: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    loading: (...args: unknown[]) => mocks.loading(...args),
    success: (...args: unknown[]) => mocks.success(...args),
    warning: (...args: unknown[]) => mocks.warning(...args),
    info: (...args: unknown[]) => mocks.info(...args),
    error: (...args: unknown[]) => mocks.error(...args),
  },
}));

vi.mock("@/shared/services/userStorage", () => ({
  syncFromCloud: (...args: unknown[]) => mocks.syncFromCloud(...args),
}));

import { ConnectivityNotifier } from "@/shared/components/ConnectivityNotifier";

describe("ConnectivityNotifier", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.syncFromCloud.mockResolvedValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("explains that local CRM data remains available while offline", () => {
    render(<ConnectivityNotifier />);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(mocks.warning).toHaveBeenCalledWith(
      "Sem conexão. O CRM continuará usando os dados locais.",
      expect.objectContaining({ id: "p21-connectivity" })
    );
    expect(mocks.syncFromCloud).not.toHaveBeenCalled();
  });

  it("automatically resynchronizes after the connection returns", async () => {
    mocks.syncFromCloud.mockResolvedValue(true);
    const storageSynced = vi.fn();
    window.addEventListener("p21:storage-synced", storageSynced);
    render(<ConnectivityNotifier />);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(mocks.loading).toHaveBeenCalled();
    await waitFor(() => expect(mocks.syncFromCloud).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(
      "Dados sincronizados com o Lovable Cloud.",
      expect.objectContaining({ id: "p21-connectivity" })
    ));
    expect(storageSynced).toHaveBeenCalledTimes(1);

    window.removeEventListener("p21:storage-synced", storageSynced);
  });

  it("reports delayed, recovered and failed cloud synchronization states", () => {
    render(<ConnectivityNotifier />);

    act(() => {
      window.dispatchEvent(new Event("p21:cloud-sync-delayed"));
      window.dispatchEvent(new Event("p21:cloud-sync-recovered"));
      window.dispatchEvent(new CustomEvent("p21:cloud-sync-error"));
    });

    expect(mocks.info).toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalled();
  });
});
