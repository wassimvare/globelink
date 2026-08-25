import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { SettingsMenu } from "@/components/SettingsMenu";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Paramètres et confidentialité — GlobeLink" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SettingsIndexPage,
});

function SettingsIndexPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-9">
        <SettingsMenu />
      </main>
    </div>
  );
}
