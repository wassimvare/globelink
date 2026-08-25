import { createFileRoute } from "@tanstack/react-router";
import { InfoDocumentPage } from "@/components/InfoDocumentPage";

export const Route = createFileRoute("/community-guidelines")({
  head: () => ({ meta: [{ title: "Règles de la communauté — GlobeLink" }] }),
  component: CommunityGuidelinesPage,
});

function CommunityGuidelinesPage() {
  return (
    <InfoDocumentPage
      eyebrow="Sécurité de la communauté"
      title="Règles de la communauté"
      intro="GlobeLink est un espace pour partager des voyages, découvrir des lieux et rencontrer d’autres voyageurs. Ces règles protègent les membres et la qualité des contenus."
      sections={[
        {
          title: "Respecter les autres",
          bullets: [
            "Pas de harcèlement, intimidation, menaces ou attaques ciblées.",
            "Pas de discrimination ou de contenu haineux visant une personne ou un groupe.",
            "Respecte les limites, la vie privée et le consentement des autres voyageurs.",
          ],
        },
        {
          title: "Publier du contenu authentique",
          bullets: [
            "Ne te fais pas passer pour une autre personne ou une entreprise que tu ne représentes pas.",
            "N’utilise pas GlobeLink pour diffuser des arnaques, du spam ou des offres trompeuses.",
            "Évite les informations volontairement fausses sur un lieu, un établissement ou une expérience de voyage.",
          ],
        },
        {
          title: "Protéger la sécurité et la vie privée",
          bullets: [
            "Ne publie pas de données personnelles sensibles d’un tiers sans son accord.",
            "N’encourage pas des comportements dangereux, illégaux ou susceptibles de mettre quelqu’un en danger.",
            "Utilise les outils de blocage, restriction et signalement lorsqu’une interaction devient problématique.",
          ],
        },
        {
          title: "Travel Match et messages",
          bullets: [
            "Travel Match est réservé aux utilisateurs majeurs lorsque la fonctionnalité l’exige.",
            "Un match ou une réponse ne crée jamais une obligation de poursuivre une conversation ou une rencontre.",
            "Les demandes insistantes, le harcèlement et les sollicitations commerciales non demandées peuvent être sanctionnés.",
          ],
        },
        {
          title: "Modération",
          paragraphs: [
            "GlobeLink peut examiner les contenus et comptes signalés, limiter leur visibilité, supprimer un contenu ou suspendre un compte lorsque les règles ne sont pas respectées. Un signalement n’entraîne pas automatiquement une sanction : il déclenche un examen.",
          ],
        },
      ]}
    />
  );
}
