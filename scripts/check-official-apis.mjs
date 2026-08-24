const providers = [
  {
    label: "Booking.com hotels",
    required: ["BOOKING_API_TOKEN", "BOOKING_PARTNER_API_KEY"],
    optional: [
      "BOOKING_AFFILIATE_ID",
      "BOOKING_API_BASE_URL",
      "BOOKING_ACCOMMODATIONS_SEARCH_ENDPOINT",
    ],
  },
  {
    label: "Tripadvisor activities",
    required: ["TRIPADVISOR_API_KEY"],
    optional: ["TRIPADVISOR_API_BASE_URL"],
  },
  {
    label: "GetYourGuide activities",
    required: ["GETYOURGUIDE_API_KEY", "GETYOURGUIDE_PARTNER_API_KEY"],
    optional: ["GETYOURGUIDE_API_BASE_URL"],
  },
  {
    label: "Yelp restaurants",
    required: ["YELP_API_KEY"],
    optional: ["YELP_API_BASE_URL"],
  },
  {
    label: "Google Places photos",
    required: ["GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_API_KEY"],
    optional: [],
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
    "Aucune cle API officielle detectee. GlobeLink utilisera les sources tracables de secours pour eviter une carte vide.",
  );
}
