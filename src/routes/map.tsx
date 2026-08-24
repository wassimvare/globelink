import { createFileRoute } from "@tanstack/react-router";
import { VerifiedTravelMapPage } from "@/components/VerifiedTravelMapPage";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Carte du monde — GlobeLink" },
      {
        name: "description",
        content: "Restaurants, hôtels, activités et événements issus de sources vérifiées sur la carte GlobeLink.",
      },
    ],
  }),
  component: VerifiedTravelMapPage,
});
