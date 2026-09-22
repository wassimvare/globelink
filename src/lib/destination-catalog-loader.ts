type Kind = "activity" | "restaurant" | "hotel";
const KINDS: Kind[] = ["activity", "restaurant", "hotel"];

export async function loadLocalFirstDestinationCatalog<T extends { kind: string }>(options: {
  cached: T[];
  local: () => Promise<T[]>;
  publicSources: Array<() => Promise<T[]>>;
  google: (missingKinds: Kind[]) => Promise<T[]>;
  normalize: (rows: T[]) => T[];
}): Promise<T[]> {
  // A partial category should not cause all three paid searches to run again.
  const missing = (rows: T[]) =>
    KINDS.filter((kind) => rows.filter((row) => row.kind === kind).length < 3);
  let rows = options.normalize([...(await options.local().catch(() => [])), ...options.cached]);
  if (!missing(rows).length) return rows;
  const results = await Promise.allSettled(options.publicSources.map((source) => source()));
  rows = options.normalize([
    ...rows,
    ...results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
  ]);
  const missingKinds = missing(rows);
  if (!missingKinds.length) return rows;
  return options.normalize([...rows, ...(await options.google(missingKinds).catch(() => []))]);
}
