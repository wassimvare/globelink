import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  ChevronRight,
  Compass,
  Heart,
  LifeBuoy,
  LockKeyhole,
  MessageCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";

const items = [
  {
    href: "/settings/profile",
    label: "Votre compte",
    description: "Photo, pseudo, bio et informations personnelles",
    icon: UserRound,
  },
  {
    href: "/settings/privacy",
    label: "Confidentialité",
    description: "Visibilité et découverte de votre profil",
    icon: LockKeyhole,
  },
  {
    href: "/settings/interactions",
    label: "Messages et interactions",
    description: "Messages, commentaires, mentions, tags, stories et sourdine",
    icon: MessageCircle,
  },
  {
    href: "/settings/notifications",
    label: "Notifications",
    description: "Choisir les alertes que vous souhaitez recevoir",
    icon: Bell,
  },
  {
    href: "/settings/accounts",
    label: "Comptes bloqués et restreints",
    description: "Gérer les comptes bloqués ou restreints",
    icon: ShieldAlert,
  },
  {
    href: "/settings/travel-match",
    label: "Travel Match",
    description: "Visibilité, tranche d’âge et profils vérifiés",
    icon: Heart,
  },
  {
    href: "/settings/travel",
    label: "Voyage et localisation",
    description: "Budget, intérêts, carte et géolocalisation",
    icon: Compass,
  },
  {
    href: "/activity",
    label: "Votre activité",
    description: "Likes, commentaires, contenus, recherches et Travel Match",
    icon: Activity,
  },
  {
    href: "/settings/account",
    label: "Compte, données et sécurité",
    description: "Appareils, export, permissions, désactivation et suppression",
    icon: ShieldCheck,
  },
  {
    href: "/settings/help",
    label: "Aide et support",
    description: "FAQ, bugs, support, signalements, règles et informations GlobeLink",
    icon: LifeBuoy,
  },
] as const;

export function SettingsMenu() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-7">
        <div className="eyebrow">
          <SlidersHorizontal className="h-4 w-4" /> Paramètres GlobeLink
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold sm:text-5xl">Paramètres et confidentialité</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Choisissez une rubrique. Chaque réglage s’ouvre maintenant sur sa propre page.
        </p>
        <div className="relative mt-6">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher dans les paramètres"
            className="h-12 rounded-2xl pl-11"
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-card p-2 shadow-soft sm:p-3">
        <div className="divide-y divide-border/60">
          {filtered.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href as any}
                className="group flex min-h-[82px] items-center gap-4 rounded-2xl px-3 py-4 transition hover:bg-secondary/55 active:scale-[0.995] sm:px-4"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-base font-semibold text-foreground sm:text-lg">
                    <span>{item.label}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{item.description}</p>
                </div>
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Aucun réglage trouvé.</div>
          )}
        </div>
      </section>
    </div>
  );
}
