import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bell,
  ChevronDown,
  Compass,
  Flame,
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
import { BrandLogo } from "@/components/BrandLogo";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getSignedMediaUrl } from "@/lib/storage";
import { loadNotificationPreferences, notificationAllowed } from "@/lib/user-preferences";

const navClass =
  "group inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold text-muted-foreground transition hover:bg-secondary/80 hover:text-foreground";
const navActiveClass = "!bg-primary !text-primary-foreground shadow-soft";

export function AppHeader() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";
  const explorerActive = ["/map", "/destinations", "/activities", "/deals", "/marketplace"].some(
    (path) => pathname.startsWith(path),
  );
  const travelActive = ["/trips", "/intelligence", "/ai-trip", "/ai-pro", "/match"].some(
    (path) => pathname.startsWith(path),
  );
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
      const { data } = await supabase
        .from("notifications")
        .select("id, type, metadata")
        .eq("recipient_id", user!.id)
        .is("read_at", null)
        .limit(100);
      const preferences = loadNotificationPreferences(user!.id);
      return (data ?? []).filter((notification) => notificationAllowed(notification, preferences)).length;
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
    const channel = supabase
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
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  useEffect(() => {
    if (!user) return;
    const refreshUnread = () =>
      qc.invalidateQueries({ queryKey: ["notifications-unread", user.id] });
    window.addEventListener("globelink:notification-preferences", refreshUnread);
    return () => window.removeEventListener("globelink:notification-preferences", refreshUnread);
  }, [user, qc]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/", replace: true });
  }

  return (
    <header
      className={`app-header safe-top sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "border-border/70 bg-background/88 shadow-[0_10px_35px_-22px_rgba(3,28,43,.45)] backdrop-blur-2xl"
          : "border-transparent bg-background/72 backdrop-blur-xl"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:px-4">
        {!isHome && <BackButton compact />}
        <Link
          to="/"
          preload="intent"
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
            preload="intent"
            className={navClass}
            activeProps={{ className: navActiveClass }}
            activeOptions={{ exact: true }}
          >
            <Home className="h-4 w-4" /> Accueil
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={`${navClass} ${explorerActive ? navActiveClass : ""} outline-none data-[state=open]:bg-secondary data-[state=open]:text-foreground`}
            >
              <Compass className="h-4 w-4" /> Explorer
              <ChevronDown className="h-3.5 w-3.5 transition group-data-[state=open]:rotate-180" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 rounded-2xl border-border/70 bg-card/95 p-2 shadow-elevated backdrop-blur-2xl"
            >
              <DropdownMenuLabel className="px-3 pb-2 pt-1 text-xs text-muted-foreground">
                Découvrir le monde
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/map" preload="intent" className="rounded-xl">
                  <Map className="mr-2 h-4 w-4 text-primary" /> Carte · hôtels, restaurants et lieux
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/destinations" preload="intent" className="rounded-xl">
                  <Compass className="mr-2 h-4 w-4" /> Destinations
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/activities" preload="intent" className="rounded-xl">
                  <Sparkles className="mr-2 h-4 w-4" /> Activités
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/deals" preload="intent" className="rounded-xl">
                  <Flame className="mr-2 h-4 w-4 text-orange-500" /> Offres du moment
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/marketplace" preload="intent" className="rounded-xl">
                  <ShoppingBag className="mr-2 h-4 w-4" /> Marketplace voyage
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={`${navClass} ${travelActive ? navActiveClass : ""} outline-none data-[state=open]:bg-secondary data-[state=open]:text-foreground`}
              >
                <Notebook className="h-4 w-4" /> Voyage
                <ChevronDown className="h-3.5 w-3.5 transition group-data-[state=open]:rotate-180" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-64 rounded-2xl border-border/70 bg-card/95 p-2 shadow-elevated backdrop-blur-2xl"
              >
                <DropdownMenuLabel className="px-3 pb-2 pt-1 text-xs text-muted-foreground">
                  Préparer et vivre ton voyage
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
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            to="/search"
            preload="intent"
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
                preload="intent"
                aria-label="Messages"
                className="relative grid h-10 w-10 place-items-center rounded-full border border-border/70 bg-card/80 text-foreground transition hover:border-primary/25 hover:shadow-soft"
              >
                <MessageSquare className="h-4 w-4" />
              </Link>
              <Link
                to="/notifications"
                preload="intent"
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
                      <img src={avatarUrl} alt="Photo de profil" className="h-full w-full object-cover" />
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
                  {profile?.username && (
                    <DropdownMenuItem asChild>
                      <Link
                        to="/profile/$username"
                        params={{ username: profile.username }}
                        preload="intent"
                        className="rounded-xl"
                      >
                        <UserIcon className="mr-2 h-4 w-4" /> Mon profil
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/settings" preload="intent" className="rounded-xl">
                      <Settings className="mr-2 h-4 w-4" /> Paramètres et confidentialité
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/security" preload="intent" className="rounded-xl">
                      <Shield className="mr-2 h-4 w-4 text-emerald-600" /> Sécurité du compte
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard" preload="intent" className="rounded-xl">
                      <LayoutDashboard className="mr-2 h-4 w-4" /> Tableau de bord
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/achievements" preload="intent" className="rounded-xl">
                      <Trophy className="mr-2 h-4 w-4 text-accent" /> Récompenses
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" preload="intent" className="rounded-xl">
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
              <Link to="/auth" preload="intent">
                Connexion
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
