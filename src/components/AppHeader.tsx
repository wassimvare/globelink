import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bell,
  ChevronDown,
  Crown,
  Heart,
  Home,
  LayoutDashboard,
  LogOut,
  Map,
  MessageSquare,
  Notebook,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Trophy,
  User as UserIcon,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BackButton } from "@/components/BackButton";
import { QuickCreate } from "@/components/QuickCreate";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSignedMediaUrl } from "@/lib/storage";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";

const navClass =
  "group inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold text-muted-foreground transition hover:bg-secondary/80 hover:text-foreground";

export function AppHeader() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    getSignedMediaUrl(profile?.avatar_url).then(setAvatarUrl);
  }, [profile?.avatar_url]);

  const { data: unread = 0 } = useQuery({
    queryKey: ["notifications-unread", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user!.id)
        .is("read_at", null);
      return count ?? 0;
    },
  });

  const { data: isAdmin = false } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`header-notif-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notifications-unread", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/", replace: true });
  }

  return (
    <header
      className={`app-header safe-top sticky top-0 z-50 border-b transition-all duration-300 ${scrolled ? "border-border/70 bg-background/88 shadow-[0_10px_35px_-22px_rgba(3,28,43,.45)] backdrop-blur-2xl" : "border-transparent bg-background/72 backdrop-blur-xl"}`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:px-4">
        {!isHome && <BackButton compact />}
        <Link
          to="/"
          className="group flex min-w-0 shrink-0 items-center gap-2 pr-1 sm:pr-2"
          aria-label="Accueil GlobeLink"
        >
          <div className="brand-logo-shell h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-950 shadow-soft transition duration-300 group-hover:scale-105 group-hover:shadow-glow">
            <BrandLogo className="h-full w-full" priority />
          </div>
          <div className="min-w-0">
            <div className="brand-name truncate font-display text-lg font-bold leading-none tracking-tight sm:text-xl">
              GlobeLink
            </div>
            <div className="mt-1 hidden text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground sm:block">
              Voyager ensemble
            </div>
          </div>
        </Link>

        <nav className="ml-3 hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          <Link
            to="/"
            className={navClass}
            activeProps={{ className: "!bg-primary !text-primary-foreground shadow-soft" }}
            activeOptions={{ exact: true }}
          >
            <Home className="h-4 w-4" /> Fil
          </Link>
          <Link
            to="/map"
            className={navClass}
            activeProps={{ className: "!bg-primary !text-primary-foreground shadow-soft" }}
          >
            <Map className="h-4 w-4" /> Explorer
          </Link>
          <Link
            to="/destinations"
            preload="intent"
            className={navClass}
            activeProps={{ className: "!bg-primary !text-primary-foreground shadow-soft" }}
          >
            <Map className="h-4 w-4" /> Destinations
          </Link>
          <Link
            to="/activities"
            preload="intent"
            className={navClass}
            activeProps={{ className: "!bg-primary !text-primary-foreground shadow-soft" }}
          >
            <Sparkles className="h-4 w-4" /> Activités
          </Link>
          <Link
            to="/ai-trip"
            className={navClass}
            activeProps={{ className: "!bg-primary !text-primary-foreground shadow-soft" }}
          >
            <Map className="h-4 w-4" /> Itinéraires
          </Link>
          {user && (
            <Link
              to="/match"
              className={navClass}
              activeProps={{ className: "!bg-primary !text-primary-foreground shadow-soft" }}
            >
              <Heart className="h-4 w-4" /> Match
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={`${navClass} outline-none data-[state=open]:bg-secondary data-[state=open]:text-foreground`}
            >
              Plus{" "}
              <ChevronDown className="h-3.5 w-3.5 transition group-data-[state=open]:rotate-180" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-56 rounded-2xl border-border/70 bg-card/95 p-2 shadow-elevated backdrop-blur-2xl"
            >
              <DropdownMenuItem asChild>
                <Link to="/destinations" preload="intent" className="rounded-xl">
                  <Map className="mr-2 h-4 w-4 text-primary" /> Destinations
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/activities" preload="intent" className="rounded-xl">
                  <Sparkles className="mr-2 h-4 w-4 text-primary" /> Activités du monde
                </Link>
              </DropdownMenuItem>
              {user && (
                <DropdownMenuItem asChild>
                  <Link to="/intelligence" className="rounded-xl">
                    <Sparkles className="mr-2 h-4 w-4 text-primary" /> Intelligence GlobeLink
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link to="/ai-pro" className="rounded-xl">
                  <Crown className="mr-2 h-4 w-4 text-amber-500" /> Conseils voyage
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/marketplace" className="rounded-xl">
                  <ShoppingBag className="mr-2 h-4 w-4" /> Marketplace
                </Link>
              </DropdownMenuItem>
              {user && (
                <DropdownMenuItem asChild>
                  <Link to="/dashboard" className="rounded-xl">
                    <LayoutDashboard className="mr-2 h-4 w-4" /> Tableau de bord
                  </Link>
                </DropdownMenuItem>
              )}
              {user && (
                <DropdownMenuItem asChild>
                  <Link to="/trips" className="rounded-xl">
                    <Notebook className="mr-2 h-4 w-4" /> Carnet de voyage
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            to="/search"
            aria-label="Rechercher"
            className="group inline-flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-card/80 px-3 text-sm font-medium text-muted-foreground shadow-[0_1px_0_rgba(255,255,255,.6)_inset] transition hover:border-primary/25 hover:text-foreground hover:shadow-soft"
          >
            <Search className="h-4 w-4 transition group-hover:scale-110" />
            <span className="hidden xl:inline">Rechercher</span>
          </Link>
          <ThemeToggle />

          {user ? (
            <>
              <Link
                to="/messages"
                aria-label="Messages"
                className="relative hidden h-10 w-10 place-items-center rounded-full border border-border/70 bg-card/80 text-foreground transition hover:border-primary/25 hover:shadow-soft sm:grid"
              >
                <MessageSquare className="h-4 w-4" />
              </Link>
              <Link
                to="/notifications"
                aria-label="Notifications"
                className="relative grid h-10 w-10 place-items-center rounded-full border border-border/70 bg-card/80 text-foreground transition hover:border-primary/25 hover:shadow-soft"
              >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground ring-2 ring-background">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <div className="hidden sm:block">
                <QuickCreate />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Ouvrir le menu du profil"
                    className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-border/70 bg-secondary transition hover:border-primary/25 hover:shadow-soft focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Photo de profil"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <UserIcon className="h-4 w-4" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-64 rounded-2xl border-border/70 bg-card/95 p-2 shadow-elevated backdrop-blur-2xl"
                >
                  <DropdownMenuLabel className="px-3 py-2">
                    <div className="truncate font-semibold">
                      {profile?.display_name || profile?.username || "Mon compte"}
                    </div>
                    {profile?.username && (
                      <div className="truncate text-xs font-normal text-muted-foreground">
                        @{profile.username}
                      </div>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/intelligence" className="rounded-xl">
                      <Sparkles className="mr-2 h-4 w-4 text-primary" /> Intelligence GlobeLink
                    </Link>
                  </DropdownMenuItem>
                  {profile?.username && (
                    <DropdownMenuItem asChild>
                      <Link
                        to="/profile/$username"
                        params={{ username: profile.username }}
                        className="rounded-xl"
                      >
                        <UserIcon className="mr-2 h-4 w-4" /> Mon profil
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/settings/profile" className="rounded-xl">
                      <Settings className="mr-2 h-4 w-4" /> Paramètres du profil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/security" className="rounded-xl">
                      <Shield className="mr-2 h-4 w-4 text-emerald-600" /> Sécurité du compte
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard" className="rounded-xl">
                      <LayoutDashboard className="mr-2 h-4 w-4" /> Tableau de bord
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/achievements" className="rounded-xl">
                      <Trophy className="mr-2 h-4 w-4 text-accent" /> Récompenses
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="rounded-xl">
                        <Shield className="mr-2 h-4 w-4" /> Administration
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={signOut}
                    className="rounded-xl text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Déconnexion
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button
              asChild
              size="sm"
              className="h-10 rounded-xl bg-primary px-4 text-primary-foreground shadow-soft transition hover:-translate-y-0.5 hover:shadow-glow"
            >
              <Link to="/auth">Connexion</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}