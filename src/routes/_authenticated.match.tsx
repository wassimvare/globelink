import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
// JOURNEY_CONTINUITY_V1_MATCH
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Heart,
  X,
  MapPin,
  Calendar,
  Wallet,
  Languages,
  Sparkles,
  RotateCcw,
  MessageCircle,
  Filter,
  CheckCircle2,
  Settings2,
  ShieldCheck,
  Coffee,
  Footprints,
  UsersRound,
} from "lucide-react";
// TRAVEL_MATCH_V3
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendMatchLike } from "@/lib/match.functions";
import {
  DEFAULT_ACCOUNT_SETTINGS,
  getAccountSettings,
  getSuggestionExcludedUserIds,
} from "@/lib/account-settings";

const matchJourneySearch = z.object({
  tripId: z.string().uuid().optional(),
  destination: z.string().max(180).optional(),
  startsOn: z.string().max(10).optional(),
  endsOn: z.string().max(10).optional(),
});

export const Route = createFileRoute("/_authenticated/match")({
  head: () => ({
    meta: [
      { title: "Travel Match — GlobeLink" },
      {
        name: "description",
        content:
          "Swipe pour découvrir des voyageurs compatibles selon destination, dates, budget, langues et centres d'intérêt.",
      },
      { property: "og:title", content: "Travel Match — GlobeLink" },
      {
        property: "og:description",
        content:
          "Découvre des voyageurs compatibles et ouvre une conversation dès qu’un match est mutuel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search) => matchJourneySearch.parse(search),
  component: MatchPage,
});

type MapTraveler = {
  id: string;
  name: string;
  avatar: string | null;
  lat: number;
  lng: number;
  city: string;
  country: string;
  starts_on: string;
  ends_on: string;
  budget_eur: number | null;
  languages: string[];
  interests: string[];
  bio: string;
  age: number | null;
};

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
  ageMin: 18,
  ageMax: 99,
  startsOn: new Date().toISOString().slice(0, 10),
  endsOn: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
};

const ALL_LANGS = [
  "Français",
  "Anglais",
  "Espagnol",
  "Italien",
  "Portugais",
  "Arabe",
  "Japonais",
  "Mandarin",
];
const ALL_INTERESTS = [
  "Plage",
  "Randonnée",
  "Plongée",
  "Surf",
  "Yoga",
  "Culture",
  "Musées",
  "Street food",
  "Vie nocturne",
  "Photo",
  "Aventure",
  "Nature",
  "Trek",
  "Café",
  "Vin",
  "Design",
];

function daysOverlap(aS: string, aE: string, bS: string, bE: string) {
  const s = Math.max(Date.parse(aS), Date.parse(bS));
  const e = Math.min(Date.parse(aE), Date.parse(bE));
  return Math.max(0, Math.floor((e - s) / 86_400_000) + 1);
}

function scoreTraveler(t: MapTraveler, p: MyPrefs) {
  const parts: { label: string; got: number; max: number }[] = [];
  const destMatch =
    p.destination.trim().length === 0
      ? 25
      : t.country.toLowerCase().includes(p.destination.toLowerCase()) ||
          t.city.toLowerCase().includes(p.destination.toLowerCase())
        ? 30
        : 0;
  parts.push({ label: "Destination", got: destMatch, max: 30 });
  const overlap = daysOverlap(p.startsOn, p.endsOn, t.starts_on, t.ends_on);
  const datePts = overlap > 0 ? Math.min(20, 5 + overlap * 2) : 0;
  parts.push({ label: "Dates", got: datePts, max: 20 });
  const ratio =
    t.budget_eur && p.budget > 0
      ? Math.abs(p.budget - t.budget_eur) / Math.max(p.budget, t.budget_eur)
      : 1;
  const budgetPts = ratio < 0.15 ? 15 : ratio < 0.35 ? 10 : ratio < 0.6 ? 5 : 0;
  parts.push({ label: "Budget", got: budgetPts, max: 15 });
  const sharedLangs = t.languages.filter((l) => p.languages.includes(l));
  parts.push({ label: "Langues", got: Math.min(10, sharedLangs.length * 5), max: 10 });
  const sharedInts = t.interests.filter((i) => p.interests.includes(i));
  parts.push({ label: "Affinités", got: Math.min(15, sharedInts.length * 5), max: 15 });
  const age = t.age;
  const agePts = age !== null && age >= p.ageMin && age <= p.ageMax ? 10 : 0;
  parts.push({ label: "Âge", got: agePts, max: 10 });
  const score = parts.reduce((total, part) => total + part.got, 0);
  return { score, parts, sharedLangs, sharedInts, overlap, age };
}

type MatchIntent = {
  id: "activity" | "coffee" | "explore";
  label: string;
  helper: string;
  draft: string;
};

function matchQuality(score: number) {
  if (score >= 80) return "Excellent match";
  if (score >= 65) return "Très compatible";
  if (score >= 50) return "Bon potentiel";
  return "À découvrir";
}

function suggestedMeetups(t: MapTraveler, sharedInts: string[]): MatchIntent[] {
  const place = [t.city, t.country].filter(Boolean).join(", ") || "votre destination";
  const shared = sharedInts[0];
  return [
    {
      id: "activity",
      label: "Faire une activité ensemble",
      helper: shared ? `Vous aimez tous les deux : ${shared}` : "Choisir une activité sur place",
      draft: shared
        ? `Salut ${t.name} 👋 On a ${shared} en commun. Ça te dirait de faire une activité ensemble autour de ça à ${place} ?`
        : `Salut ${t.name} 👋 Ça te dirait qu’on fasse une activité ensemble à ${place} pendant nos dates en commun ?`,
    },
    {
      id: "coffee",
      label: "Prendre un café",
      helper: "Un premier contact simple",
      draft: `Salut ${t.name} 👋 On sera à ${place} au même moment. Ça te dirait de prendre un café et d’échanger sur nos plans ?`,
    },
    {
      id: "explore",
      label: "Explorer ensemble",
      helper: "Partager une demi-journée ou une journée",
      draft: `Salut ${t.name} 👋 Nos voyages se croisent à ${place}. Ça te dirait d’explorer un coin ensemble pendant une demi-journée ou une journée ?`,
    },
  ];
}

type Candidate = { key: string; t: MapTraveler; profileId: string; verified: boolean };

type RealProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  birth_date: string | null;
  languages: string[] | null;
  interests: string[];
  verified: boolean;
};

type RealIntent = {
  user_id: string;
  destination_country: string;
  destination_city: string | null;
  starts_on: string;
  ends_on: string;
  budget_eur: number | null;
  languages: string[];
  interests: string[];
  bio: string | null;
};

function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 18 && age <= 100 ? age : null;
}

function candidateFromData(profile: RealProfile, intent: RealIntent): Candidate {
  return {
    key: `real:${profile.id}:${intent.starts_on}`,
    profileId: profile.id,
    verified: !!profile.verified,
    t: {
      id: profile.id,
      name: profile.display_name ?? profile.username,
      avatar: profile.avatar_url,
      lat: 0,
      lng: 0,
      city: intent.destination_city ?? "",
      country: intent.destination_country,
      starts_on: intent.starts_on,
      ends_on: intent.ends_on,
      budget_eur: intent.budget_eur,
      languages: intent.languages?.length ? intent.languages : (profile.languages ?? []),
      interests: intent.interests?.length ? intent.interests : (profile.interests ?? []),
      bio: intent.bio ?? profile.bio ?? "",
      age: calculateAge(profile.birth_date),
    },
  };
}

function MatchPage() {
  const { tripId, destination, startsOn, endsOn } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: journeyTrip } = useQuery({
    queryKey: ["match-journey-trip", user?.id, tripId],
    enabled: !!user && !!tripId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("id,title,city,country,starts_on,ends_on,budget")
        .eq("id", tripId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [prefs, setPrefs] = useState<MyPrefs>(DEFAULT_PREFS);
  const [showFilters, setShowFilters] = useState(false);

  const { data: accountSettings = DEFAULT_ACCOUNT_SETTINGS } = useQuery({
    queryKey: ["account-settings", user?.id],
    enabled: !!user,
    queryFn: () => getAccountSettings(user!.id),
    staleTime: 60_000,
  });

  const { data: myMatchContext } = useQuery({
    queryKey: ["phase2-match-context", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [profileRes, intentRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("languages,interests,travel_style")
          .eq("id", user!.id)
          .maybeSingle(),
        supabase
          .from("travel_intents")
          .select(
            "destination_country,destination_city,starts_on,ends_on,budget_eur,languages,interests",
          )
          .eq("user_id", user!.id)
          .gte("ends_on", today)
          .order("starts_on", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      return { profile: profileRes.data, intent: intentRes.data };
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!myMatchContext) return;
    const { profile, intent } = myMatchContext;
    setPrefs((current) => ({
      ...current,
      destination: [intent?.destination_city, intent?.destination_country]
        .filter(Boolean)
        .join(", "),
      budget: intent?.budget_eur ?? current.budget,
      languages: intent?.languages?.length
        ? intent.languages
        : profile?.languages?.length
          ? (profile.languages ?? current.languages)
          : current.languages,
      interests: intent?.interests?.length
        ? intent.interests
        : profile?.interests?.length
          ? profile.interests
          : current.interests,
      startsOn: intent?.starts_on ?? current.startsOn,
      endsOn: intent?.ends_on ?? current.endsOn,
    }));
  }, [myMatchContext]);

  useEffect(() => {
    setPrefs((current) => ({
      ...current,
      ageMin: accountSettings.travel_match_age_min,
      ageMax: accountSettings.travel_match_age_max,
      interests: accountSettings.travel_interests.length
        ? accountSettings.travel_interests
        : current.interests,
    }));
  }, [accountSettings]);

  useEffect(() => {
    const journeyDestination =
      destination?.trim() || [journeyTrip?.city, journeyTrip?.country].filter(Boolean).join(", ");
    const journeyStart = startsOn || journeyTrip?.starts_on || null;
    const journeyEnd = endsOn || journeyTrip?.ends_on || null;
    const journeyBudget = Number(journeyTrip?.budget || 0);
    if (!journeyDestination && !journeyStart && !journeyEnd && !journeyBudget) return;

    setPrefs((current) => ({
      ...current,
      destination: journeyDestination || current.destination,
      budget: journeyBudget > 0 ? journeyBudget : current.budget,
      startsOn: journeyStart || current.startsOn,
      endsOn: journeyEnd || current.endsOn,
    }));
  }, [destination, endsOn, journeyTrip, startsOn]);

  const { data: realCandidates = [] } = useQuery({
    queryKey: ["match-real-candidates", user?.id],
    enabled: !!user && accountSettings.travel_match_enabled,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: intents, error: intentError } = await supabase
        .from("travel_intents")
        .select(
          "user_id, destination_country, destination_city, starts_on, ends_on, budget_eur, languages, interests, bio",
        )
        .eq("visibility", "public")
        .gte("ends_on", today)
        .neq("user_id", user!.id)
        .order("starts_on", { ascending: true })
        .limit(200);
      if (intentError) throw intentError;
      const ids = Array.from(new Set((intents ?? []).map((intent) => intent.user_id)));
      if (ids.length === 0) return [] as Candidate[];
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url, bio, birth_date, languages, interests, verified",
        )
        .in("id", ids)
        .eq("visibility", "public")
        .eq("status", "active");
      if (profileError) throw profileError;
      const profileById = new Map(
        (profiles ?? []).map((profile) => [profile.id, profile as RealProfile]),
      );
      return (intents ?? []).flatMap((intent) => {
        const profile = profileById.get(intent.user_id);
        return profile ? [candidateFromData(profile, intent as RealIntent)] : [];
      });
    },
  });

  const { data: excluded } = useQuery({
    queryKey: ["match-exclusions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [likes, passes, relationshipExcluded] = await Promise.all([
        supabase.from("match_likes").select("to_user_id").eq("from_user_id", user!.id),
        supabase.from("match_passes").select("target_id").eq("user_id", user!.id),
        getSuggestionExcludedUserIds(user!.id),
      ]);
      const set = new Set<string>(relationshipExcluded);
      for (const row of likes.data ?? []) set.add(row.to_user_id);
      for (const row of passes.data ?? []) set.add(row.target_id);
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
    if (!accountSettings.travel_match_enabled) return [];
    return realCandidates
      .filter((candidate) => candidate.profileId !== user?.id)
      .filter((candidate) => !seenSet.has(candidate.key))
      .filter((candidate) => !excluded?.has(candidate.profileId))
      .filter(
        (candidate) => !accountSettings.travel_match_verified_only || candidate.verified,
      )
      .map((candidate) => ({ c: candidate, s: scoreTraveler(candidate.t, prefs) }))
      .filter(({ s }) => s.age === null || (s.age >= prefs.ageMin && s.age <= prefs.ageMax))
      .sort((a, b) => b.s.score - a.s.score);
  }, [accountSettings, prefs, seen, realCandidates, excluded, user?.id]);

  const current = deck[0];
  const next = deck[1];
  const sendLike = useServerFn(sendMatchLike);

  useEffect(() => {
    deck.slice(0, 4).forEach(({ c }) => {
      const image = new Image();
      image.decoding = "async";
      if (c.t.avatar) image.src = c.t.avatar;
    });
  }, [deck]);

  function animateOut(direction: "left" | "right") {
    const width = typeof window === "undefined" ? 420 : window.innerWidth;
    const x = direction === "right" ? width * 1.25 : -width * 1.25;
    setDrag({ x, y: 24 });
    return new Promise((resolve) => window.setTimeout(resolve, 190));
  }

  async function advance(direction: "left" | "right", intent?: MatchIntent) {
    if (!current || busy) return;
    const candidate = current.c;
    setBusy(true);
    startRef.current = null;
    try {
      if (!user) {
        toast.error("Connecte-toi pour swiper");
        return;
      }
      await animateOut(direction);
      setSeen((list) => [...list, candidate.key]);
      setDrag(null);
      const targetId = candidate.profileId;

      if (direction === "left") {
        const { error } = await supabase
          .from("match_passes")
          .upsert({ user_id: user.id, target_id: targetId }, { onConflict: "user_id,target_id" });
        if (error) throw error;
        toast(`${candidate.t.name} ignoré`, { description: "Ce profil ne réapparaîtra plus." });
        qc.invalidateQueries({ queryKey: ["match-exclusions", user.id] });
        return;
      }

      if (intent && typeof window !== "undefined") {
        window.localStorage.setItem(`globelink:match-intent:${targetId}`, intent.draft);
      }

      const result = await sendLike({ data: { toUserId: targetId } });
      qc.invalidateQueries({ queryKey: ["match-exclusions", user.id] });
      if (result.matched && result.conversationId) {
        qc.invalidateQueries({ queryKey: ["conversations", user.id] });
        setMatches((list) => [...list, candidate.key]);
        toast.success(`Match avec ${candidate.t.name} ✨`, {
          description: intent
            ? `Votre match est mutuel. Le message « ${intent.label} » est prêt.`
            : "La conversation est ouverte dans Messages.",
          action: {
            label: intent ? "Préparer l’invitation" : "Message",
            onClick: () =>
              navigate({
                to: "/messages/$id",
                params: { id: result.conversationId! },
                search: intent ? { draft: intent.draft } : {},
              }),
          },
        });
      } else {
        toast(`Like envoyé à ${candidate.t.name}`, {
          description: intent
            ? `Si le match devient mutuel, GlobeLink gardera ton idée : « ${intent.label} ».`
            : "Tu verras un match s'il te like en retour.",
        });
      }
    } catch (error) {
      console.error(error);
      toast.error(
        direction === "left" ? "Impossible d'ignorer ce profil" : "Impossible d'envoyer le like",
      );
    } finally {
      setBusy(false);
    }
  }

  function onPointerDown(event: React.PointerEvent) {
    if (busy) return;
    startRef.current = { x: event.clientX, y: event.clientY };
    (event.target as Element).setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: React.PointerEvent) {
    if (!startRef.current) return;
    pendingDrag.current = {
      x: event.clientX - startRef.current.x,
      y: event.clientY - startRef.current.y,
    };
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      setDrag(pendingDrag.current);
    });
  }
  function onPointerUp() {
    if (!drag) {
      startRef.current = null;
      return;
    }
    const threshold = 110;
    if (drag.x > threshold) advance("right");
    else if (drag.x < -threshold) advance("left");
    else {
      setDrag(null);
      startRef.current = null;
    }
  }

  function reset() {
    setSeen([]);
    setMatches([]);
  }

  const rot = drag ? drag.x / 20 : 0;
  const opacityLike = drag && drag.x > 30 ? Math.min(1, drag.x / 150) : 0;
  const opacityNope = drag && drag.x < -30 ? Math.min(1, -drag.x / 150) : 0;

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-lg px-4 py-5">
        {tripId && (
          <section className="mb-4 rounded-[1.6rem] border border-primary/20 bg-primary/[0.06] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Match pour ton voyage</p>
                <p className="mt-1 truncate text-sm font-bold">{journeyTrip?.title ?? destination ?? "Voyage GlobeLink"}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Destination, dates et budget du carnet sont utilisés pour classer les voyageurs les plus compatibles.
                </p>
              </div>
              <MapPin className="h-5 w-5 shrink-0 text-primary" />
            </div>
            <Button asChild size="sm" variant="outline" className="mt-3 rounded-full">
              <Link to="/trips/$id" params={{ id: tripId }}>Retour au carnet</Link>
            </Button>
          </section>
        )}

        <div className="surface-card mb-4 flex items-center justify-between gap-3 rounded-[1.6rem] p-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold">Travel Match</h1>
            <p className="text-xs text-muted-foreground">
              Compatibilité calculée avec destination, dates, budget, langues et affinités.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild size="sm" variant="ghost" aria-label="Paramètres Travel Match">
              <Link to="/settings/profile">
                <Settings2 className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowFilters((value) => !value)}>
              <Filter className="mr-1 h-4 w-4" /> Filtres
            </Button>
          </div>
        </div>

        {!accountSettings.travel_match_enabled ? (
          <div className="surface-card rounded-[2rem] border border-primary/15 p-8 text-center">
            <Heart className="mx-auto h-10 w-10 text-primary" />
            <h2 className="mt-4 font-display text-2xl font-semibold">Travel Match est désactivé</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Ton profil n'est plus proposé dans Travel Match. Réactive-le depuis Paramètres et
              confidentialité quand tu souhaites rencontrer d'autres voyageurs.
            </p>
            <Button asChild className="mt-5 gap-2 rounded-2xl">
              <Link to="/settings/profile">
                <Settings2 className="h-4 w-4" /> Ouvrir les paramètres
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {accountSettings.travel_match_verified_only && (
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-4 w-4" /> Profils vérifiés uniquement
              </div>
            )}

            {showFilters && (
              <div className="surface-card mb-4 space-y-4 rounded-[1.6rem] p-4">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium">
                    Destination
                    <Input
                      value={prefs.destination}
                      onChange={(event) => setPrefs({ ...prefs, destination: event.target.value })}
                      placeholder="Bali, Tokyo…"
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Budget max (€)
                    <Input
                      type="number"
                      value={prefs.budget}
                      onChange={(event) =>
                        setPrefs({ ...prefs, budget: Number(event.target.value) || 0 })
                      }
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Départ
                    <Input
                      type="date"
                      value={prefs.startsOn}
                      onChange={(event) => setPrefs({ ...prefs, startsOn: event.target.value })}
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Retour
                    <Input
                      type="date"
                      value={prefs.endsOn}
                      onChange={(event) => setPrefs({ ...prefs, endsOn: event.target.value })}
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Âge min
                    <Input
                      type="number"
                      min={18}
                      max={99}
                      value={prefs.ageMin}
                      onChange={(event) =>
                        setPrefs({ ...prefs, ageMin: Number(event.target.value) || 18 })
                      }
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Âge max
                    <Input
                      type="number"
                      min={18}
                      max={99}
                      value={prefs.ageMax}
                      onChange={(event) =>
                        setPrefs({ ...prefs, ageMax: Number(event.target.value) || 99 })
                      }
                    />
                  </label>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium">Langues</p>
                  <div className="flex flex-wrap gap-1">
                    {ALL_LANGS.map((language) => {
                      const on = prefs.languages.includes(language);
                      return (
                        <button
                          key={language}
                          onClick={() =>
                            setPrefs({
                              ...prefs,
                              languages: on
                                ? prefs.languages.filter((item) => item !== language)
                                : [...prefs.languages, language],
                            })
                          }
                          className={`rounded-full px-2 py-1 text-[11px] ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                        >
                          {language}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium">Centres d'intérêt</p>
                  <div className="flex flex-wrap gap-1">
                    {ALL_INTERESTS.map((interest) => {
                      const on = prefs.interests.includes(interest);
                      return (
                        <button
                          key={interest}
                          onClick={() =>
                            setPrefs({
                              ...prefs,
                              interests: on
                                ? prefs.interests.filter((item) => item !== interest)
                                : [...prefs.interests, interest],
                            })
                          }
                          className={`rounded-full px-2 py-1 text-[11px] ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                        >
                          {interest}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="relative mx-auto h-[660px] w-full max-w-sm select-none">
              {!current ? (
                <div className="absolute inset-0 grid place-items-center rounded-3xl border border-dashed border-border bg-card p-8 text-center">
                  <div>
                    <Sparkles className="mx-auto mb-2 h-8 w-8 text-primary" />
                    <p className="font-semibold">Aucun autre profil pour le moment</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Les comptes bloqués, restreints ou déjà ignorés ne sont pas proposés.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {matches.length} match(s) enregistré(s).
                    </p>
                    <Button onClick={reset} className="mt-4">
                      <RotateCcw className="mr-2 h-4 w-4" /> Revoir la sélection
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {next && (
                    <SwipeCard
                      t={next.c.t}
                      score={next.s.score}
                      parts={next.s.parts}
                      sharedInts={next.s.sharedInts}
                      sharedLangs={next.s.sharedLangs}
                      overlap={next.s.overlap}
                      age={next.s.age}
                      verified={next.c.verified}
                      stacked
                    />
                  )}
                  <div
                    ref={cardRef}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    style={{
                      transform: `translate3d(${drag?.x ?? 0}px, ${drag?.y ?? 0}px, 0) rotate(${rot}deg)`,
                      transition: startRef.current
                        ? "none"
                        : "transform 190ms cubic-bezier(.2,.8,.2,1)",
                      willChange: "transform",
                    }}
                    className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
                  >
                    <SwipeCard
                      t={current.c.t}
                      score={current.s.score}
                      parts={current.s.parts}
                      sharedInts={current.s.sharedInts}
                      sharedLangs={current.s.sharedLangs}
                      overlap={current.s.overlap}
                      age={current.s.age}
                      verified={current.c.verified}
                      likeOpacity={opacityLike}
                      nopeOpacity={opacityNope}
                    />
                  </div>
                </>
              )}
            </div>

            {current && (
              <section className="surface-card mt-4 rounded-[1.6rem] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Une idée pour briser la glace</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Choisis une intention : elle envoie un like et prépare le message si le match devient mutuel.
                    </p>
                  </div>
                  <UsersRound className="h-5 w-5 shrink-0 text-primary" />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {suggestedMeetups(current.c.t, current.s.sharedInts).map((intent) => {
                    const Icon = intent.id === "coffee" ? Coffee : intent.id === "explore" ? Footprints : Sparkles;
                    return (
                      <button
                        key={intent.id}
                        type="button"
                        disabled={busy}
                        onClick={() => advance("right", intent)}
                        className="rounded-2xl border border-border bg-background/70 p-3 text-left transition hover:border-primary/30 hover:bg-primary/[0.04] disabled:opacity-60"
                      >
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="mt-2 block text-xs font-semibold leading-snug">{intent.label}</span>
                        <span className="mt-1 block text-[10px] leading-snug text-muted-foreground">{intent.helper}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {current && (
              <div className="mt-4 flex items-center justify-center gap-4">
                <button
                  onClick={() => advance("left")}
                  aria-label="Passer"
                  className="grid h-14 w-14 place-items-center rounded-2xl border border-border/70 bg-card text-destructive shadow-soft transition hover:-translate-y-0.5 hover:shadow-elevated active:translate-y-0 active:scale-95"
                >
                  <X className="h-6 w-6" />
                </button>
                <button
                  onClick={() => navigate({ to: "/messages" })}
                  aria-label="Messagerie"
                  className="grid h-12 w-12 place-items-center rounded-2xl border border-border/70 bg-card text-primary shadow-soft transition hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                >
                  <MessageCircle className="h-5 w-5" />
                </button>
                <button
                  onClick={() => advance("right")}
                  aria-label="Match"
                  className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-glow transition hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                >
                  <Heart className="h-6 w-6" />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SwipeCard({
  t,
  score,
  parts,
  sharedInts,
  sharedLangs,
  overlap,
  age,
  verified,
  stacked,
  likeOpacity = 0,
  nopeOpacity = 0,
}: {
  t: MapTraveler;
  score: number;
  parts: { label: string; got: number; max: number }[];
  sharedInts: string[];
  sharedLangs: string[];
  overlap: number;
  age: number | null;
  verified: boolean;
  stacked?: boolean;
  likeOpacity?: number;
  nopeOpacity?: number;
}) {
  const strongParts = parts.filter((part) => part.max > 0 && part.got / part.max >= 0.6);
  const cautionParts = parts.filter((part) => ["Destination", "Dates", "Budget"].includes(part.label) && part.got === 0);
  const signals = [
    overlap > 0 ? `${overlap} jour${overlap > 1 ? "s" : ""} de voyage en commun` : null,
    sharedInts.length ? `${sharedInts.length} centre${sharedInts.length > 1 ? "s" : ""} d’intérêt commun${sharedInts.length > 1 ? "s" : ""}` : null,
    sharedLangs.length ? `${sharedLangs.length} langue${sharedLangs.length > 1 ? "s" : ""} commune${sharedLangs.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className={`surface-card absolute inset-0 overflow-hidden rounded-[2rem] ${stacked ? "scale-95 opacity-65" : ""}`}
      style={stacked ? { transform: "translateY(12px) scale(0.95)" } : undefined}
    >
      <div className="relative h-72 w-full">
        {t.avatar ? (
          <img src={t.avatar} alt={t.name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center bg-secondary text-7xl font-bold text-muted-foreground">
            {t.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="absolute right-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-white backdrop-blur">
          <Sparkles className="mr-1 inline h-3 w-3" /> {score}%
        </div>
        <div
          className="pointer-events-none absolute left-4 top-4 rounded-lg border-4 border-green-400 px-3 py-1 text-2xl font-black uppercase text-green-400"
          style={{ opacity: likeOpacity, transform: "rotate(-12deg)" }}
        >
          Match
        </div>
        <div
          className="pointer-events-none absolute right-4 top-4 rounded-lg border-4 border-red-400 px-3 py-1 text-2xl font-black uppercase text-red-400"
          style={{ opacity: nopeOpacity, transform: "rotate(12deg)" }}
        >
          Nope
        </div>
        <div className="absolute bottom-3 left-4 text-white">
          <p className="flex items-center gap-2 font-display text-2xl font-bold">
            {t.name}
            {age !== null ? `, ${age}` : ""}
            {verified && <ShieldCheck className="h-5 w-5 text-sky-300" />}
          </p>
          <p className="flex items-center gap-1 text-sm opacity-90">
            <MapPin className="h-3.5 w-3.5" /> {[t.city, t.country].filter(Boolean).join(", ")}
          </p>
        </div>
      </div>
      <div className="space-y-3 p-5">
        <p className="text-sm text-foreground/90">{t.bio}</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl bg-secondary p-2">
            <Calendar className="mb-1 h-3.5 w-3.5 text-primary" />
            <p className="font-semibold">
              {new Date(t.starts_on).toLocaleDateString("fr", { day: "2-digit", month: "short" })}
            </p>
            <p className="text-muted-foreground">
              → {new Date(t.ends_on).toLocaleDateString("fr", { day: "2-digit", month: "short" })}
            </p>
          </div>
          <div className="rounded-xl bg-secondary p-2">
            <Wallet className="mb-1 h-3.5 w-3.5 text-primary" />
            <p className="font-semibold">{t.budget_eur ? `${t.budget_eur} €` : "Non indiqué"}</p>
            <p className="text-muted-foreground">Budget</p>
          </div>
          <div className="rounded-xl bg-secondary p-2">
            <Languages className="mb-1 h-3.5 w-3.5 text-primary" />
            <p className="font-semibold truncate">{t.languages[0] ?? "Non indiqué"}</p>
            <p className="text-muted-foreground">+{Math.max(0, t.languages.length - 1)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {t.interests.slice(0, 6).map((interest) => (
            <Badge
              key={interest}
              variant={sharedInts.includes(interest) ? "default" : "secondary"}
              className="text-[10px]"
            >
              {interest}
            </Badge>
          ))}
        </div>
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <CheckCircle2 className="h-4 w-4" /> Pourquoi ce match ?
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              {matchQuality(score)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {signals.length ? signals.map((signal) => (
              <span key={signal} className="rounded-full bg-background/80 px-2 py-1 text-[10px] font-medium text-foreground">
                {signal}
              </span>
            )) : (
              <span className="text-[11px] text-muted-foreground">Complète tes préférences pour obtenir une explication plus précise.</span>
            )}
          </div>
          {sharedInts.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Affinités fortes : <span className="font-semibold text-foreground">{sharedInts.slice(0, 4).join(" · ")}</span>
            </p>
          )}
          {sharedLangs.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Langues communes : <span className="font-semibold text-foreground">{sharedLangs.slice(0, 3).join(" · ")}</span>
            </p>
          )}
          {cautionParts.length > 0 && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              À vérifier : {cautionParts.map((part) => part.label.toLowerCase()).join(", ")}.
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          {parts.slice(0, 6).map((part) => {
            const pct = part.max ? Math.round((part.got / part.max) * 100) : 0;
            return (
              <div key={part.label} className="rounded-xl bg-secondary/55 p-2">
                <div className="flex items-center justify-between gap-1 text-[9px] text-muted-foreground">
                  <span>{part.label}</span><span>{pct}%</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-background">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
