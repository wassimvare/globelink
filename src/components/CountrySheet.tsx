import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Wallet, Shield, CloudSun, MapPin, Users, Utensils, Hotel, Camera, MessageCircle, Sparkles, Languages } from "lucide-react";
import { COUNTRY_BY_CODE, type CountryInfo } from "@/lib/country-info";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { MOCK_PLACES } from "@/lib/mock-places";
import { COMMUNITY_QUESTIONS, slugify } from "@/lib/mock-home";

const safetyColor: Record<CountryInfo["safety"], string> = {
  "Très sûr": "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  "Sûr": "bg-green-500/10 text-green-600 border-green-500/30",
  "Prudence": "bg-amber-500/10 text-amber-600 border-amber-500/30",
  "Risqué": "bg-red-500/10 text-red-600 border-red-500/30",
};

export function CountrySheet({ code, onOpenChange }: { code: string | null; onOpenChange: (o: boolean) => void }) {
  const [tab, setTab] = useState<"apercu" | "photos" | "voyageurs" | "questions">("apercu");
  useEffect(() => setTab("apercu"), [code]);
  const c = code ? COUNTRY_BY_CODE.get(code) : null;

  const { data: posts } = useQuery({
    queryKey: ["country-posts", c?.name],
    enabled: !!c,
    queryFn: async () => {
      const { data } = await supabase.from("posts").select("id, image_url, caption").eq("country", c!.name).limit(9);
      return data ?? [];
    },
  });

  const placesForCountry = c
    ? MOCK_PLACES.filter((p) => p.country === c.name)
    : [];
  const hotels = placesForCountry.filter((p) => p.category === "hotel").slice(0, 4);
  const restos = placesForCountry.filter((p) => p.category === "restaurant").slice(0, 4);
  const activities = placesForCountry.filter((p) => ["hiking", "diving", "beach", "waterfall", "hidden", "activity"].includes(p.category)).slice(0, 5);

  // Travelers actually localised in this country by the app:
  // either their profile location is set to this country, or they have an
  // active (public) trip there covering today's date.
  const { data: travelersForCountry = [] } = useQuery({
    queryKey: ["country-travelers", c?.name],
    enabled: !!c,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [byLocation, byTrip] = await Promise.all([
        supabase.from("profiles")
          .select("id, username, display_name, avatar_url, country")
          .eq("country", c!.name)
          .limit(24),
        supabase.from("travel_intents")
          .select("user_id, destination_city, destination_country, starts_on, ends_on")
          .eq("destination_country", c!.name)
          .eq("visibility", "public")
          .lte("starts_on", today)
          .gte("ends_on", today)
          .limit(24),
      ]);

      const map = new Map<string, { id: string; username: string; display_name: string | null; avatar_url: string | null; where: string }>();
      for (const p of byLocation.data ?? []) {
        map.set(p.id, { id: p.id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, where: `Localisé en ${c!.name}` });
      }
      const tripUserIds = (byTrip.data ?? []).map((t) => t.user_id).filter((id) => !map.has(id));
      if (tripUserIds.length > 0) {
        const { data: profs } = await supabase.from("profiles")
          .select("id, username, display_name, avatar_url").in("id", tripUserIds);
        for (const p of profs ?? []) {
          const trip = (byTrip.data ?? []).find((t) => t.user_id === p.id);
          map.set(p.id, {
            id: p.id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url,
            where: `Sur place${trip?.destination_city ? ` · ${trip.destination_city}` : ""}`,
          });
        }
      }
      return Array.from(map.values());
    },
  });
  const questionsForCountry = c ? COMMUNITY_QUESTIONS.filter((q) => q.country === c.name) : [];


  return (
    <Sheet open={!!c} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
        {c && (
          <>
            <div className="relative h-56">
              <img src={c.cover} alt={c.name} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute inset-x-5 bottom-4 text-white">
                <SheetHeader className="p-0 text-left">
                  <SheetTitle className="flex items-center gap-3 font-display text-3xl text-white">
                    <span className="text-4xl">{c.emoji}</span> {c.name}
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.tags.map((t) => (
                    <Badge key={t} className="border-white/30 bg-white/20 text-white backdrop-blur">{t}</Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-5">
              <p className="text-sm leading-relaxed text-foreground/90">{c.intro}</p>

              {/* Quick facts */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <FactCard icon={CalendarDays} label="Meilleure période" value={c.bestTime} />
                <FactCard icon={Wallet} label="Coût / jour" value={c.costPerDay} />
                <FactCard icon={CloudSun} label="Météo" value={c.weatherNow} />
                <div className={`rounded-2xl border p-3 ${safetyColor[c.safety]}`}>
                  <div className="flex items-center gap-2 text-xs opacity-80"><Shield className="h-3.5 w-3.5" /> Sécurité</div>
                  <div className="mt-1 text-sm font-semibold">{c.safety}</div>
                </div>
                <FactCard icon={Languages} label="Langue" value={c.language} />
                <FactCard icon={Wallet} label="Monnaie" value={c.currency} />
              </div>

              <div className="mt-5">
                <Button asChild className="w-full rounded-xl gradient-hero text-primary-foreground shadow-soft">
                  <Link to="/ai-trip" search={{ destination: c.name }}>
                    <Sparkles className="mr-2 h-4 w-4" /> Créer mon voyage avec l'IA
                  </Link>
                </Button>
              </div>

              {/* Tabs */}
              <div className="mt-6 flex gap-1 rounded-xl bg-secondary p-1 text-xs font-medium">
                {[
                  { k: "apercu", label: "Aperçu" },
                  { k: "photos", label: "Photos" },
                  { k: "voyageurs", label: "Voyageurs" },
                  { k: "questions", label: "Questions" },
                ].map((t) => (
                  <button
                    key={t.k}
                    onClick={() => setTab(t.k as any)}
                    className={`flex-1 rounded-lg py-2 transition ${tab === t.k ? "bg-background shadow-soft" : "text-muted-foreground"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "apercu" && (
                <div className="mt-5 space-y-6">
                  <SectionList icon={Camera} title="Activités populaires" items={c.activities} />
                  {hotels.length > 0 && (
                    <PlaceGroup icon={Hotel} title="Hôtels" items={hotels.map((h) => ({ name: h.name, sub: h.city, image: h.image_url, rating: h.rating }))} />
                  )}
                  {restos.length > 0 && (
                    <PlaceGroup icon={Utensils} title="Restaurants" items={restos.map((h) => ({ name: h.name, sub: h.city, image: h.image_url, rating: h.rating }))} />
                  )}
                  {activities.length > 0 && (
                    <PlaceGroup icon={MapPin} title="À faire sur place" items={activities.map((h) => ({ name: h.name, sub: h.city, image: h.image_url, rating: h.rating }))} />
                  )}
                </div>
              )}

              {tab === "photos" && (
                <div className="mt-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Camera className="h-4 w-4" /> Photos & vidéos</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[...c.gallery, ...(posts ?? []).map((p) => p.image_url)].slice(0, 12).map((src, i) => (
                      <div key={i} className="aspect-square overflow-hidden rounded-lg">
                        <img src={src} alt="" className="h-full w-full object-cover transition hover:scale-105" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === "voyageurs" && (
                <div className="mt-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> Voyageurs présents en {c.name}</div>
                  {travelersForCountry.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Aucun voyageur GlobeLink n'est actuellement en {c.name}.</p>
                  ) : (
                    <div className="space-y-2">
                      {travelersForCountry.slice(0, 8).map((t) => (
                        <Link
                          key={t.id}
                          to="/profile/$username"
                          params={{ username: t.username }}
                          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-accent/40 hover:shadow-soft"
                        >
                          {t.avatar_url
                            ? <img src={t.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                            : <span className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-semibold">{t.username[0]?.toUpperCase()}</span>}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{t.display_name ?? `@${t.username}`}</div>
                            <div className="truncate text-xs text-muted-foreground">@{t.username} · {t.where}</div>
                          </div>
                        </Link>
                      ))}
                    </div>

                  )}
                </div>
              )}

              {tab === "questions" && (
                <div className="mt-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><MessageCircle className="h-4 w-4" /> Questions sur {c.name}</div>
                  {questionsForCountry.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Aucune question sur {c.name} pour l'instant. Sois le premier à en poser une !</p>
                  ) : (
                    <div className="space-y-2">
                      {questionsForCountry.map((q, i) => (
                        <Link key={q.slug ?? i} to="/questions/$slug" params={{ slug: q.slug }} className="block rounded-xl border border-border bg-card p-3 transition hover:border-accent/40 hover:shadow-soft">
                          <div className="text-sm font-medium">{q.q}</div>
                          <div className="mt-1 text-xs text-muted-foreground">par @{q.author} · {q.answers} réponses · {q.votes} votes</div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="h-8" />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FactCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function SectionList({ icon: Icon, title, items }: { icon: any; title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4" /> {title}</div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it}>
            <Link to="/activities/$slug" params={{ slug: slugify(it) }} className="flex items-start gap-2 rounded-lg py-1 text-sm transition hover:text-accent">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> {it}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlaceGroup({ icon: Icon, title, items }: { icon: any; title: string; items: { name: string; sub?: string; image?: string; rating?: number }[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4" /> {title}</div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.name} className="overflow-hidden rounded-xl border border-border bg-card">
            {it.image && <div className="aspect-video overflow-hidden"><img src={it.image} alt="" className="h-full w-full object-cover" /></div>}
            <div className="p-2">
              <div className="truncate text-sm font-medium">{it.name}</div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate">{it.sub}</span>
                {it.rating && <span>★ {it.rating.toFixed(1)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
