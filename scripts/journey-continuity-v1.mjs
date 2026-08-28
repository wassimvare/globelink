import fs from "node:fs";

function update(path, transform) {
  const file = new URL(`../${path}`, import.meta.url);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    console.log(`[Journey V1] ${path}: continuité ajoutée`);
  } else {
    console.log(`[Journey V1] ${path}: déjà conforme`);
  }
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`[Journey V1] Bloc introuvable: ${label}`);
  return source.replace(search, replacement);
}

update("src/routes/_authenticated.trips.$id.tsx", (source) => {
  if (source.includes("JOURNEY_CONTINUITY_V1_TRIP")) return source;

  source = replaceRequired(
    source,
    'import { AIContextActions } from "@/components/AIContextActions";\n// AI_CONTEXT_LAYER_V1_TRIP',
    'import { AIContextActions } from "@/components/AIContextActions";\nimport { TripJourneyRail } from "@/components/TripJourneyRail";\n// AI_CONTEXT_LAYER_V1_TRIP\n// JOURNEY_CONTINUITY_V1_TRIP',
    "import rail du voyage",
  );

  source = replaceRequired(
    source,
    `        {!finalized && (\n          <section className="mt-4 overflow-hidden rounded-3xl border border-violet-400/20`,
    `        <TripJourneyRail\n          tripId={id}\n          tripTitle={trip.title}\n          city={trip.city}\n          country={trip.country}\n          startsOn={trip.starts_on}\n          endsOn={trip.ends_on}\n          entryCount={entries?.length ?? 0}\n        />\n\n        {!finalized && (\n          <section className="mt-4 overflow-hidden rounded-3xl border border-violet-400/20`,
    "rail après le résumé du voyage",
  );

  return source;
});

update("src/routes/ai-pro.tsx", (source) => {
  if (source.includes("JOURNEY_CONTINUITY_V1_AI_PRO")) return source;
  if (!source.includes("AI_CONTEXT_LAYER_V1_PRO")) {
    throw new Error("[Journey V1] IA+ contextuelle doit être appliquée avant la continuité.");
  }

  source = replaceRequired(
    source,
    '      <main className="page-container pb-24 pt-4 sm:pt-7">\n        {user && entitlement.isLoading ? (',
    `      <main className="page-container pb-24 pt-4 sm:pt-7">\n        {/* JOURNEY_CONTINUITY_V1_AI_PRO */}\n        {tripId && (\n          <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-violet-400/20 bg-gradient-to-r from-violet-500/[0.08] to-cyan-500/[0.05] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">\n            <div className="min-w-0">\n              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-500">Voyage connecté</p>\n              <p className="mt-1 truncate text-sm font-semibold">\n                IA+ travaille sur {tripQuery.data?.title ?? "ce carnet précis"}.\n              </p>\n              <p className="mt-0.5 text-xs text-muted-foreground">\n                Le contexte du voyage reste sélectionné pendant cette session.\n              </p>\n            </div>\n            <Button asChild size="sm" variant="outline" className="shrink-0 rounded-full">\n              <Link to="/trips/$id" params={{ id: tripId }}>\n                <Notebook className="mr-2 h-4 w-4" /> Retour au carnet\n              </Link>\n            </Button>\n          </section>\n        )}\n\n        {user && entitlement.isLoading ? (`,
    "retour carnet IA+",
  );

  return source;
});

