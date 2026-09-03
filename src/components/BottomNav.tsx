import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronRight,
  Compass,
  Flame,
  Home,
  Map,
  Notebook,
  ShoppingBag,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { QuickCreate } from "@/components/QuickCreate";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { supabase } from "@/integrations/supabase/client";

const explorerPrefixes = ["/map", "/destinations", "/activities", "/deals", "/marketplace"];

export function BottomNav() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hiddenOn = ["/auth", "/forgot-password", "/reset-password", "/verify-email", "/onboarding", "/beta"];

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
  const explorerActive = explorerPrefixes.some((prefix) => pathname.startsWith(prefix));

  return (
    <nav
      aria-label="Navigation principale"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 sm:hidden"
    >
      <div className="mobile-bottom-nav-inner grid grid-cols-[1fr_1fr_56px_1fr_1fr] items-center border-t border-border/70 bg-card/96 px-1.5 pt-1 shadow-[0_-10px_35px_-24px_rgba(3,28,43,.45)] backdrop-blur-xl">
        <NavItem to="/" label="Accueil" Icon={Home} exact />
        <MobileExplorer active={explorerActive} pathname={pathname} />

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

function MobileExplorer({ active, pathname }: { active: boolean; pathname: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label="Ouvrir Explorer"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`relative flex min-h-[52px] w-full touch-manipulation select-none flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold leading-none transition active:bg-secondary/70 ${
          active ? "text-primary [&_.nav-dot]:scale-100 [&_svg]:stroke-[2.4]" : "text-muted-foreground"
        }`}
      >
        <Map className="h-[21px] w-[21px] transition" />
        <span className="max-w-full truncate">Explorer</span>
        <span className="nav-dot absolute bottom-0.5 h-1 w-1 scale-0 rounded-full bg-primary transition" />
      </button>

      <DrawerContent className="rounded-t-3xl border-border/70 bg-card/95 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-elevated backdrop-blur-2xl">
        <DrawerHeader className="px-5 pb-2 text-left">
          <DrawerTitle>Explorer GlobeLink</DrawerTitle>
          <DrawerDescription>
            Retrouve sur mobile les mêmes rubriques que sur ordinateur.
          </DrawerDescription>
        </DrawerHeader>

        <div className="grid gap-2 px-4 pb-4">
          <ExplorerLink
            to="/map"
            Icon={Map}
            title="Carte"
            description="Hôtels, restaurants et lieux"
            active={pathname.startsWith("/map")}
          />
          <ExplorerLink
            to="/destinations"
            Icon={Compass}
            title="Destinations"
            description="Découvrir les destinations GlobeLink"
            active={pathname.startsWith("/destinations")}
          />
          <ExplorerLink
            to="/activities"
            Icon={Sparkles}
            title="Activités"
            description="Trouver des expériences et activités"
            active={pathname.startsWith("/activities")}
          />
          <ExplorerLink
            to="/deals"
            Icon={Flame}
            title="Sélection du moment"
            description="Voir les lieux et activités sélectionnés"
            active={pathname.startsWith("/deals")}
          />
          <ExplorerLink
            to="/marketplace"
            Icon={ShoppingBag}
            title="Marketplace"
            description="Guides, itinéraires et produits voyage"
            active={pathname.startsWith("/marketplace")}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ExplorerLink({
  to,
  Icon,
  title,
  description,
  active,
}: {
  to: string;
  Icon: typeof Home;
  title: string;
  description: string;
  active: boolean;
}) {
  return (
    <DrawerClose asChild>
      <Link
        to={to as any}
        preload="intent"
        className={`flex min-h-[64px] items-center gap-3 rounded-2xl border px-3.5 py-2.5 transition active:scale-[0.99] ${
          active
            ? "border-primary/30 bg-primary/10 text-foreground"
            : "border-border/70 bg-background/75 text-foreground active:bg-secondary/80"
        }`}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className="mt-0.5 block truncate text-xs font-medium text-muted-foreground">{description}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </DrawerClose>
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
