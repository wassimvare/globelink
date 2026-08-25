import { createFileRoute } from "@tanstack/react-router";
import { InfoDocumentPage } from "@/components/InfoDocumentPage";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Conditions d’utilisation — GlobeLink" }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <InfoDocumentPage
      eyebrow="Conditions du service"
      title="Conditions d’utilisation"
      intro="En utilisant GlobeLink, tu acceptes de respecter ces règles de base ainsi que les Règles de la communauté."
      sections={[
        {
          title: "Utilisation du service",
          bullets: [
            "Tu dois fournir des informations raisonnablement exactes et protéger l’accès à ton compte.",
            "Tu dois respecter l’âge minimum applicable dans ton pays. Les fonctions réservées aux adultes, notamment Travel Match lorsqu’elles le précisent, nécessitent d’avoir au moins 18 ans.",
            "Tu ne dois pas utiliser GlobeLink pour contourner la sécurité, perturber le service ou accéder aux données d’un autre utilisateur sans autorisation.",
          ],
        },
        {
          title: "Tes contenus",
          paragraphs: [
            "Tu restes responsable des contenus que tu publies. Tu dois disposer des droits nécessaires pour partager les photos, vidéos, textes et autres éléments que tu mets en ligne.",
            "Tu autorises GlobeLink à héberger, afficher et traiter techniquement ces contenus dans la mesure nécessaire au fonctionnement des fonctionnalités que tu utilises.",
          ],
        },
        {
          title: "Modération et sécurité",
          paragraphs: [
            "GlobeLink peut limiter, retirer ou examiner un contenu et peut restreindre, suspendre ou fermer un compte en cas de violation des règles, de risque pour la sécurité de la plateforme ou d’usage abusif.",
          ],
        },
        {
          title: "Informations de voyage et services tiers",
          paragraphs: [
            "Les informations sur les lieux, hôtels, restaurants, activités ou offres peuvent provenir de partenaires ou de sources externes. Les disponibilités, prix, horaires et conditions peuvent évoluer. Lorsque GlobeLink redirige vers un prestataire tiers, la réservation ou l’achat reste soumis aux conditions de ce prestataire.",
          ],
        },
        {
          title: "Disponibilité du service",
          paragraphs: [
            "GlobeLink évolue régulièrement. Certaines fonctions peuvent être modifiées, interrompues temporairement ou retirées pour maintenance, sécurité ou amélioration du produit.",
          ],
        },
        {
          title: "Compte et résiliation",
          paragraphs: [
            "Tu peux désactiver temporairement ton compte ou lancer sa suppression depuis Paramètres > Compte, données et sécurité. Une suppression définitive est irréversible une fois traitée.",
          ],
        },
      ]}
    />
  );
}
