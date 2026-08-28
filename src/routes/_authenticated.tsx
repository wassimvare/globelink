import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location, context }) => {
    // This route is client-only. Reading the already refreshed local session avoids
    // a full auth network round-trip on every in-app navigation. Database access
    // remains protected by Supabase RLS.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }

    // Unconfirmed accounts have no access to app features until they activate.
    if (!user.email_confirmed_at && !user.phone_confirmed_at) {
      throw redirect({ to: "/verify-email" });
    }

    // Account status + onboarding state do not need another request for every tap.
    // A short cache keeps navigation responsive while still rechecking frequently.
    const profile = await context.queryClient.ensureQueryData({
      queryKey: ["auth-profile-status", user.id],
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      queryFn: async () => {
        const { data, error } = await (supabase as any)
          .from("profiles")
          .select("status,onboarding_completed_at")
          .eq("id", user.id)
          .maybeSingle();
        if (error) throw error;
        return data as { status: string | null; onboarding_completed_at: string | null } | null;
      },
    });

    if (profile?.status === "deactivated") {
      throw redirect({ to: "/account-deactivated" });
    }

    // New members get one short welcome screen before entering the rest of the app.
    // The onboarding route itself must remain reachable to avoid a redirect loop.
    if (!profile?.onboarding_completed_at && location.pathname !== "/onboarding") {
      throw redirect({
        to: "/onboarding",
        search: { next: location.href },
      });
    }

    return { user };
  },

  component: () => <Outlet />,
});
