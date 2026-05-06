import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { setCurrentUser, syncFromCloud } from "@/lib/userStorage";

const ADMIN_EMAIL = "admin@p21.local";

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setCurrentUser(s?.user?.id ?? null, s?.user?.email ?? null);
      if (s?.user) {
        // Defer to avoid blocking the auth callback
        setTimeout(() => {
          syncFromCloud().then((changed) => {
            if (changed) window.dispatchEvent(new Event("p21:storage-synced"));
          });
        }, 0);
      }
    });
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setCurrentUser(s?.user?.id ?? null, s?.user?.email ?? null);
      if (s?.user) {
        const changed = await syncFromCloud();
        if (changed) window.dispatchEvent(new Event("p21:storage-synced"));
      }
      setLoading(false);
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
        isAdmin: user?.email === ADMIN_EMAIL,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
export { ADMIN_EMAIL };
