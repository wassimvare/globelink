import { useEffect, useState } from "react";

/**
 * Stable daily content rotation.
 *
 * The same visitor sees the same selection for the whole UTC day, including
 * during SSR/hydration. The order changes automatically after midnight UTC.
 * This is intentionally deterministic: no localStorage, no tracking and no
 * random layout jumps between renders.
 */
export function dailyContentKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function dailyRotation<T>(items: readonly T[], count: number, salt: string, date = new Date()): T[] {
  const copy = [...items];
  const random = seededRandom(hashString(`${dailyContentKey(date)}:${salt}`));
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy.slice(0, Math.max(0, Math.min(count, copy.length)));
}

export function dailyRefreshLabel(date = new Date()): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(date);
}


export function useDailyContentKey(): string {
  const [key, setKey] = useState(() => dailyContentKey());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const now = new Date();
      const nextUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      timer = setTimeout(() => {
        setKey(dailyContentKey());
        schedule();
      }, Math.max(1_000, nextUtcDay - now.getTime() + 250));
    };
    schedule();
    return () => { if (timer) clearTimeout(timer); };
  }, []);
  return key;
}
