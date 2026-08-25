import { createFileRoute } from "@tanstack/react-router";
import { InfoDocumentPage } from "@/components/InfoDocumentPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Confidentialité — GlobeLink" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <InfoDocumentPage
      eyebrow="Données et confidentialité"
      title="Politique de confidentialité"
      intro="Cette page explique les principales catégories de données utilisées par GlobeLink et les contrôles disponibles dans l’application."
      sections={[
        {
          title: "Données liées au compte",
          bullets: [
            "Informations d’authentification nécessaires à la création et à la sécurisation du compte.",
            "Informations de profil que tu choisis d’ajouter : pseudo, bio, photo, ville, pays, centres d’intérêt et préférences de voyage.",
            "Réglages de confidentialité, comptes bloqués ou restreints et préférences de notifications.",
          ],
        },
        {
          title: "Contenus et interactions",
          bullets: [
            "Publications, stories, commentaires, réactions, contenus enregistrés et voyages créés dans GlobeLink.",
            "Messages et interactions nécessaires au fonctionnement de la messagerie et de Travel Match.",
            "Signalements et tickets support envoyés volontairement à l’équipe GlobeLink.",
          ],
        },
        {
          title: "Localisation et données techniques",
          paragraphs: [
            "La localisation n’est utilisée que lorsque tu l’autorises. Les réglages GlobeLink permettent de désactiver son utilisation et de choisir entre une position précise ou approximative lorsque le navigateur le permet.",
            "Des informations techniques limitées peuvent être enregistrées lors d’un ticket support, par exemple la version de l’application, la langue et le navigateur, afin de diagnostiquer un bug.",
          ],
        },
        {
          title: "Tes contrôles",
          bullets: [
            "Modifier ton profil et tes préférences depuis Paramètres et confidentialité.",
            "Télécharger un export des données liées à ton compte.",
            "Désactiver temporairement ton compte ou demander sa suppression définitive depuis Compte, données et sécurité.",
            "Gérer les comptes bloqués, les stories masquées, les Amis proches et le statut en ligne.",
          ],
        },
        {
          title: "Conservation et sécurité",
          paragraphs: [
            "Les données sont conservées aussi longtemps qu’elles sont nécessaires au fonctionnement du service, au traitement des demandes et au respect des obligations applicables. La suppression définitive du compte déclenche la suppression des données associées prévues par le système GlobeLink, sous réserve des éléments qui doivent légalement être conservés.",
          ],
        },
        {
          title: "Contacter GlobeLink",
          paragraphs: [
            "Pour une question liée à tes données ou à la confidentialité, utilise Paramètres > Aide et support et choisis la catégorie Compte et connexion ou Autre demande.",
          ],
        },
      ]}
    />
  );
}
