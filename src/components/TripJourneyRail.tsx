import { Link } from "@tanstack/react-router";
import { Check, Compass, Crown, Notebook, UsersRound } from "lucide-react";

type Props = {
  tripId: string;
  tripTitle: string;
  city?: string | null;
  country?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  entryCount?: number;
};

export function TripJourneyRail({
  tripId,
  tripTitle,
  city,
  country,
  startsOn,
  endsOn,
  entryCount = 0,
}: Props) {
  const destination = [city, country].filter(Boolean).join(", ");
  const aiPrompt = `Analyse le voyage « ${tripTitle} » dans mon carnet GlobeLink et aide-moi à améliorer l’itinéraire, les journées, les trajets et le budget.`;

  return (
    <section className="border-t border-border/80 bg-background/70 p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            Ton parcours GlobeLink
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Continue ton voyage sans perdre le contexte.
          </p>
        </div>
        {entryCount > 0 && (
          <span className="hidden rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 sm:inline dark:text-emerald-300">
            {entryCount} élément{entryCount > 1 ? "s" : ""} dans le carnet
          </span>
        )}
      </div>

      <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0">
        <JourneyLink
          to="/map"
          number="1"
          title="Explorer"
          text={entryCount > 0 ? "Continuer à découvrir" : "Trouver des lieux"}
          icon={Compass}
          complete={entryCount > 0}
        />
        <JourneyCurrent number="2" title="Carnet" text="Tu es ici" icon={Notebook} />
        <JourneyLink
          to="/ai-pro"
          search={{
            prompt: aiPrompt,
            mode: "plan",
            tripId,
          }}
          number="3"
          title="IA+"
          text="Optimiser ce voyage"
          icon={Crown}
          accent
        />
        <JourneyLink
          to="/match"
          search={{
            tripId,
            destination: destination || undefined,
            startsOn: startsOn || undefined,
            endsOn: endsOn || undefined,
          }}
          number="4"
          title="Travel Match"
          text="Rencontrer sur place"
          icon={UsersRound}
        />
      </div>
    </section>
  );
}

function JourneyCurrent({
  number,
  title,
  text,
  icon: Icon,
}: {
  number: string;
  title: string;
  text: string;
  icon: typeof Compass;
}) {
  return (
    <div className="min-w-[155px] snap-start rounded-2xl border border-primary/35 bg-primary/[0.08] p-3 sm:min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-primary">{number}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 text-sm font-bold">{title}</div>
      <div className="mt-0.5 text-[10px] font-medium text-primary">{text}</div>
    </div>
  );
}

function JourneyLink({
  to,
  search,
  number,
  title,
  text,
  icon: Icon,
  complete = false,
  accent = false,
}: {
  to: string;
  search?: Record<string, string | undefined>;
  number: string;
  title: string;
  text: string;
  icon: typeof Compass;
  complete?: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      to={to as any}
      search={search as any}
      className={`group min-w-[155px] snap-start rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:shadow-soft sm:min-w-0 ${
        accent
          ? "border-violet-400/25 bg-gradient-to-br from-violet-500/[0.08] to-cyan-500/[0.05] hover:border-violet-400/45"
          : "border-border bg-card hover:border-primary/30"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-muted-foreground">{number}</span>
        {complete ? (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
            <Check className="h-3 w-3" />
          </span>
        ) : (
          <Icon className={`h-4 w-4 ${accent ? "text-violet-500" : "text-primary"}`} />
        )}
      </div>
      <div className="mt-2 text-sm font-bold group-hover:text-primary">{title}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{text}</div>
    </Link>
  );
}
