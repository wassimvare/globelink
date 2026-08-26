import { Link, useRouterState } from "@tanstack/react-router";
import { Heart, Home, Map, Notebook, Sparkles, User as UserIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { QuickCreate } from "@/components/QuickCreate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";

export function BottomNav() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hiddenOn = ["/auth", "/forgot-password", "/reset-password", "/verify-email"];

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
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

  const travelActive = ["/trips", "/intelligence", "/ai-trip", "/ai-pro", "/match"].some(
    (path) => pathname.startsWith(path),
  );
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

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Ouvrir le menu Voyage"
                className={`relative flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold leading-none transition active:bg-secondary/70 ${
                  travelActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Notebook className={`h-[21px] w-[21px] transition ${travelActive ? "stroke-[2.4]" : ""}`} />
                <span className="max-w-full truncate">Voyage</span>
                <span
                  className={`absolute bottom-0.5 h-1 w-1 rounded-full bg-primary transition ${
                    travelActive ? "scale-100" : "scale-0"
                  }`}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="center"
              sideOffset={10}
              className="w-60 rounded-2xl border-border/70 bg-card/95 p-2 shadow-elevated backdrop-blur-2xl"
            >
              <DropdownMenuLabel className="px-3 pb-2 pt-1 text-xs text-muted-foreground">
                Ton espace voyage
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/trips" preload="intent" className="rounded-xl">
                  <Notebook className="mr-2 h-4 w-4 text-primary" /> Mes voyages
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/intelligence" preload="intent" className="rounded-xl">
                  <Sparkles className="mr-2 h-4 w-4 text-violet-500" /> GlobeLink IA
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/match" preload="intent" className="rounded-xl">
                  <Heart className="mr-2 h-4 w-4 text-rose-500" /> Travel Match
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <NavItem to="/auth" label="Voyage" Icon={Notebook} />
        )}

        <NavItem to={profilePath} label="Profil" Icon={UserIcon} activePrefix="/profile" />
      </div>
    </nav>
  );
}

function NavItem({
  to,
  label,
  Icon,
  exact,
  activePrefix,
}: {
  to: string;
  label: string;
  Icon: typeof Home;
  exact?: boolean;
  activePrefix?: string;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const forcedActive = activePrefix ? pathname.startsWith(activePrefix) : false;

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
