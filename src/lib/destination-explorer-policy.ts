import { normalizeText } from "./phase2";
import { WORLD_MAP_HUBS, type WorldMapHub } from "./world-map-hubs";

export const DESTINATION_CORE_KINDS = ["activity", "restaurant", "hotel"] as const;
export type DestinationCoreKind = (typeof DESTINATION_CORE_KINDS)[number];

export function resolveDestinationHub(input: {
  city?: string | null;
  country: string;
}): WorldMapHub | null {
  const countryNeedle = normalizeText(input.country);
  const cityNeedle = normalizeText(input.city);

  if (cityNeedle) {
    return (
      WORLD_MAP_HUBS.find(
        (hub) =>
          normalizeText(hub.city) === cityNeedle &&
          normalizeText(hub.country) === countryNeedle,
      ) ?? null
    );
  }

  return (
    WORLD_MAP_HUBS.find((hub) => normalizeText(hub.country) === countryNeedle) ??
    null
  );
}

export function destinationViewportBounds(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  zoom = 14,
) {
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const effectiveZoom = Math.min(14, Math.max(11, Math.round(zoom || 14)));
  const scale = 2 ** (14 - effectiveZoom);
  const latDelta = Math.min(0.44, 0.055 * scale);
  const lngDelta = Math.min(0.64, 0.08 * scale);

  return {
    south: Math.max(-90, latitude - latDelta),
    west: Math.max(-180, longitude - lngDelta),
    north: Math.min(90, latitude + latDelta),
    east: Math.min(180, longitude + lngDelta),
    zoom: effectiveZoom,
  };
}

export function destinationMissingKinds(
  rows: Array<{ kind: string }>,
  minimumPerKind = 3,
): DestinationCoreKind[] {
  const minimum = Math.max(1, Math.floor(minimumPerKind));
  return DESTINATION_CORE_KINDS.filter(
    (kind) => rows.filter((item) => item.kind === kind).length < minimum,
  );
}
