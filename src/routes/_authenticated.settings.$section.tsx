import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { SettingsHub } from "@/components/SettingsHub";
import { SocialPrivacySettings } from "@/components/SocialPrivacySettings";

const sections = {
  privacy: {
    id: "privacy-settings",
    title: "Confidentialité",
    description: "Contrôlez la visibilité et la découverte de votre profil.",
    keepSave: false,
    social: false,
  },
  interactions: {
    id: "interaction-settings",
    title: "Messages et interactions",
    description: "Messages, commentaires, mentions, identifications, stories et comptes en sourdine.",
    keepSave: true,
    social: true,
  },
  notifications: {
    id: "notification-settings",
    title: "Notifications",
    description: "Choisissez les alertes que vous souhaitez voir dans GlobeLink.",
    keepSave: false,
    social: false,
  },
  accounts: {
    id: "account-controls",
    title: "Comptes bloqués et restreints",
    description: "Gérez les personnes bloquées ou retirées de vos suggestions.",
    keepSave: false,
    social: false,
  },
  "travel-match": {
    id: "travel-match-settings",
    title: "Travel Match",
    description: "Réglez votre visibilité et les profils proposés dans Travel Match.",
    keepSave: true,
    social: false,
  },
  travel: {
    id: "travel-preferences",
    title: "Voyage et localisation",
    description: "Budget, centres d’intérêt, carte et géolocalisation.",
    keepSave: true,
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
            <Link to="/settings" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Retour aux paramètres
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-9">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Paramètres et confidentialité</p>
          <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">{config.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{config.description}</p>
        </div>

        <div className={`settings-category-view ${config.keepSave ? "keep-save" : "hide-save"}`}>
          <SettingsHub />
        </div>

        {config.social && <SocialPrivacySettings />}

        <style>{`
          .settings-category-view > div > section { display: none !important; }
          .settings-category-view > div > #${config.id} { display: block !important; }
          .settings-category-view.hide-save > div > .sticky { display: none !important; }
          .settings-category-view > div { gap: 0 !important; }
        `}</style>
      </main>
    </div>
  );
}
