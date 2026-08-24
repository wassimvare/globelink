import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Camera, Crown, MapPin, Notebook, Plus, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const actions = [
  {
    to: "/new-post",
    icon: Camera,
    title: "Partager un moment",
    description: "Publie une photo, une vidéo ou un conseil.",
    accent: "from-cyan-500/15 to-blue-500/5 text-cyan-700 dark:text-cyan-300",
    auth: true,
  },
  {
    to: "/new-place",
    icon: MapPin,
    title: "Ajouter un lieu",
    description: "Recommande une adresse à la communauté.",
    accent: "from-emerald-500/15 to-teal-500/5 text-emerald-700 dark:text-emerald-300",
    auth: true,
  },
  {
    to: "/ai-trip",
    icon: Sparkles,
    title: "Préparer un voyage",
    description: "Crée un itinéraire personnalisé avec l’assistant.",
    accent: "from-violet-500/15 to-fuchsia-500/5 text-violet-700 dark:text-violet-300",
    auth: false,
  },
  {
    to: "/ai-pro",
    icon: Crown,
    title: "Demander au conseiller",
    description: "Compare, vérifie et organise ton prochain voyage.",
    accent: "from-amber-500/15 to-yellow-500/5 text-amber-700 dark:text-amber-300",
    auth: true,
  },
  {
    to: "/trips",
    icon: Notebook,
    title: "Ouvrir mon carnet",
    description: "Retrouve tes projets et tes voyages enregistrés.",
    accent: "from-amber-500/15 to-orange-500/5 text-amber-700 dark:text-amber-300",
    auth: true,
  },
] as const;

export function QuickCreate({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            compact
              ? "grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-elevated transition hover:-translate-y-0.5 hover:shadow-glow active:translate-y-0 active:scale-95"
              : "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition hover:-translate-y-0.5 hover:shadow-glow active:translate-y-0",
            className,
          )}
          aria-label="Créer sur GlobeLink"
        >
          <Plus className={compact ? "h-6 w-6" : "h-4 w-4"} />
          {!compact && <span>Créer</span>}
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="quick-create-sheet max-h-[82dvh] overflow-hidden rounded-t-[1.75rem] border-border/70 bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 shadow-elevated sm:left-auto sm:right-4 sm:top-20 sm:h-auto sm:max-h-[calc(100vh-6rem)] sm:w-[420px] sm:rounded-2xl sm:border sm:p-6"
      >
        <SheetHeader className="pr-10 text-left">
          <div className="mb-1 inline-flex w-fit items-center gap-2 rounded-full bg-primary/[0.08] px-3 py-1 text-[11px] font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Action rapide
          </div>
          <SheetTitle className="font-display text-xl sm:text-2xl">
            Qu’est-ce que tu veux faire ?
          </SheetTitle>
          <SheetDescription className="text-xs leading-relaxed sm:text-sm">
            Choisis une action sans quitter ta page actuelle.
          </SheetDescription>
        </SheetHeader>

        <div className="quick-create-list mt-4 grid max-h-[calc(82dvh-10rem)] gap-2 overflow-y-auto overscroll-contain pr-1 sm:mt-6 sm:max-h-none sm:gap-3 sm:overflow-visible sm:pr-0">
          {actions.map((action) => {
            const Icon = action.icon;
            const target = action.auth && !user ? "/auth" : action.to;
            return (
              <Link
                key={action.to}
                to={target as any}
                onClick={() => setOpen(false)}
                className="group flex min-h-[72px] items-center gap-3 rounded-2xl border border-border/70 bg-background/70 p-3 text-left transition hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-soft active:translate-y-0 sm:min-h-0 sm:gap-4 sm:p-4"
              >
                <div
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br sm:h-12 sm:w-12",
                    action.accent,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground sm:text-base">
                    {action.title}
                  </div>
                  <div className="mt-0.5 text-xs leading-snug text-muted-foreground sm:text-sm">
                    {action.description}
                  </div>
                </div>
                <span className="text-lg text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary">
                  →
                </span>
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
