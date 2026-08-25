import { createFileRoute } from "@tanstack/react-router";
import { InfoDocumentPage } from "@/components/InfoDocumentPage";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "À propos — GlobeLink" }] }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <InfoDocumentPage
      eyebrow="GlobeLink"
      title="À propos de GlobeLink"
      intro="GlobeLink réunit réseau social, découverte de destinations, carte mondiale, Travel Match et outils de préparation de voyage dans une seule expérience."
      sections={[
        {
          title: "Notre objectif",
          paragraphs: [
            "Aider les voyageurs à découvrir des lieux fiables, partager leurs expériences, préparer leurs déplacements et rencontrer d’autres personnes qui ont des projets de voyage compatibles.",
          ],
        },
        {
          title: "Ce que propose GlobeLink",
          bullets: [
            "Un fil social avec publications, stories et interactions.",
            "Une carte pour explorer hôtels, restaurants, activités, offres et voyageurs selon les réglages du compte.",
            "Travel Match pour découvrir des voyageurs compatibles.",
            "Des carnets, intentions et préférences de voyage.",
            "Des outils de confidentialité, blocage, modération, support et gestion des données du compte.",
          ],
        },
        {
          title: "Version actuelle",
          paragraphs: [
            "Version 11.0.13-beta.1 — phase de pré-lancement. GlobeLink continue d’évoluer avant son ouverture à une communauté plus large.",
          ],
        },
        {
          title: "Aide et retours",
          paragraphs: [
            "Les retours utilisateurs servent directement à améliorer GlobeLink. Pour signaler un bug, suggérer une amélioration ou demander de l’aide, utilise Paramètres > Aide et support.",
          ],
        },
      ]}
    />
  );
}
