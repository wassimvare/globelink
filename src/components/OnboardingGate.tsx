import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Compass, Languages, MapPin, Sparkles, UserRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const INTERESTS = [
  "Nature",
  "Randonnée",
  "Plage",
  "Plongée",
  "Street food",
  "Photo",
  "Culture",
  "Vie nocturne",
  "Aventure",
  "Shopping",
  "Bien-être",
  "Road trip",
];
const LANGUAGES = ["Français", "Anglais", "Espagnol", "Italien", "Arabe", "Portugais", "Allemand"];
const STYLES = [
  "Backpacker",
  "Confort",
  "Aventure",
  "Culture",
  "Nature",
  "Food trip",
  "Digital nomad",
];

function storageKey(userId: string) {
  return `globelink.phase2.onboarding.${userId}`;
}

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [travelStyle, setTravelStyle] = useState("");
  const [destinationCountry, setDestinationCountry] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["phase2-onboarding-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name,city,country,interests,languages,travel_style")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setCity(profile.city ?? "");
    setCountry(profile.country ?? "");
    setInterests(profile.interests ?? []);
    setLanguages(profile.languages ?? []);
    setTravelStyle(profile.travel_style ?? "");
  }, [profile]);

  const alreadyDone = useMemo(() => {
    if (!user || typeof window === "undefined") return true;
    return localStorage.getItem(storageKey(user.id)) === "done";
  }, [user]);

  const profileLooksComplete =
    !!profile &&
    (profile.interests?.length ?? 0) >= 2 &&
    (profile.languages?.length ?? 0) >= 1 &&
    !!profile.travel_style;

  const show = !!user && !isLoading && !dismissed && !alreadyDone && !profileLooksComplete;

  function finishLocally() {
    if (user && typeof window !== "undefined") localStorage.setItem(storageKey(user.id), "done");
    setDismissed(true);
  }

  async function save() {
    if (!user || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
          interests,
          languages,
          travel_style: travelStyle || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (error) throw error;

      if (destinationCountry.trim() && startsOn && endsOn && endsOn >= startsOn) {
        const { data: existing } = await supabase
          .from("travel_intents")
          .select("id")
          .eq("user_id", user.id)
          .eq("destination_country", destinationCountry.trim())
          .eq("starts_on", startsOn)
          .eq("ends_on", endsOn)
          .maybeSingle();
        if (!existing) {
          const { error: intentError } = await supabase.from("travel_intents").insert({
            user_id: user.id,
            destination_country: destinationCountry.trim(),
            destination_city: destinationCity.trim() || null,
            starts_on: startsOn,
            ends_on: endsOn,
            interests,
            languages,
            travel_style: travelStyle || null,
            visibility: "public",
          });
          if (intentError) throw intentError;
        }
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["phase2-onboarding-profile", user.id] }),
        qc.invalidateQueries({ queryKey: ["match-real-candidates"] }),
      ]);
      finishLocally();
      toast.success("GlobeLink est personnalisé pour toi ✨");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'enregistrer l'onboarding");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {children}
      {show && (
        <div className="fixed inset-0 z-[120] grid place-items-end bg-slate-950/55 p-0 backdrop-blur-sm sm:place-items-center sm:p-5">
          <section className="phase2-onboarding relative max-h-[94dvh] w-full overflow-y-auto rounded-t-[2rem] border border-border bg-card shadow-elevated sm:max-w-xl sm:rounded-[2rem]">
            <button
              type="button"
              onClick={finishLocally}
              className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-secondary text-muted-foreground"
              aria-label="Faire plus tard"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="p-5 sm:p-7">
              <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary">
                <Sparkles className="h-4 w-4" /> Bienvenue sur GlobeLink
              </div>
              <div className="mb-6 grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={`h-1.5 rounded-full ${index <= step ? "bg-primary" : "bg-secondary"}`}
                  />
                ))}
              </div>

              {step === 0 && (
                <div className="space-y-5">
                  <StepTitle
                    icon={<UserRound className="h-5 w-5" />}
                    title="Fais connaissance"
                    subtitle="Ces infos rendent ton profil et les recommandations plus utiles."
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nom affiché">
                      <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Wassim"
                      />
                    </Field>
                    <Field label="Ville">
                      <Input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Lyon"
                      />
                    </Field>
                    <Field label="Pays">
                      <Input
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="France"
                      />
                    </Field>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <StepTitle
                    icon={<Compass className="h-5 w-5" />}
                    title="Qu'est-ce que tu aimes ?"
                    subtitle="Choisis au moins deux centres d'intérêt pour personnaliser la carte, le feed et Travel Match."
                  />
                  <ChoiceGrid
                    values={INTERESTS}
                    selected={interests}
                    onToggle={(value) => setInterests(toggle(interests, value))}
                  />
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <StepTitle
                    icon={<Languages className="h-5 w-5" />}
                    title="Ton style de voyage"
                    subtitle="GlobeLink utilisera ces critères pour classer les voyageurs compatibles."
                  />
                  <div>
                    <p className="mb-2 text-sm font-semibold">Langues</p>
                    <ChoiceGrid
                      values={LANGUAGES}
                      selected={languages}
                      onToggle={(value) => setLanguages(toggle(languages, value))}
                      compact
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold">Style principal</p>
                    <div className="flex flex-wrap gap-2">
                      {STYLES.map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => setTravelStyle(style)}
                          className={`rounded-full border px-3 py-2 text-sm font-medium transition ${travelStyle === style ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/40"}`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <StepTitle
                    icon={<MapPin className="h-5 w-5" />}
                    title="Ton prochain voyage"
                    subtitle="Optionnel, mais c'est ce qui rend Travel Match et les pages destination vraiment personnels."
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Pays de destination">
                      <Input
                        value={destinationCountry}
                        onChange={(e) => setDestinationCountry(e.target.value)}
                        placeholder="Indonésie"
                      />
                    </Field>
                    <Field label="Ville / île">
                      <Input
                        value={destinationCity}
                        onChange={(e) => setDestinationCity(e.target.value)}
                        placeholder="Bali"
                      />
                    </Field>
                    <Field label="Départ">
                      <Input
                        type="date"
                        value={startsOn}
                        onChange={(e) => setStartsOn(e.target.value)}
                      />
                    </Field>
                    <Field label="Retour">
                      <Input
                        type="date"
                        value={endsOn}
                        onChange={(e) => setEndsOn(e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              )}

              <div className="mt-7 flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  onClick={step === 0 ? finishLocally : () => setStep((value) => value - 1)}
                >
                  {step === 0 ? "Plus tard" : "Retour"}
                </Button>
                {step < 3 ? (
                  <Button
                    onClick={() => setStep((value) => Math.min(3, value + 1))}
                    disabled={
                      (step === 1 && interests.length < 2) || (step === 2 && languages.length < 1)
                    }
                  >
                    Continuer
                  </Button>
                ) : (
                  <Button onClick={save} disabled={saving}>
                    {saving ? "Enregistrement…" : "Terminer"}
                  </Button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function StepTitle({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
function ChoiceGrid({
  values,
  selected,
  onToggle,
  compact = false,
}: {
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-2 sm:grid-cols-3"}>
      {values.map((value) => {
        const on = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            className={`rounded-2xl border px-3 py-2.5 text-sm font-medium transition ${on ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-border bg-background hover:border-primary/40"}`}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}
function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
