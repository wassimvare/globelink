import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { heartbeatPresence } from "@/lib/social-privacy";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const Ctx = createContext<AuthCtx>({ session: null, user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      setSession(error ? null : data.session);
      setLoading(false);
    });

    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      supabase.auth.getSession().then(({ data }) => {
        if (mounted) setSession(data.session);
      });
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || typeof document === "undefined") return;
    let stopped = false;

    const beat = () => {
      if (stopped || document.visibilityState !== "visible") return;
      void heartbeatPresence(userId).catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, 60_000);
    const onVisible = () => beat();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", beat);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", beat);
    };
  }, [session?.user?.id]);

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
