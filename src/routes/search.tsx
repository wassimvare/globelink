import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search as SearchIcon, X, Loader2, ArrowUpRight } from "lucide-react";
import { universalSearch, KIND_META, type SearchKind, type SearchResult } from "@/lib/search";
import { BackButton } from "@/components/BackButton";

import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Recherche — GlobeLink" },
      { name: "description", content: "Recherche universelle : voyageurs, destinations, activités, hôtels, restaurants, carnets et publications." },
    ],
  }),
  component: SearchPage,
});

function useDebounced<T>(value: T, ms = 220) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const RECENT_KEY = "globelink.recent-searches";

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function pushRecent(q: string) {
  if (typeof window === "undefined" || !q.trim()) return;
  const cur = loadRecent().filter((x) => x !== q);
  localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...cur].slice(0, 8)));
}

function SearchPage() {
  const { q: qParam } = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState(qParam ?? "");
  const debounced = useDebounced(q, 200);
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => { setRecent(loadRecent()); }, []);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      navigate({ to: "/search", search: { q: debounced }, replace: true });
    }, 150);
    return () => clearTimeout(t);
  }, [debounced, navigate]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => universalSearch(debounced, 8),
    enabled: debounced.trim().length > 0,
    staleTime: 30_000,
  });

  const total = useMemo(() => data ? Object.values(data).reduce((n, arr) => n + arr.length, 0) : 0, [data]);
  const hasQuery = debounced.trim().length > 0;

  const suggestions = ["Bali", "Islande", "Tokyo", "Grèce", "Marrakech", "Pérou", "Portugal"];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-40 border-b border-border/60 glass">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <BackButton compact />
          <div className="relative flex-1">

            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") pushRecent(q.trim());
                if (e.key === "Escape") { setQ(""); inputRef.current?.blur(); }
              }}
              placeholder="Rechercher voyageurs, destinations, hôtels…"
              className="h-11 w-full rounded-full border border-border/60 bg-secondary/60 pl-10 pr-10 text-sm outline-none transition focus:border-primary/40 focus:bg-background focus:shadow-glow"
            />
            {q && (
              <button onClick={() => { setQ(""); inputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            )}
            {isFetching && <Loader2 className="absolute right-9 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Annuler</Link>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {!hasQuery ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {recent.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recherches récentes</h2>
                <div className="flex flex-wrap gap-2">
                  {recent.map((r) => (
                    <button key={r} onClick={() => setQ(r)} className="rounded-full border border-border/60 bg-secondary/60 px-3 py-1.5 text-sm hover-scale">
                      {r}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tendances</h2>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => setQ(s)} className="rounded-full bg-gradient-to-br from-primary/10 to-accent/10 px-3 py-1.5 text-sm font-medium hover-scale">
                    🔥 {s}
                  </button>
                ))}
              </div>
            </section>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            {isFetching && !data ? (
              <SkeletonGrid key="skeleton" />
            ) : total === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-muted-foreground">
                Aucun résultat pour « {debounced} »
              </motion.div>
            ) : (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                {(Object.keys(KIND_META) as SearchKind[]).map((kind) => {
                  const items = data?.[kind] ?? [];
                  if (items.length === 0) return null;
                  return <ResultGroup key={kind} kind={kind} items={items} query={debounced} />;
                })}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function ResultGroup({ kind, items, query }: { kind: SearchKind; items: SearchResult[]; query: string }) {
  const meta = KIND_META[kind];
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">
          <span className="mr-1.5">{meta.emoji}</span>{meta.label}
        </h3>
        <span className="text-xs text-muted-foreground">{items.length} résultat{items.length > 1 ? "s" : ""}</span>
      </div>
      <ul className="space-y-2">
        {items.map((r, i) => (
          <motion.li key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02, duration: 0.2 }}>
            <Link to={r.to as any} className="group flex items-center gap-3 rounded-2xl border border-border/40 bg-card/60 p-3 backdrop-blur-sm transition hover:border-primary/40 hover:shadow-soft" onClick={() => pushRecent(query)}>
              {r.image ? (
                <img src={r.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" loading="lazy" />
              ) : (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 text-xl">{meta.emoji}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{highlight(r.title, query)}</p>
                {r.subtitle && <p className="truncate text-sm text-muted-foreground">{r.subtitle}</p>}
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </Link>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

function highlight(text: string, q: string) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0 || !q) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function SkeletonGrid() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card/40 p-3">
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </motion.div>
  );
}
