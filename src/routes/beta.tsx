import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, MessageCircle, TestTube2 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/beta")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Bêta privée — GlobeLink" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Accès à la bêta privée GlobeLink.",
      },
    ],
  }),
  component: BetaEntryPage,
});

function BetaEntryPage() {
  const { user } = useAuth();

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background px-4 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
      <div className="auth-ambient pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <main className="relative mx-auto flex min-h-[90dvh] max-w-3xl flex-col justify-center">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-2xl shadow-soft">
            <BrandLogo className="h-full w-full" priority />
          </div>
          <div>
            <div className="font-display text-xl font-bold">GlobeLink</div>
            <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Bêta privée</div>
          </div>
        </div>

        <section className="mt-10 rounded-[2rem] border border-primary/20 bg-card/90 p-6 shadow-elevated backdrop-blur sm:p-9">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
            <TestTube2 className="h-4 w-4" /> Vague 1
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-5xl">Teste GlobeLink comme un vrai utilisateur.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            On ne va pas t’expliquer où cliquer. Utilise simplement l’application comme tu le ferais normalement : ce qui est évident doit rester évident, et ce qui ne l’est pas doit nous être signalé.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Rule icon={CheckCircle2} title="Utilise normalement" text="Ne cherche pas à tout tester. Fais ce qui te semble naturel." />
            <Rule icon={MessageCircle} title="Dis ce qui bloque" text="Un bouton Bêta reste disponible dans l’app pour envoyer un retour rapide." />
            <Rule icon={TestTube2} title="Pas de bonne réponse" text="Si tu ne comprends pas quelque chose, c’est une information utile pour nous." />
          </div>

          <Button asChild size="lg" className="mt-8 h-12 w-full rounded-2xl sm:w-auto sm:min-w-56">
            <Link to={user ? "/" : "/auth"} search={user ? undefined : { redirect: "/" }}>
              {user ? "Entrer dans GlobeLink" : "Créer mon compte de test"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>

          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            Les retours bêta enregistrent uniquement le texte envoyé, le type de problème, la page et la taille d’écran afin de reproduire le problème. Aucun mot de passe ni contenu privé n’est joint automatiquement.
          </p>
        </section>
      </main>
    </div>
  );
}

function Rule({ icon: Icon, title, text }: { icon: typeof TestTube2; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-background/50 p-4">
      <Icon className="h-5 w-5 text-primary" />
      <h2 className="mt-3 text-sm font-bold">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
    </article>
  );
}
