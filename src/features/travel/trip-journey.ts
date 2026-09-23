export const MAX_TRIP_DAY_OPTIONS = 90;

function isValidIsoDay(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function buildTripDateRange(
  startsOn?: string | null,
  endsOn?: string | null,
  maxDays = MAX_TRIP_DAY_OPTIONS,
) {
  if (!isValidIsoDay(startsOn)) return [];
  if (!endsOn) return [startsOn!];
  if (!isValidIsoDay(endsOn) || endsOn! < startsOn!) return [];

  const safeMax = Math.min(366, Math.max(1, Math.trunc(maxDays) || MAX_TRIP_DAY_OPTIONS));
  const [year, month, day] = startsOn!.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  const result: string[] = [];

  while (result.length < safeMax) {
    const iso = cursor.toISOString().slice(0, 10);
    if (iso > endsOn!) break;
    result.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

export function formatTripDayOption(value: string) {
  if (!isValidIsoDay(value)) return value;
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function normalizeIdentityPart(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tripEntryIdentity(item: {
  title?: unknown;
  city?: unknown;
  country?: unknown;
}) {
  return [
    normalizeIdentityPart(item.title),
    normalizeIdentityPart(item.city),
    normalizeIdentityPart(item.country),
  ].join("|");
}

export function parseExpenseAmount(value: unknown) {
  const amount = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export function tripBudgetSnapshot(args: {
  budget?: number | string | null;
  spent?: number | string | null;
  forecast?: number | string | null;
}) {
  const budget = Math.max(0, Number(args.budget || 0));
  const spent = Math.max(0, Number(args.spent || 0));
  const forecast = Math.max(0, Number(args.forecast || 0));
  const projected = spent + forecast;
  const remaining = budget > 0 ? budget - spent : null;
  const projectedRemaining = budget > 0 ? budget - projected : null;
  const spentPct = budget > 0 ? (spent / budget) * 100 : 0;
  const projectedPct = budget > 0 ? (projected / budget) * 100 : 0;

  return {
    budget,
    spent,
    forecast,
    projected,
    remaining,
    projectedRemaining,
    spentPct,
    projectedPct,
    isOverBudget: budget > 0 && spent > budget,
    isProjectedOverBudget: budget > 0 && projected > budget,
  };
}
