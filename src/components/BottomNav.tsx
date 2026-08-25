import { Link, useRouterState } from "@tanstack/react-router";
import { Heart, Home, Map, MessageSquare } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { QuickCreate } from "@/components/QuickCreate";

export function BottomNav() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hiddenOn = ["/auth", "/forgot-password", "/reset-password", "/verify-email"];

  if (hiddenOn.some((path) => pathname.startsWith(path))) return null;

  const items: Array<{
    to: string;
    label: string;
    Icon: typeof Home;
    exact?: boolean;
    requiresAuth?: boolean;
  }> = [
    { to: "/", label: "Accueil", Icon: Home, exact: true },
    { to: "/map", label: "Explorer", Icon: Map },
    { to: "/match", label: "Match", Icon: Heart, requiresAuth: true },
    { to: "/messages", label: "Messages", Icon: MessageSquare, requiresAuth: true },
  ];

  return (
    <nav
      aria-label="Navigation principale"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 sm:hidden"
    >
      <div className="mobile-bottom-nav-inner grid grid-cols-[1fr_1fr_56px_1fr_1fr] items-center border-t border-border/70 bg-card/96 px-1.5 pt-1 shadow-[0_-10px_35px_-24px_rgba(3,28,43,.45)] backdrop-blur-xl">
        {items.slice(0, 2).map(({ to, label, Icon, exact }) => (
          <NavItem key={to} to={to} label={label} Icon={Icon} exact={exact} />
        ))}
        <div className="relative -mt-4 flex justify-center">
          <QuickCreate compact />
        </div>
        {items.slice(2).map(({ to, label, Icon, requiresAuth }) => (
          <NavItem key={to} to={requiresAuth && !user ? "/auth" : to} label={label} Icon={Icon} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({
  to,
  label,
  Icon,
  exact,
}: {
  to: string;
  label: string;
  Icon: typeof Home;
  exact?: boolean;
}) {
  return (
    <Link
      to={to as any}
      preload="intent"
      activeOptions={exact ? { exact: true } : undefined}
      activeProps={{ className: "!text-primary [&_.nav-dot]:scale-100 [&_svg]:stroke-[2.4]" }}
      className="relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold leading-none text-muted-foreground transition active:bg-secondary/70"
    >
      <Icon className="h-[21px] w-[21px] transition" />
      <span className="max-w-full truncate">{label}</span>
      <span className="nav-dot absolute bottom-0.5 h-1 w-1 scale-0 rounded-full bg-primary transition" />
    </Link>
  );
}
