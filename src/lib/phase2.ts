export function slugifyDestination(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function humanDateRange(startsOn?: string | null, endsOn?: string | null) {
  if (!startsOn || !endsOn) return "Dates à définir";
  const format = (value: string) =>
    new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${format(startsOn)} → ${format(endsOn)}`;
}

export function destinationLabel(city?: string | null, country?: string | null) {
  return [city, country].filter(Boolean).join(", ") || "Destination à définir";
}

export function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
