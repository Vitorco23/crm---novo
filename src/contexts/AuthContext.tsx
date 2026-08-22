import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { setCurrentUser, syncFromCloud, hydrateLocal } from "@/shared/services/userStorage";
import {
  CLOUD_SYNC_DELAYED_EVENT,
  CLOUD_SYNC_RECOVERED_EVENT,
  INITIAL_CLOUD_SYNC_TIMEOUT_MS,
} from "@/shared/services/syncStatus";

/**
 * @deprecated Utilizado apenas para compatibilidade legada em fluxos de migração de dados.
 * Não deve ser usado para conceder autorização em novos componentes.
 */
const LEGACY_ADMIN_EMAIL = "vitorco23@gmail.com";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let storageUserId: string | null = null;
    let storageReadyPromise: Promise<void> | null = null;

    const ensureUserStorageReady = (authenticatedUser: User): Promise<void> => {
      if (storageUserId === authenticatedUser.id && storageReadyPromise) {
        return storageReadyPromise;
      }

      storageUserId = authenticatedUser.id;
      storageReadyPromise = (async () => {
        await hydrateLocal();

        // Local leads are usable as soon as IndexedDB hydration finishes.
        // Never keep the CRM blocked only because Lovable Cloud is slow.
        window.dispatchEvent(new Event("p21:storage-synced"));

        let timedOut = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const cloudSync = syncFromCloud().then(() => {
          window.dispatchEvent(new Event("p21:storage-synced"));
          if (timedOut) {
            window.dispatchEvent(new Event(CLOUD_SYNC_RECOVERED_EVENT));
          }
        });

        await Promise.race([
          cloudSync,
          new Promise<void>((resolve) => {
            timeoutId = setTimeout(() => {
              timedOut = true;
              window.dispatchEvent(new Event(CLOUD_SYNC_DELAYED_EVENT));
              resolve();
            }, INITIAL_CLOUD_SYNC_TIMEOUT_MS);
          }),
        ]);

        if (timeoutId) clearTimeout(timeoutId);
      })();

      return storageReadyPromise;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setCurrentUser(s?.user?.id ?? null, s?.user?.email ?? null);

      if (s?.user && event === "SIGNED_IN") {
        // Defer Supabase work outside the auth callback while sharing the same
        // promise with getSession, preventing the app from rendering too early.
        setTimeout(() => {
          void ensureUserStorageReady(s.user).catch((error) => {
            console.warn("[AuthContext] user storage initialization failed", error);
          });
        }, 0);
      }

      if (!s?.user) {
        storageUserId = null;
        storageReadyPromise = null;
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setCurrentUser(s?.user?.id ?? null, s?.user?.email ?? null);

      try {
        if (s?.user) {
          // Do not release the authenticated UI until IndexedDB hydration and
          // the initial cloud sync have both completed (or timed out).
          await ensureUserStorageReady(s.user);
        }
      } catch (error) {
        console.warn("[AuthContext] initial user storage synchronization failed", error);
      } finally {
        // ALWAYS release the loading state, even if storage preparation failed.
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  };

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        loading,
        isAdmin: user?.email === LEGACY_ADMIN_EMAIL,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
export { LEGACY_ADMIN_EMAIL };
