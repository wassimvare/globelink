import fs from "node:fs";

const targets = [
  {
    path: new URL("../src/routes/activities.$slug.tsx", import.meta.url),
    name: "activity",
    apply(source) {
      if (source.includes("ADD_TO_TRIP_EVERYWHERE_V1_ACTIVITY")) return source;
      source = source.replace(
        'import { CatalogImage } from "@/components/CatalogImage";',
        'import { CatalogImage } from "@/components/CatalogImage";\nimport { AddToTripButton } from "@/components/AddToTripButton";\n// ADD_TO_TRIP_EVERYWHERE_V1_ACTIVITY',
      );
      source = source.replace(
        '              {place.description ? (',
        `              <AddToTripButton
                item={{
                  title: place.name,
                  city: place.city ?? null,
                  country: place.country ?? null,
                  lat: place.latitude ?? null,
                  lng: place.longitude ?? null,
                  kind: place.kind || place.category || "activity",
                  rating: place.rating != null ? Number(place.rating) : null,
                  source: place.isExternal ? place.provider || "Source partenaire" : "GlobeLink",
                  sourceUrl: place.source_url ?? null,
                }}
                variant="default"
                className="mt-5 w-full rounded-full sm:w-auto"
              />
              {place.description ? (`,
      );
      return source;
    },
  },
  {
    path: new URL("../src/routes/deals.$slug.tsx", import.meta.url),
    name: "deal",
    apply(source) {
      if (source.includes("ADD_TO_TRIP_EVERYWHERE_V1_DEAL")) return source;
      source = source.replace(
        'import { CatalogImage } from "@/components/CatalogImage";',
        'import { CatalogImage } from "@/components/CatalogImage";\nimport { AddToTripButton } from "@/components/AddToTripButton";\n// ADD_TO_TRIP_EVERYWHERE_V1_DEAL',
      );
      source = source.replace(
        '            <div className="mt-7 flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">',
        `            <AddToTripButton
              item={{
                title: deal.title,
                city: deal.city,
                country: deal.country,
                lat: deal.latitude,
                lng: deal.longitude,
                kind: deal.kind,
                rating: deal.rating,
                source: catalogSourceLabel(deal),
                sourceUrl: deal.source_url,
              }}
              variant="default"
              className="mt-6 w-full rounded-full sm:w-auto"
            />

            <div className="mt-7 flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">`,
      );
      return source;
    },
  },
  {
    path: new URL("../src/routes/destinations.$slug.tsx", import.meta.url),
    name: "destination",
    apply(source) {
      if (source.includes("ADD_TO_TRIP_EVERYWHERE_V1_DESTINATION")) return source;
      source = source.replace(
        'import { Button } from "@/components/ui/button";',
        'import { Button } from "@/components/ui/button";\nimport { AddToTripButton } from "@/components/AddToTripButton";\n// ADD_TO_TRIP_EVERYWHERE_V1_DESTINATION',
      );
      source = source.replace(
        `              <Button asChild className="rounded-full bg-white text-slate-950 hover:bg-white/90">
                <Link to="/map">
                  <MapIcon className="mr-2 h-4 w-4" />
                  Explorer la carte
                </Link>
              </Button>`,
        `              <Button asChild className="rounded-full bg-white text-slate-950 hover:bg-white/90">
                <Link to="/map">
                  <MapIcon className="mr-2 h-4 w-4" />
                  Explorer la carte
                </Link>
              </Button>
              <AddToTripButton
                item={{
                  title,
                  city: catalogCity,
                  country,
                  lat: latitude,
                  lng: longitude,
                  kind: "stop",
                  source: "Destination GlobeLink",
                }}
                label="Ajouter cette destination"
                variant="outline"
                className="rounded-full border-white/40 bg-black/20 text-white hover:bg-white/10 hover:text-white"
              />`,
      );
      source = source.replace(
        `            return item.kind === "deal" ? (
              <Link
                key={item.id}
                to="/deals/$slug"
                params={{ slug: item.slug }}
                className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
              >
                {card}
              </Link>
            ) : (
              <Link
                key={item.id}
                to="/activities/$slug"
                params={{ slug: item.slug }}
                className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
              >
                {card}
              </Link>
            );`,
        `            return (
              <div key={item.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                {item.kind === "deal" ? (
                  <Link
                    to="/deals/$slug"
                    params={{ slug: item.slug }}
                    className="group block overflow-hidden"
                  >
                    {card}
                  </Link>
                ) : (
                  <Link
                    to="/activities/$slug"
                    params={{ slug: item.slug }}
                    className="group block overflow-hidden"
                  >
                    {card}
                  </Link>
                )}
                <div className="border-t border-border/70 p-2">
                  <AddToTripButton
                    item={{
                      title: item.title,
                      city: item.city ?? fallbackCity ?? null,
                      country: item.country ?? fallbackCountry ?? null,
                      lat: item.latitude,
                      lng: item.longitude,
                      kind: item.kind,
                      rating: item.rating,
                      source: item.provider,
                      sourceUrl: item.source_url,
                    }}
                    compact
                    size="sm"
                    variant="ghost"
                    className="w-full rounded-xl"
                  />
                </div>
              </div>
            );`,
      );
      return source;
    },
  },
  {
    path: new URL("../src/components/PostCard.tsx", import.meta.url),
    name: "post",
    apply(source) {
      if (source.includes("ADD_TO_TRIP_EVERYWHERE_V1_POST")) return source;
      source = source.replace(
        '} from "@/components/ui/dropdown-menu";',
        '} from "@/components/ui/dropdown-menu";\nimport { AddToTripButton } from "@/components/AddToTripButton";\n// ADD_TO_TRIP_EVERYWHERE_V1_POST',
      );
      source = source.replace(
        '        {post.caption && (',
        `        {(post.city || post.country || post.activity) && (
          <div className="mt-3">
            <AddToTripButton
              item={{
                title: post.activity || [post.city, post.country].filter(Boolean).join(", ") || "Lieu partagé sur GlobeLink",
                city: post.city,
                country: post.country,
                kind: post.activity ? "activity" : "stop",
                source: "Publication GlobeLink",
                notes: post.caption ? post.caption.slice(0, 300) : null,
              }}
              size="sm"
              variant="secondary"
              label={post.activity ? "Ajouter cette activité à mon voyage" : "Ajouter ce lieu à mon voyage"}
              className="w-full rounded-xl"
            />
          </div>
        )}
        {post.caption && (`,
      );
      return source;
    },
  },
];

let changed = 0;
for (const target of targets) {
  const before = fs.readFileSync(target.path, "utf8");
  const after = target.apply(before);
  if (after !== before) {
    fs.writeFileSync(target.path, after);
    changed += 1;
    console.log(`[GlobeLink] Add-to-trip enabled on ${target.name}.`);
  }
}
console.log(`[GlobeLink] Add-to-trip everywhere: ${changed} surface(s) updated.`);
