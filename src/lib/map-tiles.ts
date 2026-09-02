/**
 * Shared, key-free map tiles.
 *
 * Keeping the provider in one place prevents the main map and trip maps from
 * drifting back to a basemap that displays an API-key watermark.
 */
export const MAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const MAP_TILE_MAX_ZOOM = 19;
