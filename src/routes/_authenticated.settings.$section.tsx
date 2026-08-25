import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { SettingsHub, type SettingsHubSection } from "@/components/SettingsHub";
import { SocialPrivacySettings } from "@/components/SocialPrivacySettings";

const sections = {
  privacy: {
    title: "Confidentialité",
    description: "Contrôlez la visibilité et la découverte de votre profil.",
    social: false,
  },
  interactions: {
    title: "Messages et interactions",
    description: "Messages, commentaires, mentions, identifications, stories et comptes en sourdine.",
    social: true,
  },
  notifications: {
    title: "Notifications",
    description: "Choisissez les alertes que vous souhaitez voir dans GlobeLink.",
    social: false,
  },
  accounts: {
    title: "Comptes bloqués et restreints",
    description: "Gérez les personnes bloquées ou retirées de vos suggestions.",
    social: false,
  },
  "travel-match": {
    title: "Travel Match",
    description: "Réglez votre visibilité et les profils proposés dans Travel Match.",
    social: false,
  },
  travel: {
    title: "Voyage et localisation",
    description: "Budget, centres d’intérêt, carte et géolocalisation.",
    social: false,
  },
} as const;

type SectionKey = keyof typeof sections;

export const Route = createFileRoute("/_authenticated/settings/$section")({
  head: ({ params }) => {
    const section = sections[params.section as SectionKey];
    return {
      meta: [
        { title: `${section?.title ?? "Paramètres"} — GlobeLink` },
        { name: "robots", content: "noindex, nofollow" },
      ],
    };
  },
  component: SettingsSectionPage,
});

function SettingsSectionPage() {
  const { section: rawSection } = Route.useParams();
  const config = sections[rawSection as SectionKey];

  if (!config) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-[2rem] border border-border bg-card p-6 text-center shadow-soft">
            <h1 className="font-display text-2xl">Réglage introuvable</h1>
            <Link
              to="/settings"
              preload="intent"
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Retour aux paramètres
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const section = rawSection as SettingsHubSection;

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-9">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Paramètres et confidentialité</p>
          <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">{config.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{config.description}</p>
        </div>

        <SettingsHub activeSection={section} />
        {config.social && <SocialPrivacySettings />}
      </main>
    </div>
  );
}
