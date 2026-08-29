const providers = [
  {
    label: "Google Places (hôtels, restaurants, attractions)",
    required: ["GOOGLE_PLACES_API_KEY", "GLOBELINK_GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_API_KEY"],
  },
  {
    label: "Ticketmaster Discovery (événements)",
    required: ["TICKETMASTER_API_KEY"],
  },
];

function configured(names) {
  return names.some((name) => String(process.env[name] ?? "").trim().length > 0);
}

let configuredCount = 0;
for (const provider of providers) {
  const ok = configured(provider.required);
  if (ok) configuredCount += 1;
  const expected = provider.required.join(" ou ");
  console.log(`${ok ? "OK" : "MANQUE"} ${provider.label} (${expected})`);
}

console.log(`APIs configurees: ${configuredCount}/${providers.length}`);
if (configuredCount === 0) {
  console.log(
    "Aucune cle API officielle detectee. GlobeLink n'inventera ni lieu, ni note, ni photo.",
  );
}
