import fs from "node:fs";

function patchFile(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) {
    console.log(`[GlobeLink] ${path} recap patch already applied.`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[GlobeLink] ${path} recap media/map fix applied.`);
}

function replaceRequired(source, needle, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(needle)) throw new Error(`Recap patch failed: ${label}`);
  return source.replace(needle, replacement);
}

patchFile("src/routes/_authenticated.trips.$id.tsx", (input) => {
  let source = input;

  source = replaceRequired(
    source,
    'import { resolvedDestinationCover } from "@/lib/destination-cover";',
    'import { resolvedDestinationCover } from "@/lib/destination-cover";\nimport { getSignedMediaUrl } from "@/lib/storage";',
    "storage import",
  );

  const recapHelper = `// recap-media-map-fix\nasync function geocodeRecapLocation(city?: string | null, country?: string | null) {\n  const query = [city, country].filter(Boolean).join(", ").trim();\n  if (!query) return null;\n  try {\n    const response = await fetch(\n      \`https://geocoding-api.open-meteo.com/v1/search?name=\${encodeURIComponent(query)}&count=5&language=fr&format=json\`,\n    );\n    if (!response.ok) return null;\n    const payload = (await response.json()) as {\n      results?: Array<{ latitude: number; longitude: number; country?: string; name?: string }>;\n    };\n    const requestedCountry = String(country ?? "").trim().toLocaleLowerCase("fr");\n    const result =\n      payload.results?.find((item) =>\n        requestedCountry ? String(item.country ?? "").toLocaleLowerCase("fr").includes(requestedCountry) : true,\n      ) ?? payload.results?.[0];\n    if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return null;\n    return { lat: Number(result.latitude), lng: Number(result.longitude) };\n  } catch {\n    return null;\n  }\n}\n\n`;
  if (!source.includes("// recap-media-map-fix")) {
    source = replaceRequired(source, "function RecapDialog({", `${recapHelper}function RecapDialog({`, "recap geocoder");
  }

  const oldPhotosBlock = `  const photos = useMemo(() => {\n    const all: string[] = [];\n    entries.forEach((entry) => {\n      (entry.media_urls ?? []).forEach((media: string) => all.push(media));\n      if (entry.image_url && !all.includes(entry.image_url)) all.push(entry.image_url);\n    });\n    return all.slice(0, 12);\n  }, [entries]);\n\n  const [slideIdx, setSlideIdx] = useState(0);\n  useEffect(() => {\n    if (!open || photos.length === 0) return;\n    const timer = setInterval(() => setSlideIdx((index) => (index + 1) % photos.length), 2500);\n    return () => clearInterval(timer);\n  }, [open, photos.length]);`;

  const newPhotosBlock = `  const photos = useMemo(() => {\n    const all: string[] = [];\n    entries.forEach((entry) => {\n      (entry.media_urls ?? []).forEach((media: string) => {\n        if (!/\\.(mp4|webm|mov)(?:$|\\?)/i.test(media) && !all.includes(media)) all.push(media);\n      });\n      if (entry.image_url && !all.includes(entry.image_url)) all.push(entry.image_url);\n    });\n    return all.slice(0, 12);\n  }, [entries]);\n  const [resolvedPhotos, setResolvedPhotos] = useState<string[]>([]);\n  const [mapEntries, setMapEntries] = useState<any[]>(entries);\n  const coverFallback = useMemo(\n    () => resolvedDestinationCover(trip?.cover_url, trip?.country, trip?.city),\n    [trip?.cover_url, trip?.country, trip?.city],\n  );\n  const heroImages = resolvedPhotos.length > 0 ? resolvedPhotos : coverFallback ? [coverFallback] : [];\n\n  useEffect(() => {\n    let active = true;\n    if (!open || photos.length === 0) {\n      setResolvedPhotos([]);\n      return () => { active = false; };\n    }\n    void Promise.all(photos.map((photo) => getSignedMediaUrl(photo))).then((urls) => {\n      if (!active) return;\n      setResolvedPhotos(urls.filter((url): url is string => Boolean(url)));\n    });\n    return () => { active = false; };\n  }, [open, photos]);\n\n  useEffect(() => {\n    let active = true;\n    if (!open) return () => { active = false; };\n\n    void (async () => {\n      const enriched = await Promise.all(\n        entries.map(async (entry) => {\n          if (entry.lat != null && entry.lng != null) return entry;\n          if (!entry.city && !entry.country) return entry;\n          const coords = await geocodeRecapLocation(entry.city, entry.country);\n          if (!coords) return entry;\n          void supabase\n            .from("trip_entries")\n            .update(coords)\n            .eq("id", entry.id)\n            .eq("trip_id", trip.id)\n            .then(() => undefined);\n          return { ...entry, ...coords };\n        }),\n      );\n\n      if (!enriched.some((entry) => entry.lat != null && entry.lng != null)) {\n        const fallback = await geocodeRecapLocation(trip.city, trip.country);\n        if (fallback) {\n          enriched.push({\n            id: \`trip-destination-\${trip.id}\`,\n            title: trip.title,\n            city: trip.city,\n            country: trip.country,\n            ...fallback,\n          });\n        }\n      }\n\n      if (active) setMapEntries(enriched);\n    })();\n\n    return () => { active = false; };\n  }, [open, entries, trip.id, trip.title, trip.city, trip.country]);\n\n  const [slideIdx, setSlideIdx] = useState(0);\n  useEffect(() => {\n    setSlideIdx(0);\n    if (!open || heroImages.length <= 1) return;\n    const timer = setInterval(() => setSlideIdx((index) => (index + 1) % heroImages.length), 2500);\n    return () => clearInterval(timer);\n  }, [open, heroImages.length]);`;

  source = replaceRequired(source, oldPhotosBlock, newPhotosBlock, "recap photo resolver");

  const oldHero = `          {photos.length > 0 ? (\n            photos.map((photo, index) => (\n              <img\n                key={photo}\n                src={photo}\n                alt=""\n                className={\`absolute inset-0 h-full w-full object-cover transition-all duration-1000 \${\n                  index === slideIdx ? "scale-105 opacity-100" : "scale-100 opacity-0"\n                }\`}\n              />\n            ))\n          ) : (\n            <div className="grid h-full place-items-center gradient-hero text-6xl text-white">🎞️</div>\n          )}`;

  const newHero = `          <div className="absolute inset-0 grid place-items-center gradient-hero text-6xl text-white">🌍</div>\n          {heroImages.map((photo, index) => (\n            <img\n              key={\`recap-hero-\${photo}-\${index}\`}\n              src={photo}\n              alt=""\n              onError={(event) => { event.currentTarget.style.display = "none"; }}\n              className={\`absolute inset-0 h-full w-full object-cover transition-all duration-1000 \${\n                index === slideIdx ? "scale-105 opacity-100" : "scale-100 opacity-0"\n              }\`}\n            />\n          ))}`;
  source = replaceRequired(source, oldHero, newHero, "recap hero rendering");

  source = replaceRequired(
    source,
    '<TripRouteMap entries={entries} zoomLevel={4} />',
    '<TripRouteMap entries={mapEntries} zoomLevel={4} />',
    "recap map entries",
  );

  source = source.replace(
    '        Aucun lieu géolocalisé',
    '        Ajoute un lieu à un souvenir pour afficher ton parcours',
  );

  return source;
});

