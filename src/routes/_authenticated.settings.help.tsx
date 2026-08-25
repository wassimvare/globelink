import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { HelpCenter } from "@/components/HelpCenter";

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
        <HelpCenter />
      </main>
    </div>
  );
}
