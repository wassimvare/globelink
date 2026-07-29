import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import type { MapTraveler } from "@/lib/mock-travelers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Heart, X, MapPin, Calendar, Wallet, Languages, Sparkles, RotateCcw, MessageCircle, Filter } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendMatchLike } from "@/lib/match.functions";

export const Route = createFileRoute("/_authenticated/match")({
  head: () => ({
    meta: [
      { title: "Travel Match — GlobeLink" },
      { name: "description", content: "Swipe pour découvrir des voyageurs compatibles selon destination, dates, budget, langues et centres d'intérêt." },
      { property: "og:title", content: "Travel Match — GlobeLink" },
      { property: "og:description", content: "Découvre des voyageurs compatibles et ouvre une conversation dès qu’un match est mutuel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MatchPage,
});

type MyPrefs = {
  destination: string;
  budget: number;
  languages: string[];
  interests: string[];
  ageMin: number;
  ageMax: number;
  startsOn: string;
  endsOn: string;
};

const DEFAULT_PREFS: MyPrefs = {
  destination: "",
  budget: 1500,
  languages: ["Français", "Anglais"],
  interests: ["Randonnée", "Photo", "Culture"],
  ageMin: 20,
  ageMax: 45,
  startsOn: new Date().toISOString().slice(0, 10),
  endsOn: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
};

const ALL_LANGS = ["Français", "Anglais", "Espagnol", "Italien", "Portugais", "Arabe", "Japonais", "Mandarin"];
const ALL_INTERESTS = ["Plage", "Randonnée", "Plongée", "Surf", "Yoga", "Culture", "Musées", "Street food", "Vie nocturne", "Photo", "Aventure", "Nature", "Trek", "Café", "Vin", "Design"];

function ageFor(id: string) {
  // Stable pseudo age from id
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 22 + (h % 20);
}

function daysOverlap(aS: string, aE: string, bS: string, bE: string) {
  const s = Math.max(Date.parse(aS), Date.parse(bS));
  const e = Math.min(Date.parse(aE), Date.parse(bE));
  return Math.max(0, Math.floor((e - s) / 86_400_000) + 1);
}

function scoreTraveler(t: MapTraveler, p: MyPrefs) {
  let s = 0;
  const parts: { label: string; got: number; max: number }[] = [];
  const destMatch = p.destination.trim().length === 0
    ? 25
    : t.country.toLowerCase().includes(p.destination.toLowerCase()) || t.city.toLowerCase().includes(p.destination.toLowerCase())
      ? 30 : 0;
  parts.push({ label: "Destination", got: destMatch, max: 30 });
  const overlap = daysOverlap(p.startsOn, p.endsOn, t.starts_on, t.ends_on);
  const datePts = overlap > 0 ? Math.min(20, 5 + overlap * 2) : 0;
  parts.push({ label: "Dates", got: datePts, max: 20 });
  const ratio = Math.abs(p.budget - t.budget_eur) / Math.max(p.budget, t.budget_eur);
  const budgetPts = ratio < 0.15 ? 15 : ratio < 0.35 ? 10 : ratio < 0.6 ? 5 : 0;
  parts.push({ label: "Budget", got: budgetPts, max: 15 });
  const sharedLangs = t.languages.filter((l) => p.languages.includes(l));
  parts.push({ label: "Langues", got: Math.min(10, sharedLangs.length * 5), max: 10 });
  const sharedInts = t.interests.filter((i) => p.interests.includes(i));
  parts.push({ label: "Affinités", got: Math.min(15, sharedInts.length * 5), max: 15 });
  const age = ageFor(t.id);
  const agePts = age >= p.ageMin && age <= p.ageMax ? 10 : 0;
  parts.push({ label: "Âge", got: agePts, max: 10 });
  s = parts.reduce((a, b) => a + b.got, 0);
  return { score: s, parts, sharedLangs, sharedInts, overlap, age };
}

type Candidate = { key: string; t: MapTraveler; profileId: string };

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

type RealProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  languages: string[] | null;
};

/** Turn a real GlobeLink member into a swipe card. */
function candidateFromProfile(p: RealProfile): Candidate {
  const h = hash(p.id);
  const [s, e] = [
    new Date(Date.now() + (h % 30) * 86400000).toISOString().slice(0, 10),
    new Date(Date.now() + ((h % 30) + 7 + (h % 14)) * 86400000).toISOString().slice(0, 10),
  ];
  const pool = ALL_INTERESTS;
  const interests = [pool[h % pool.length], pool[(h >> 3) % pool.length], pool[(h >> 6) % pool.length]]
    .filter((v, i, arr) => arr.indexOf(v) === i);
  return {
    key: `real:${p.id}`,
    profileId: p.id,
    t: {
      id: p.id,
      name: p.display_name ?? p.username,
      avatar: p.avatar_url ?? `https://i.pravatar.cc/600?u=${p.username}`,
      lat: 0,
      lng: 0,
      city: "GlobeLink",
      country: p.country ?? "Monde",
      starts_on: s,
      ends_on: e,
      budget_eur: 600 + (h % 25) * 100,
      languages: (p.languages && p.languages.length > 0 ? p.languages : ["Français", "Anglais"]) as string[],
      interests,
      bio: p.bio ?? "Nouveau membre GlobeLink, prêt à partir à l'aventure.",
    },
  };
}

function MatchPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<MyPrefs>(DEFAULT_PREFS);
  const [showFilters, setShowFilters] = useState(false);

  // Real persisted GlobeLink profiles (new sign-ups and materialised demo profiles appear here automatically).
  const { data: realProfiles } = useQuery({
    queryKey: ["match-real-profiles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, country, languages, is_demo, created_at")
        .neq("id", user!.id)
        .eq("visibility", "public")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as unknown as RealProfile[];
    },
  });

  // Already liked or permanently skipped.
  const { data: excluded } = useQuery({
    queryKey: ["match-exclusions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [likes, passes] = await Promise.all([
        supabase.from("match_likes").select("to_user_id").eq("from_user_id", user!.id),
        supabase.from("match_passes").select("target_id").eq("user_id", user!.id),
      ]);
      const set = new Set<string>();
      for (const r of likes.data ?? []) set.add(r.to_user_id);
      for (const r of passes.data ?? []) set.add(r.target_id);
      return set;
    },
  });

  const [seen, setSeen] = useState<string[]>([]);
  const [matches, setMatches] = useState<string[]>([]);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const pendingDrag = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const deck = useMemo(() => {
    const seenSet = new Set(seen);
    const candidates: Candidate[] = (realProfiles ?? []).map(candidateFromProfile);
    return candidates
      .filter((c) => c.profileId !== user?.id)
      .filter((c) => !seenSet.has(c.key))
      .filter((c) => !excluded?.has(c.profileId))
      .map((c) => ({ c, s: scoreTraveler(c.t, prefs) }))
      .sort((a, b) => b.s.score - a.s.score);
  }, [prefs, seen, realProfiles, excluded, user?.id]);

  const current = deck[0];
  const next = deck[1];

  const sendLike = useServerFn(sendMatchLike);

  useEffect(() => {
    deck.slice(0, 4).forEach(({ c }) => {
      const image = new Image();
      image.decoding = "async";
      image.src = c.t.avatar.replace("160", "600");
    });
  }, [deck]);

  function animateOut(direction: "left" | "right") {
    const width = typeof window === "undefined" ? 420 : window.innerWidth;
    const x = direction === "right" ? width * 1.25 : -width * 1.25;
    setDrag({ x, y: 24 });
    return new Promise((resolve) => window.setTimeout(resolve, 190));
  }

  async function advance(direction: "left" | "right") {
    if (!current || busy) return;
    const c = current.c;
    setBusy(true);
    startRef.current = null;
    try {
      if (!user) { toast.error("Connecte-toi pour swiper"); return; }
      await animateOut(direction);
      setSeen((l) => [...l, c.key]);
      setDrag(null);
      const targetId = c.profileId;

      if (direction === "left") {
        const { error } = await supabase
          .from("match_passes")
          .upsert({ user_id: user.id, target_id: targetId }, { onConflict: "user_id,target_id" });
        if (error) throw error;
        toast(`${c.t.name} ignoré`, { description: "Ce profil ne réapparaîtra plus." });
        qc.invalidateQueries({ queryKey: ["match-exclusions", user.id] });
        return;
      }

      const res = await sendLike({ data: { toUserId: targetId } });
      qc.invalidateQueries({ queryKey: ["match-exclusions", user.id] });
      if (res.matched && res.conversationId) {
        qc.invalidateQueries({ queryKey: ["conversations", user.id] });
        setMatches((l) => [...l, c.key]);
        toast.success(`Match avec ${c.t.name} ✨`, {
          description: "La conversation est ouverte dans Messages.",
          action: { label: "Message", onClick: () => navigate({ to: "/messages/$id", params: { id: res.conversationId! } }) },
        });
      } else {
        toast(`Like envoyé à ${c.t.name}`, { description: "Tu verras un match s'il te like en retour." });
      }
    } catch (e) {
      console.error(e);
      toast.error(direction === "left" ? "Impossible d'ignorer ce profil" : "Impossible d'envoyer le like");
    } finally {
      setBusy(false);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (busy) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    pendingDrag.current = { x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y };
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      setDrag(pendingDrag.current);
    });
  }
  function onPointerUp() {
    if (!drag) { startRef.current = null; return; }
    const threshold = 110;
    if (drag.x > threshold) advance("right");
    else if (drag.x < -threshold) advance("left");
    else { setDrag(null); startRef.current = null; }
  }

  function reset() { setSeen([]); setMatches([]); }

  const rot = drag ? drag.x / 20 : 0;
  const opacityLike = drag && drag.x > 30 ? Math.min(1, drag.x / 150) : 0;
  const opacityNope = drag && drag.x < -30 ? Math.min(1, -drag.x / 150) : 0;

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-lg px-4 py-5">
        <div className="surface-card mb-4 flex items-center justify-between rounded-[1.6rem] p-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">Travel Match</h1>
            <p className="text-xs text-muted-foreground">Swipe pour trouver ton binôme de voyage.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="mr-1 h-4 w-4" /> Filtres
          </Button>
        </div>

        {showFilters && (
          <div className="surface-card mb-4 space-y-4 rounded-[1.6rem] p-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium">
                Destination
                <Input value={prefs.destination} onChange={(e) => setPrefs({ ...prefs, destination: e.target.value })} placeholder="Bali, Tokyo…" />
              </label>
              <label className="text-xs font-medium">
                Budget max (€)
                <Input type="number" value={prefs.budget} onChange={(e) => setPrefs({ ...prefs, budget: Number(e.target.value) || 0 })} />
              </label>
              <label className="text-xs font-medium">
                Départ
                <Input type="date" value={prefs.startsOn} onChange={(e) => setPrefs({ ...prefs, startsOn: e.target.value })} />
              </label>
              <label className="text-xs font-medium">
                Retour
                <Input type="date" value={prefs.endsOn} onChange={(e) => setPrefs({ ...prefs, endsOn: e.target.value })} />
              </label>
              <label className="text-xs font-medium">
                Âge min
                <Input type="number" value={prefs.ageMin} onChange={(e) => setPrefs({ ...prefs, ageMin: Number(e.target.value) || 0 })} />
              </label>
              <label className="text-xs font-medium">
                Âge max
                <Input type="number" value={prefs.ageMax} onChange={(e) => setPrefs({ ...prefs, ageMax: Number(e.target.value) || 0 })} />
              </label>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">Langues</p>
              <div className="flex flex-wrap gap-1">
                {ALL_LANGS.map((l) => {
                  const on = prefs.languages.includes(l);
                  return (
                    <button key={l} onClick={() => setPrefs({ ...prefs, languages: on ? prefs.languages.filter((x) => x !== l) : [...prefs.languages, l] })}
                      className={`rounded-full px-2 py-1 text-[11px] ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">Centres d'intérêt</p>
              <div className="flex flex-wrap gap-1">
                {ALL_INTERESTS.map((l) => {
                  const on = prefs.interests.includes(l);
                  return (
                    <button key={l} onClick={() => setPrefs({ ...prefs, interests: on ? prefs.interests.filter((x) => x !== l) : [...prefs.interests, l] })}
                      className={`rounded-full px-2 py-1 text-[11px] ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="relative mx-auto h-[585px] w-full max-w-sm select-none">
          {!current ? (
            <div className="absolute inset-0 grid place-items-center rounded-3xl border border-dashed border-border bg-card p-8 text-center">
              <div>
                <Sparkles className="mx-auto mb-2 h-8 w-8 text-primary" />
                <p className="font-semibold">Tu as vu tout le monde !</p>
                <p className="mt-1 text-xs text-muted-foreground">{matches.length} match(s) enregistré(s).</p>
                <p className="mt-1 text-xs text-muted-foreground">Les profils ignorés ne réapparaîtront plus.</p>
                <Button onClick={reset} className="mt-4"><RotateCcw className="mr-2 h-4 w-4" /> Revoir la sélection</Button>
              </div>
            </div>
          ) : (
            <>
              {next && <SwipeCard t={next.c.t} score={next.s.score} parts={next.s.parts} sharedInts={next.s.sharedInts} age={next.s.age} stacked />}
              <div
                ref={cardRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  transform: `translate3d(${drag?.x ?? 0}px, ${drag?.y ?? 0}px, 0) rotate(${rot}deg)`,
                  transition: startRef.current ? "none" : "transform 190ms cubic-bezier(.2,.8,.2,1)",
                  willChange: "transform",
                }}
                className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
              >
                <SwipeCard t={current.c.t} score={current.s.score} parts={current.s.parts} sharedInts={current.s.sharedInts} age={current.s.age}
                  likeOpacity={opacityLike} nopeOpacity={opacityNope} />
              </div>
            </>
          )}
        </div>

        {current && (
          <div className="mt-4 flex items-center justify-center gap-4">
            <button onClick={() => advance("left")} aria-label="Passer"
              className="grid h-14 w-14 place-items-center rounded-2xl border border-border/70 bg-card text-destructive shadow-soft transition hover:-translate-y-0.5 hover:shadow-elevated active:translate-y-0 active:scale-95">
              <X className="h-6 w-6" />
            </button>
            <button onClick={() => navigate({ to: "/messages" })} aria-label="Messagerie"
              className="grid h-12 w-12 place-items-center rounded-2xl border border-border/70 bg-card text-primary shadow-soft transition hover:-translate-y-0.5 active:translate-y-0 active:scale-95">
              <MessageCircle className="h-5 w-5" />
            </button>
            <button onClick={() => advance("right")} aria-label="Match"
              className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-glow transition hover:-translate-y-0.5 active:translate-y-0 active:scale-95">
              <Heart className="h-6 w-6" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function SwipeCard({
  t, score, parts, sharedInts, age, stacked, likeOpacity = 0, nopeOpacity = 0,
}: {
  t: MapTraveler;
  score: number;
  parts: { label: string; got: number; max: number }[];
  sharedInts: string[];
  age: number;
  stacked?: boolean;
  likeOpacity?: number;
  nopeOpacity?: number;
}) {
  return (
    <div
      className={`surface-card absolute inset-0 overflow-hidden rounded-[2rem] ${stacked ? "scale-95 opacity-65" : ""}`}
      style={stacked ? { transform: "translateY(12px) scale(0.95)" } : undefined}
    >
      <div className="relative h-80 w-full">
        <img src={t.avatar.replace("160", "600")} alt={t.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="absolute right-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-white backdrop-blur">
          <Sparkles className="mr-1 inline h-3 w-3" /> {score}%
        </div>
        <div
          className="pointer-events-none absolute left-4 top-4 rounded-lg border-4 border-green-400 px-3 py-1 text-2xl font-black uppercase text-green-400"
          style={{ opacity: likeOpacity, transform: "rotate(-12deg)" }}
        >Match</div>
        <div
          className="pointer-events-none absolute right-4 top-4 rounded-lg border-4 border-red-400 px-3 py-1 text-2xl font-black uppercase text-red-400"
          style={{ opacity: nopeOpacity, transform: "rotate(12deg)" }}
        >Nope</div>
        <div className="absolute bottom-3 left-4 text-white">
          <p className="font-display text-2xl font-bold">{t.name}, {age}</p>
          <p className="flex items-center gap-1 text-sm opacity-90"><MapPin className="h-3.5 w-3.5" /> {t.city}, {t.country}</p>
        </div>
      </div>
      <div className="space-y-3 p-5">
        <p className="text-sm text-foreground/90">{t.bio}</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl bg-secondary p-2">
            <Calendar className="mb-1 h-3.5 w-3.5 text-primary" />
            <p className="font-semibold">{new Date(t.starts_on).toLocaleDateString("fr", { day: "2-digit", month: "short" })}</p>
            <p className="text-muted-foreground">→ {new Date(t.ends_on).toLocaleDateString("fr", { day: "2-digit", month: "short" })}</p>
          </div>
          <div className="rounded-xl bg-secondary p-2">
            <Wallet className="mb-1 h-3.5 w-3.5 text-primary" />
            <p className="font-semibold">{t.budget_eur} €</p>
            <p className="text-muted-foreground">Budget</p>
          </div>
          <div className="rounded-xl bg-secondary p-2">
            <Languages className="mb-1 h-3.5 w-3.5 text-primary" />
            <p className="font-semibold truncate">{t.languages[0]}</p>
            <p className="text-muted-foreground">+{Math.max(0, t.languages.length - 1)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {t.interests.slice(0, 6).map((i) => (
            <Badge key={i} variant={sharedInts.includes(i) ? "default" : "secondary"} className="text-[10px]">{i}</Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {parts.map((p) => (
            <span key={p.label} className="rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              {p.label} {p.got}/{p.max}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
