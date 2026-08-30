import { destinationCover } from "@/lib/destination-cover";

export type TripFormState = {
  title: string;
  country: string;
  city: string;
  budget: string;
  startsOn: string;
  endsOn: string;
  notes: string;
};

export const EMPTY_TRIP_FORM: TripFormState = {
  title: "",
  country: "",
  city: "",
  budget: "",
  startsOn: "",
  endsOn: "",
  notes: "",
};

export function validateTripDates(form: TripFormState) {
  if (form.startsOn && form.endsOn && form.endsOn < form.startsOn) {
    throw new Error("La date de retour doit être après la date de départ.");
  }
}

export function buildTripInsert(userId: string, form: TripFormState) {
  validateTripDates(form);
  return {
    user_id: userId,
    title: form.title || `${form.country} voyage`,
    country: form.country.trim(),
    city: form.city.trim() || null,
    budget: form.budget ? Number(form.budget) : null,
    starts_on: form.startsOn || null,
    ends_on: form.endsOn || null,
    notes: form.notes.trim() || null,
    cover_url: destinationCover(form.country, form.city),
    status: "planned" as const,
  };
}

export function selectFocusTrip<T extends {
  finalized_at?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
}>(trips: T[] | null | undefined, today: string): T | null {
  if (!trips?.length) return null;

  // A finalized trip belongs to the history only. It must never be reused as
  // the current/next trip card, even if its dates still include today.
  const openTrips = trips.filter((trip) => !trip.finalized_at);
  if (!openTrips.length) return null;

  const active = openTrips.find(
    (trip) =>
      !!trip.starts_on &&
      trip.starts_on <= today &&
      (!trip.ends_on || trip.ends_on >= today),
  );
  if (active) return active;

  const upcoming = openTrips
    .filter((trip) => !trip.starts_on || trip.starts_on >= today)
    .sort((a, b) => {
      if (!a.starts_on && !b.starts_on) return 0;
      if (!a.starts_on) return 1;
      if (!b.starts_on) return -1;
      return a.starts_on.localeCompare(b.starts_on);
    });

  return upcoming[0] ?? openTrips[0] ?? null;
}

export function isTripActive(
  trip:
    | { finalized_at?: string | null; starts_on?: string | null; ends_on?: string | null }
    | null
    | undefined,
  today: string,
) {
  return Boolean(
    trip &&
      !trip.finalized_at &&
      trip.starts_on &&
      trip.starts_on <= today &&
      (!trip.ends_on || trip.ends_on >= today),
  );
}

export function formatTripDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function tripStatusLabel(status: string | null) {
  if (status === "active") return "En cours";
  if (status === "completed" || status === "past") return "Terminé";
  return "Prévu";
}
