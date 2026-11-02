import { AIReadableAnswer } from "@/components/AIReadableAnswer";
import { AIContextActions } from "@/components/AIContextActions";
import { DEPARTURE_PREPARATION_PROMPT, latestDepartureReport } from "@/features/ai/departure-preparation";
import { FileText, HeartPulse, Luggage, ShieldCheck } from "lucide-react";

const categories = [
  { icon: FileText, title: "Documents et formalités", items: ["Passeport ou carte d'identité accepté(e)", "Visa, autorisation électronique ou transit, si requis", "Validité des documents et copies de secours"] },
  { icon: HeartPulse, title: "Santé et assistance", items: ["Assurance voyage et assistance", "Vaccins, médicaments et ordonnances à vérifier", "Contacts médicaux et d'urgence"] },
  { icon: ShieldCheck, title: "Sécurité et choses à éviter", items: ["Zones et situations déconseillées", "Arnaques, lois et interdictions locales", "Usages et comportements à respecter"] },
  { icon: Luggage, title: "Pratique", items: ["Réservations et billets", "Paiement, communications et connexion mobile", "Bagages et objets réglementés"] },
] as const;

type Props = {
  tripId: string;
  destination: string;
  notes: string | null;
};

export function TripDeparturePreparation({ tripId, destination, notes }: Props) {
  const report = latestDepartureReport(notes);

  return (
    <section className="mt-5 rounded-3xl border border-border/70 bg-card p-4 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <ShieldCheck className="h-4 w-4" /> Préparation du voyage
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold">Avant de partir</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            L'essentiel à vérifier pour {destination || "ton prochain voyage"}. IA+ peut préparer une fiche
            adaptée à la destination et aux dates, avec les documents nécessaires, les précautions et les sources disponibles.
          </p>
        </div>
        <AIContextActions
          showFree={false}
          freePrompt=""
          proPrompt={DEPARTURE_PREPARATION_PROMPT}
          proMode="safety"
          tripId={tripId}
          proLabel={report ? "Actualiser avec IA+" : "Préparer avec IA+"}
          compact
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {categories.map(({ icon: Icon, title, items }) => (
          <div key={title} className="rounded-2xl border border-border/60 bg-background/55 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="h-4 w-4 text-primary" /> {title}
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              {items.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Liste indicative : les exigences exactes dépendent notamment de la nationalité, du document de voyage,
        de la destination et des escales. Vérifie-les auprès des autorités compétentes avant de réserver ou partir.
      </p>

      {report ? (
        <details className="mt-4 rounded-2xl border border-violet-400/25 bg-violet-500/[0.05] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-primary">
            Voir ma fiche IA+ enregistrée
          </summary>
          <div className="mt-4 border-t border-border/60 pt-3">
            <AIReadableAnswer content={report} />
          </div>
        </details>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Aucune fiche IA+ enregistrée pour le moment. Tu pourras enregistrer la réponse directement dans ce carnet.
        </p>
      )}
    </section>
  );
}