patchFile("src/components/TravelJournalEnhancer.tsx", (input) => {
  let source = input;

  const memoryHelper = `// journal-memory-geocode-fix\nasync function geocodeMemoryLocation(city?: string | null, country?: string | null) {\n  const query = [city, country].filter(Boolean).join(", ").trim();\n  if (!query) return null;\n  try {\n    const response = await fetch(\n      \`https://geocoding-api.open-meteo.com/v1/search?name=\${encodeURIComponent(query)}&count=5&language=fr&format=json\`,\n    );\n    if (!response.ok) return null;\n    const payload = (await response.json()) as {\n      results?: Array<{ latitude: number; longitude: number; country?: string }>;\n    };\n    const requestedCountry = String(country ?? "").trim().toLocaleLowerCase("fr");\n    const result =\n      payload.results?.find((item) =>\n        requestedCountry ? String(item.country ?? "").toLocaleLowerCase("fr").includes(requestedCountry) : true,\n      ) ?? payload.results?.[0];\n    if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return null;\n    return { lat: Number(result.latitude), lng: Number(result.longitude) };\n  } catch {\n    return null;\n  }\n}\n\n`;
  if (!source.includes("// journal-memory-geocode-fix")) {
    source = replaceRequired(source, "function MemoryComposer({", `${memoryHelper}function MemoryComposer({`, "memory geocoder");
  }

  source = replaceRequired(
    source,
    '      const dbKind = kind === "memory" ? "photo" : kind;\n      const { error } = await supabase.from("trip_entries").insert({',
    '      const dbKind = kind === "memory" ? "photo" : kind;\n      setProgress(city.trim() || country.trim() ? "Localisation du souvenir…" : "Enregistrement…");\n      const coords = await geocodeMemoryLocation(city.trim(), country.trim());\n      const { error } = await supabase.from("trip_entries").insert({',
    "memory geocode before insert",
  );

  source = replaceRequired(
    source,
    '        country: country.trim() || null,\n        notes: story.trim() || null,',
    '        country: country.trim() || null,\n        lat: coords?.lat ?? null,\n        lng: coords?.lng ?? null,\n        notes: story.trim() || null,',
    "memory coordinates insert",
  );

  return source;
});
