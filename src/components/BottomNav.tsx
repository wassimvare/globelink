import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Map, Notebook, User as UserIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { QuickCreate } from "@/components/QuickCreate";
import { supabase } from "@/integrations/supabase/client";

export function BottomNav() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hiddenOn = ["/auth", "/forgot-password", "/reset-password", "/verify-email"];

  const { data: profile } = useQuery({
    queryKey: ["bottom-nav-profile", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user!.id)
        .maybeSingle();
      return data ?? null;
    },
  });

  if (hiddenOn.some((path) => pathname.startsWith(path))) return null;

  const profilePath = user
    ? profile?.username
      ? `/profile/${profile.username}`
      : "/settings/profile"
    : "/auth";

  return (
    <nav
      aria-label="Navigation principale"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 sm:hidden"
    >
      <div className="mobile-bottom-nav-inner grid grid-cols-[1fr_1fr_56px_1fr_1fr] items-center border-t border-border/70 bg-card/96 px-1.5 pt-1 shadow-[0_-10px_35px_-24px_rgba(3,28,43,.45)] backdrop-blur-xl">
        <NavItem to="/" label="Accueil" Icon={Home} exact />
        <NavItem to="/map" label="Explorer" Icon={Map} />

        <div className="relative -mt-4 flex justify-center">
          <QuickCreate compact />
        </div>

        <NavItem
          to={user ? "/trips" : "/auth"}
          label="Voyage"
          Icon={Notebook}
          activePrefixes={["/trips", "/intelligence", "/ai-trip", "/ai-pro", "/match"]}
        />

        <NavItem to={profilePath} label="Profil" Icon={UserIcon} activePrefixes={["/profile"]} />
      </div>
    </nav>
  );
}

function NavItem({
  to,
  label,
  Icon,
  exact,
  activePrefixes,
}: {
  to: string;
  label: string;
  Icon: typeof Home;
  exact?: boolean;
  activePrefixes?: string[];
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const forcedActive = activePrefixes?.some((prefix) => pathname.startsWith(prefix)) ?? false;

  return (
    <Link
      to={to as any}
      preload="intent"
      activeOptions={exact ? { exact: true } : undefined}
      activeProps={{ className: "!text-primary [&_.nav-dot]:scale-100 [&_svg]:stroke-[2.4]" }}
      className={`relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold leading-none transition active:bg-secondary/70 ${
        forcedActive ? "text-primary [&_.nav-dot]:scale-100 [&_svg]:stroke-[2.4]" : "text-muted-foreground"
      }`}
    >
      <Icon className="h-[21px] w-[21px] transition" />
      <span className="max-w-full truncate">{label}</span>
      <span className="nav-dot absolute bottom-0.5 h-1 w-1 scale-0 rounded-full bg-primary transition" />
    </Link>
  );
}
