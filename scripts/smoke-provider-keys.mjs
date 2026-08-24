const clean = (value) => String(value ?? "").trim();

async function testGoogle() {
  const key = clean(
    process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GLOBELINK_GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY,
  );
  if (!key) return { provider: "Google Places", ok: false, detail: "clé absente" };
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName",
      },
      body: JSON.stringify({ textQuery: "restaurants à Paris", languageCode: "fr", pageSize: 1 }),
    });
    const body = await response.json().catch(() => ({}));
    const count = Array.isArray(body?.places) ? body.places.length : 0;
    return {
      provider: "Google Places",
      ok: response.ok && count > 0,
      detail: response.ok ? `${count} résultat(s)` : `HTTP ${response.status}: ${clean(body?.error?.message).slice(0, 180)}`,
    };
  } catch (error) {
    return { provider: "Google Places", ok: false, detail: clean(error?.message).slice(0, 180) };
  }
}

async function testTicketmaster() {
  const key = clean(process.env.TICKETMASTER_API_KEY);
  if (!key) return { provider: "Ticketmaster", ok: false, detail: "clé absente" };
  try {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", key);
    url.searchParams.set("city", "Paris");
    url.searchParams.set("size", "1");
    url.searchParams.set("locale", "fr-fr");
    const response = await fetch(url);
    const body = await response.json().catch(() => ({}));
    const events = body?._embedded?.events;
    const count = Array.isArray(events) ? events.length : 0;
    return {
      provider: "Ticketmaster",
      ok: response.ok,
      detail: response.ok ? `${count} événement(s) retourné(s)` : `HTTP ${response.status}: ${clean(body?.fault?.faultstring || body?.message).slice(0, 180)}`,
    };
  } catch (error) {
    return { provider: "Ticketmaster", ok: false, detail: clean(error?.message).slice(0, 180) };
  }
}

const results = await Promise.all([testGoogle(), testTicketmaster()]);
for (const result of results) {
  console.log(`[GlobeLink API] ${result.provider}: ${result.ok ? "OK" : "ECHEC"} — ${result.detail}`);
}
if (results.some((result) => !result.ok)) {
  console.log("[GlobeLink API] Un fournisseur doit être corrigé avant de le considérer actif.");
}