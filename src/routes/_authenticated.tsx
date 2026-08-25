import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ActivityShortcut } from "@/components/ActivityShortcut";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    // Unconfirmed accounts have no access to app features until they activate.
    if (!data.user.email_confirmed_at && !data.user.phone_confirmed_at) {
      throw redirect({ to: "/verify-email" });
    }
    return { user: data.user };
  },

  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <>
      <Outlet />
      <ActivityShortcut />
    </>
  );
}
