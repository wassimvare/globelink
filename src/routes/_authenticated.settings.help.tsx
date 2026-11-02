import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, PlayCircle } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { HelpCenter } from "@/components/HelpCenter";
import { SupportConversations } from "@/components/SupportConversations";
import { Button } from "@/components/ui/button";
import { startGuidedTour } from "@/lib/guided-tour";

export const Route = createFileRoute("/_authenticated/settings/help")({
  head: () => ({
    meta: [
      { title: "Aide et support — GlobeLink" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: HelpSettingsPage,
});

function HelpSettingsPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-9">
        <Link
          to="/settings"
          className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour aux paramètres
        </Link>
        <section className="mb-5 rounded-[1.75rem] border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-accent/5 p-5 shadow-soft sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <PlayCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl font-bold">Tutoriel GlobeLink</h1>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Revois le guide interactif pour retrouver rapidement les fonctions principales.
              </p>
            </div>
            <Button type="button" onClick={startGuidedTour} className="rounded-xl">
              Revoir le tutoriel
            </Button>
          </div>
        </section>
        <SupportConversations />
        <HelpCenter />
      </main>
    </div>
  );
}
