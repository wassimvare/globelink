import { Link, useLocation } from "@tanstack/react-router";
import { History } from "lucide-react";

export function ActivityShortcut() {
  const location = useLocation();
  if (location.pathname !== "/settings/profile") return null;

  return (
    <Link
      to="/activity"
      className="fixed bottom-20 right-4 z-50 inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/20 bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-elevated transition hover:-translate-y-0.5 sm:bottom-6"
      aria-label="Ouvrir Votre activité"
    >
      <History className="h-4 w-4" /> Votre activité
    </Link>
  );
}
