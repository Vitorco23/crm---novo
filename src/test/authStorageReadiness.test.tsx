import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

type AuthCallback = (event: string, session: unknown) => void;

const mocks = vi.hoisted(() => ({
  authCallback: undefined as AuthCallback | undefined,
  getSession: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
  hydrateLocal: vi.fn(),
  syncFromCloud: vi.fn(),
  setCurrentUser: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((callback: AuthCallback) => {
        mocks.authCallback = callback;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      }),
      getSession: (...args: unknown[]) => mocks.getSession(...args),
      signOut: (...args: unknown[]) => mocks.signOut(...args),
    },
  },
}));

vi.mock("@/shared/services/userStorage", () => ({
  hydrateLocal: (...args: unknown[]) => mocks.hydrateLocal(...args),
  syncFromCloud: (...args: unknown[]) => mocks.syncFromCloud(...args),
  setCurrentUser: (...args: unknown[]) => mocks.setCurrentUser(...args),
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function sessionFor(id = "lovable-user") {
  return {
    access_token: "test-token",
    refresh_token: "test-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id,
      email: "vitorco23@gmail.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

function AuthStatus() {
  const { loading, user } = useAuth();
  return (
    <div data-testid="auth-status">
      {loading ? "loading" : "ready"}:{user?.id ?? "none"}
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <AuthStatus />
    </AuthProvider>
  );
}

describe("AuthProvider storage readiness", () => {
  beforeEach(() => {
    mocks.authCallback = undefined;
    mocks.getSession.mockReset();
    mocks.signOut.mockReset();
    mocks.unsubscribe.mockReset();
    mocks.hydrateLocal.mockReset();
    mocks.syncFromCloud.mockReset();
    mocks.setCurrentUser.mockReset();
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.syncFromCloud.mockResolvedValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the authenticated UI loading until IndexedDB and cloud sync are ready", async () => {
    const hydration = deferred<void>();
    const session = sessionFor();
    const storageReady = vi.fn();

    mocks.getSession.mockResolvedValue({ data: { session } });
    mocks.hydrateLocal.mockReturnValue(hydration.promise);
    window.addEventListener("p21:storage-synced", storageReady);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("loading:lovable-user");
    });
    expect(mocks.syncFromCloud).not.toHaveBeenCalled();

    await act(async () => {
      hydration.resolve();
      await hydration.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("ready:lovable-user");
    });
    expect(mocks.hydrateLocal).toHaveBeenCalledTimes(1);
    expect(mocks.syncFromCloud).toHaveBeenCalledTimes(1);
    expect(storageReady).toHaveBeenCalledTimes(2);

    window.removeEventListener("p21:storage-synced", storageReady);
  });

  it("shares one initialization when SIGNED_IN races with getSession", async () => {
    const sessionResult = deferred<{ data: { session: ReturnType<typeof sessionFor> } }>();
    const hydration = deferred<void>();
    const session = sessionFor("race-user");

    mocks.getSession.mockReturnValue(sessionResult.promise);
    mocks.hydrateLocal.mockReturnValue(hydration.promise);

    renderProvider();

    await waitFor(() => expect(mocks.authCallback).toBeTypeOf("function"));

    act(() => {
      mocks.authCallback?.("SIGNED_IN", session);
    });

    await waitFor(() => expect(mocks.hydrateLocal).toHaveBeenCalledTimes(1));

    await act(async () => {
      sessionResult.resolve({ data: { session } });
      await sessionResult.promise;
    });

    expect(mocks.hydrateLocal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("auth-status")).toHaveTextContent("loading:race-user");

    await act(async () => {
      hydration.resolve();
      await hydration.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("ready:race-user");
    });
    expect(mocks.hydrateLocal).toHaveBeenCalledTimes(1);
    expect(mocks.syncFromCloud).toHaveBeenCalledTimes(1);
  });

  it("releases locally hydrated leads when Lovable Cloud exceeds the startup timeout", async () => {
    vi.useFakeTimers();
    const cloudSync = deferred<boolean>();
    const session = sessionFor("slow-cloud-user");
    const delayed = vi.fn();

    mocks.getSession.mockResolvedValue({ data: { session } });
    mocks.hydrateLocal.mockResolvedValue(undefined);
    mocks.syncFromCloud.mockReturnValue(cloudSync.promise);
    window.addEventListener("p21:cloud-sync-delayed", delayed);

    renderProvider();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(screen.getByTestId("auth-status")).toHaveTextContent("ready:slow-cloud-user");
    expect(mocks.hydrateLocal).toHaveBeenCalledTimes(1);
    expect(mocks.syncFromCloud).toHaveBeenCalledTimes(1);
    expect(delayed).toHaveBeenCalledTimes(1);

    window.removeEventListener("p21:cloud-sync-delayed", delayed);
    vi.useRealTimers();
  });

  it("releases the login screen safely when storage initialization fails", async () => {
    const session = sessionFor("recovery-user");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mocks.getSession.mockResolvedValue({ data: { session } });
    mocks.hydrateLocal.mockRejectedValue(new Error("IndexedDB unavailable"));

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("ready:recovery-user");
    });
    expect(mocks.syncFromCloud).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[AuthContext] initial user storage sync failed",
      expect.any(Error)
    );

    warn.mockRestore();
  });

  it("does not initialize user storage when there is no authenticated session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("ready:none");
    });
    expect(mocks.hydrateLocal).not.toHaveBeenCalled();
    expect(mocks.syncFromCloud).not.toHaveBeenCalled();
  });
});