update("src/routes/_authenticated.match.tsx", (source) => {
  if (source.includes("JOURNEY_CONTINUITY_V1_MATCH")) return source;
  if (!source.includes("TRAVEL_MATCH_V3")) {
    throw new Error("[Journey V1] Travel Match V3 doit être appliqué avant la continuité.");
  }

  source = replaceRequired(
    source,
    'import { useEffect, useMemo, useRef, useState } from "react";',
    'import { useEffect, useMemo, useRef, useState } from "react";\nimport { z } from "zod";\n// JOURNEY_CONTINUITY_V1_MATCH',
    "zod Travel Match",
  );

  source = replaceRequired(
    source,
    'export const Route = createFileRoute("/_authenticated/match")({',
    `const matchJourneySearch = z.object({\n  tripId: z.string().uuid().optional(),\n  destination: z.string().max(180).optional(),\n  startsOn: z.string().max(10).optional(),\n  endsOn: z.string().max(10).optional(),\n});\n\nexport const Route = createFileRoute("/_authenticated/match")({`,
    "schema contexte Match",
  );

  source = replaceRequired(
    source,
    '  component: MatchPage,\n});',
    '  validateSearch: (search) => matchJourneySearch.parse(search),\n  component: MatchPage,\n});',
    "validation contexte Match",
  );

  source = replaceRequired(
    source,
    'function MatchPage() {\n  const { user } = useAuth();\n  const navigate = useNavigate();\n  const qc = useQueryClient();',
    `function MatchPage() {\n  const { tripId, destination, startsOn, endsOn } = Route.useSearch();\n  const { user } = useAuth();\n  const navigate = useNavigate();\n  const qc = useQueryClient();\n\n  const { data: journeyTrip } = useQuery({\n    queryKey: ["match-journey-trip", user?.id, tripId],\n    enabled: !!user && !!tripId,\n    staleTime: 60_000,\n    queryFn: async () => {\n      const { data, error } = await supabase\n        .from("trips")\n        .select("id,title,city,country,starts_on,ends_on,budget")\n        .eq("id", tripId!)\n        .eq("user_id", user!.id)\n        .maybeSingle();\n      if (error) throw error;\n      return data;\n    },\n  });`,
    "lecture du voyage Match",
  );

  source = replaceRequired(
    source,
    `  useEffect(() => {\n    setPrefs((current) => ({\n      ...current,\n      ageMin: accountSettings.travel_match_age_min,\n      ageMax: accountSettings.travel_match_age_max,\n      interests: accountSettings.travel_interests.length\n        ? accountSettings.travel_interests\n        : current.interests,\n    }));\n  }, [accountSettings]);`,
    `  useEffect(() => {\n    setPrefs((current) => ({\n      ...current,\n      ageMin: accountSettings.travel_match_age_min,\n      ageMax: accountSettings.travel_match_age_max,\n      interests: accountSettings.travel_interests.length\n        ? accountSettings.travel_interests\n        : current.interests,\n    }));\n  }, [accountSettings]);\n\n  useEffect(() => {\n    const journeyDestination =\n      destination?.trim() || [journeyTrip?.city, journeyTrip?.country].filter(Boolean).join(", ");\n    const journeyStart = startsOn || journeyTrip?.starts_on || null;\n    const journeyEnd = endsOn || journeyTrip?.ends_on || null;\n    const journeyBudget = Number(journeyTrip?.budget || 0);\n    if (!journeyDestination && !journeyStart && !journeyEnd && !journeyBudget) return;\n\n    setPrefs((current) => ({\n      ...current,\n      destination: journeyDestination || current.destination,\n      budget: journeyBudget > 0 ? journeyBudget : current.budget,\n      startsOn: journeyStart || current.startsOn,\n      endsOn: journeyEnd || current.endsOn,\n    }));\n  }, [destination, endsOn, journeyTrip, startsOn]);`,
    "préférences du voyage Match",
  );

  source = replaceRequired(
    source,
    '      <main className="mx-auto max-w-lg px-4 py-5">\n        <div className="surface-card mb-4 flex items-center justify-between gap-3 rounded-[1.6rem] p-4">',
    `      <main className="mx-auto max-w-lg px-4 py-5">\n        {tripId && (\n          <section className="mb-4 rounded-[1.6rem] border border-primary/20 bg-primary/[0.06] p-4">\n            <div className="flex items-start justify-between gap-3">\n              <div className="min-w-0">\n                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Match pour ton voyage</p>\n                <p className="mt-1 truncate text-sm font-bold">{journeyTrip?.title ?? destination ?? "Voyage GlobeLink"}</p>\n                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">\n                  Destination, dates et budget du carnet sont utilisés pour classer les voyageurs les plus compatibles.\n                </p>\n              </div>\n              <MapPin className="h-5 w-5 shrink-0 text-primary" />\n            </div>\n            <Button asChild size="sm" variant="outline" className="mt-3 rounded-full">\n              <Link to="/trips/$id" params={{ id: tripId }}>Retour au carnet</Link>\n            </Button>\n          </section>\n        )}\n\n        <div className="surface-card mb-4 flex items-center justify-between gap-3 rounded-[1.6rem] p-4">`,
    "bannière voyage Match",
  );

  return source;
});

update("src/routes/map.tsx", (source) => {
  if (source.includes("JOURNEY_CONTINUITY_V1_MAP")) return source;
  if (!source.includes("EXPLORER_TRAVEL_MAP_V1")) {
    throw new Error("[Journey V1] Explorer travel map doit être appliqué avant la continuité.");
  }

  source = replaceRequired(
    source,
    '// EXPLORER_TRAVEL_MAP_V1',
    '// EXPLORER_TRAVEL_MAP_V1\n// JOURNEY_CONTINUITY_V1_MAP',
    "marqueur Explorer",
  );

  source = replaceRequired(
    source,
    '        toast.message("Ce lieu est déjà dans ce voyage");',
    `        toast.message("Ce lieu est déjà dans ce voyage", {\n          description: "Ouvre le carnet pour continuer l’organisation.",\n          action: {\n            label: "Ouvrir le voyage",\n            onClick: () => window.location.assign("/trips/" + trip.id),\n          },\n        });`,
    "continuer après doublon Explorer",
  );

  source = replaceRequired(
    source,
    '      toast.success("Ajouté à " + trip.title);',
    `      toast.success("Ajouté à " + trip.title, {\n        description: "Le lieu est maintenant dans ton carnet.",\n        action: {\n          label: "Ouvrir le voyage",\n          onClick: () => window.location.assign("/trips/" + trip.id),\n        },\n      });`,
    "continuer après ajout Explorer",
  );

  return source;
});

console.log(
  "[Journey V1] Explorer → carnet → IA+ → Travel Match → retour carnet connecté.",
);
