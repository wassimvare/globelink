import { tripEntryIdentity } from "./trip-journey";

const STORAGE_KEY = "globelink:pending-trip-item";

type TripItemLocation = { title: string; city?: string | null; country?: string | null };

type PendingTripItem = {
  path: string;
  identity: string;
  city: string;
  country: string;
};

export function rememberTripItem(path: string, item: TripItemLocation) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        path,
        identity: tripEntryIdentity(item),
        city: item.city ?? "",
        country: item.country ?? "",
      } satisfies PendingTripItem),
    );
  } catch {
    // The visitor can still return to the source and reopen the picker manually.
  }
}

export function pendingTripItemFor(path: string): PendingTripItem | null {
  try {
    const item = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      item?.path === path &&
      typeof item.identity === "string" &&
      typeof item.city === "string" &&
      typeof item.country === "string"
    )
      return item;
  } catch {
    // Storage can be unavailable or contain a value from another app version.
  }
  return null;
}

export function takePendingTripItem(path: string, identity: string) {
  if (pendingTripItemFor(path)?.identity !== identity) return false;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
