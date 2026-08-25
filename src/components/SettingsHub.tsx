import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Bell,
  ChevronRight,
  Compass,
  Heart,
  LocateFixed,
  LockKeyhole,
  Map,
  MessageCircle,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/user-preferences";
import {
  DEFAULT_ACCOUNT_SETTINGS,
  getAccountSettings,
  listRelationshipControls,
  removeRelationshipControl,
  saveAccountSettings,
  searchProfilesForControl,
  setRelationshipControl,
  type AccountSettings,
  type RelationshipMode,
} from "@/lib/account-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export type SettingsHubSection =
  | "privacy"
  | "interactions"
  | "notifications"
  | "accounts"
  | "travel-match"
  | "travel";

const quickItems = [
  {
    id: "profile-editor",
    label: "Votre compte",
    description: "Photo, pseudo, bio et informations personnelles",
    icon: UserRound,
  },
  {
    id: "privacy-settings",
    label: "Confidentialité",
    description: "Contrôler la visibilité de votre profil",
    icon: LockKeyhole,
  },
  {
    id: "interaction-settings",
    label: "Messages et interactions",
    description: "Choisir qui peut vous contacter et commenter",
    icon: MessageCircle,
  },
  {
    id: "notification-settings",
    label: "Notifications",
    description: "Choisir les alertes que vous souhaitez voir",
    icon: Bell,
  },
  {
    id: "account-controls",
    label: "Comptes bloqués et restreints",
    description: "Gérer les comptes que vous ne souhaitez plus voir",
    icon: ShieldAlert,
  },
  {
    id: "travel-match-settings",
    label: "Travel Match",
    description: "Visibilité, âge et profils vérifiés",
    icon: Heart,
  },
  {
    id: "travel-preferences",
    label: "Voyage et localisation",
    description: "Budget, intérêts, carte et géolocalisation",
    icon: Compass,
  },
] as const;

const messagePermissionLabels: Record<AccountSettings["message_permission"], string> = {
  everyone: "Tout le monde",
  following: "Comptes que je suis",
  matches: "Matches Travel Match uniquement",
  nobody: "Personne",
};

const budgetLabels: Record<AccountSettings["preferred_budget"], string> = {
  budget: "Économique",
  balanced: "Équilibré",
  comfort: "Confort",
  premium: "Premium",
};

export function SettingsHub({ activeSection }: { activeSection?: SettingsHubSection } = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const showAll = !activeSection;
  const needsPrivacy = showAll || activeSection === "privacy";
  const needsNotifications = showAll || activeSection === "notifications";
  const needsControls = showAll || activeSection === "accounts";
  const needsAccountSettings =
    showAll ||
    activeSection === "interactions" ||
    activeSection === "travel-match" ||
    activeSection === "travel";
  const sectionNeedsSave =
    showAll ||
    activeSection === "interactions" ||
    activeSection === "travel-match" ||
    activeSection === "travel";

  const [query, setQuery] = useState("");
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [settingsDraft, setSettingsDraft] = useState<AccountSettings>(DEFAULT_ACCOUNT_SETTINGS);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [travelInterestsText, setTravelInterestsText] = useState("");
  const [controlSearch, setControlSearch] = useState("");
  const [submittedControlSearch, setSubmittedControlSearch] = useState("");
  const [controlBusy, setControlBusy] = useState<string | null>(null);

  const { data: privacy } = useQuery({
    queryKey: ["settings-privacy", user?.id],
    enabled: !!user && needsPrivacy,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("visibility")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: accountSettings } = useQuery({
    queryKey: ["account-settings", user?.id],
    enabled: !!user && needsAccountSettings,
    queryFn: () => getAccountSettings(user!.id),
  });

  const { data: controls = [] } = useQuery({
    queryKey: ["relationship-controls", user?.id],
    enabled: !!user && needsControls,
    queryFn: () => listRelationshipControls(user!.id),
  });

  const { data: controlSearchResults = [], isFetching: searchingControls } = useQuery({
    queryKey: ["relationship-control-search", user?.id, submittedControlSearch],
    enabled:
      !!user &&
      needsControls &&
      submittedControlSearch.trim().length >= 2,
    queryFn: () => searchProfilesForControl(user!.id, submittedControlSearch),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!needsNotifications) return;
    setPrefs(loadNotificationPreferences(user?.id));
  }, [user?.id, needsNotifications]);

  useEffect(() => {
    if (!accountSettings) return;
    setSettingsDraft(accountSettings);
    setTravelInterestsText(accountSettings.travel_interests.join(", "));
    setSettingsDirty(false);
  }, [accountSettings]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quickItems;
    return quickItems.filter((item) =>
      `${item.label} ${item.description}`.toLowerCase().includes(q),
    );
  }, [query]);

  const isPublic = privacy?.visibility !== "hidden";
  const blockedControls = controls.filter((control) => control.mode === "blocked");
  const restrictedControls = controls.filter((control) => control.mode === "restricted");

  async function setPublicProfile(nextPublic: boolean) {
    if (!user || visibilityBusy) return;
    setVisibilityBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ visibility: nextPublic ? "public" : "hidden" })
      .eq("id", user.id);
    setVisibilityBusy(false);
    if (error) {
      toast.error("Impossible de modifier la confidentialité du profil.");
      return;
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["settings-privacy", user.id] }),
      qc.invalidateQueries({ queryKey: ["profile-page"] }),
      qc.invalidateQueries({ queryKey: ["profile", user.id] }),
      qc.invalidateQueries({ queryKey: ["search"] }),
      qc.invalidateQueries({ queryKey: ["match-real-candidates"] }),
    ]);
    toast.success(nextPublic ? "Profil visible publiquement" : "Profil masqué du public");
  }

  function updatePreference<K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) {
    if (!user) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    saveNotificationPreferences(user.id, next);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
    qc.invalidateQueries({ queryKey: ["notifications-unread", user.id] });
  }

  function updateSetting<K extends keyof AccountSettings>(key: K, value: AccountSettings[K]) {
    setSettingsDraft((current) => ({ ...current, [key]: value }));
    setSettingsDirty(true);
  }

  async function saveSettings() {
    if (!user || savingSettings) return;
    const travelInterests = travelInterestsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
    const next = { ...settingsDraft, travel_interests: travelInterests };
    setSavingSettings(true);
    try {
      const saved = await saveAccountSettings(user.id, next);
      setSettingsDraft(saved);
      setTravelInterestsText(saved.travel_interests.join(", "));
      setSettingsDirty(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["account-settings", user.id] }),
        qc.invalidateQueries({ queryKey: ["phase2-match-context", user.id] }),
        qc.invalidateQueries({ queryKey: ["match-real-candidates"] }),
        qc.invalidateQueries({ queryKey: ["match-exclusions", user.id] }),
      ]);
      toast.success("Paramètres enregistrés");
    } catch (error) {
      toast.error((error as Error).message || "Impossible d'enregistrer les paramètres");
    } finally {
      setSavingSettings(false);
    }
  }

  async function toggleLocation(value: boolean) {
    if (!value) {
      updateSetting("use_location", false);
      updateSetting("precise_location", false);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        updateSetting("use_location", true);
        toast.success("Localisation autorisée pour GlobeLink");
      },
      () => toast.error("Autorise la localisation dans les réglages de ton navigateur."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  async function applyControl(targetId: string, mode: RelationshipMode, label: string) {
    if (!user || controlBusy) return;
    if (mode === "blocked") {
      const confirmed = window.confirm(
        `Bloquer ${label} ? Vous ne pourrez plus démarrer de nouvelle conversation ensemble et ce compte sera retiré de vos suggestions.`,
      );
      if (!confirmed) return;
    }
    setControlBusy(targetId);
    try {
      await setRelationshipControl(user.id, targetId, mode);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["relationship-controls", user.id] }),
        qc.invalidateQueries({ queryKey: ["relationship-control-search"] }),
        qc.invalidateQueries({ queryKey: ["search"] }),
        qc.invalidateQueries({ queryKey: ["match-exclusions", user.id] }),
        qc.invalidateQueries({ queryKey: ["match-real-candidates"] }),
      ]);
      toast.success(mode === "blocked" ? `${label} bloqué` : `${label} restreint`);
    } catch (error) {
      toast.error((error as Error).message || "Action impossible");
    } finally {
      setControlBusy(null);
    }
  }

  async function removeControl(targetId: string, label: string) {
    if (!user || controlBusy) return;
    setControlBusy(targetId);
    try {
      await removeRelationshipControl(user.id, targetId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["relationship-controls", user.id] }),
        qc.invalidateQueries({ queryKey: ["search"] }),
        qc.invalidateQueries({ queryKey: ["match-exclusions", user.id] }),
        qc.invalidateQueries({ queryKey: ["match-real-candidates"] }),
      ]);
      toast.success(`Restriction retirée pour ${label}`);
    } catch {
      toast.error("Impossible de retirer ce réglage");
    } finally {
      setControlBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {showAll && (
        <section className="surface-card overflow-hidden rounded-[2rem] border border-border/70 p-5 shadow-soft sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="eyebrow">
                <SlidersHorizontal className="h-4 w-4" /> Paramètres GlobeLink
              </div>
              <h1 className="mt-2 font-display text-3xl font-semibold sm:text-5xl">
                Paramètres et confidentialité
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Gérez votre compte, vos interactions, Travel Match et vos préférences de voyage depuis
                un seul endroit.
              </p>
            </div>
            <Link
              to="/security"
              preload="intent"
              className="pressable inline-flex min-h-12 items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
            >
              <ShieldCheck className="h-4 w-4" /> Sécurité du compte
              <ChevronRight className="ml-auto h-4 w-4" />
            </Link>
          </div>

          <div className="relative mt-6">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher dans les paramètres"
              className="h-12 rounded-2xl pl-11"
            />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="group rounded-2xl border border-border/70 bg-background/65 p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 font-semibold">
                        {item.label}
                        <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {(showAll || activeSection === "privacy") && (
        <SettingsSection
          id="privacy-settings"
          icon={<LockKeyhole className="h-5 w-5" />}
          title="Confidentialité"
          description="Choisissez si votre profil peut être découvert publiquement sur GlobeLink."
        >
          <SettingRow
            title="Profil public"
            description="Lorsqu'il est désactivé, votre profil est masqué aux autres utilisateurs et retiré de la recherche des voyageurs. Vos contenus déjà partagés ne sont pas supprimés."
            checked={isPublic}
            disabled={visibilityBusy || !privacy}
            onCheckedChange={setPublicProfile}
          />
        </SettingsSection>
      )}

      {(showAll || activeSection === "interactions") && (
        <SettingsSection
          id="interaction-settings"
          icon={<MessageCircle className="h-5 w-5" />}
          title="Messages et interactions"
          description="Contrôlez les nouvelles conversations et les commentaires sur vos publications."
        >
          <div className="grid gap-4 rounded-2xl border border-border/70 bg-background/45 p-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold">
              Qui peut démarrer une nouvelle conversation ?
              <select
                value={settingsDraft.message_permission}
                onChange={(event) =>
                  updateSetting(
                    "message_permission",
                    event.target.value as AccountSettings["message_permission"],
                  )
                }
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary/40"
              >
                {Object.entries(messagePermissionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
                Les conversations déjà ouvertes restent disponibles, sauf si un compte est bloqué.
              </span>
            </label>
            <SettingRow
              title="Autoriser les commentaires"
              description="Quand cette option est désactivée, les autres utilisateurs ne peuvent plus ajouter de nouveaux commentaires à vos publications."
              checked={settingsDraft.allow_comments}
              onCheckedChange={(value) => updateSetting("allow_comments", value)}
            />
          </div>
        </SettingsSection>
      )}

      {(showAll || activeSection === "notifications") && (
        <SettingsSection
          id="notification-settings"
          icon={<Bell className="h-5 w-5" />}
          title="Notifications"
          description="Réduisez le bruit sans perdre les alertes qui comptent pour vous."
        >
          <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70">
            <SettingRow
              title="Tout mettre en pause"
              description="Masque temporairement toutes les notifications dans l'application."
              checked={prefs.pauseAll}
              onCheckedChange={(value) => updatePreference("pauseAll", value)}
            />
            <SettingRow
              icon={<UserRound className="h-4 w-4" />}
              title="Activité sociale"
              description="J'aime, commentaires, abonnements, mentions et avis."
              checked={prefs.social}
              disabled={prefs.pauseAll}
              onCheckedChange={(value) => updatePreference("social", value)}
            />
            <SettingRow
              icon={<MessageCircle className="h-4 w-4" />}
              title="Messages et Travel Match"
              description="Nouveaux messages et interactions liées à Travel Match."
              checked={prefs.messages}
              disabled={prefs.pauseAll}
              onCheckedChange={(value) => updatePreference("messages", value)}
            />
            <SettingRow
              icon={<Compass className="h-4 w-4" />}
              title="Voyage"
              description="Offres, lieux à proximité, badges et validation de lieux."
              checked={prefs.travel}
              disabled={prefs.pauseAll}
              onCheckedChange={(value) => updatePreference("travel", value)}
            />
          </div>
        </SettingsSection>
      )}

      {(showAll || activeSection === "accounts") && (
        <SettingsSection
          id="account-controls"
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Comptes bloqués et restreints"
          description="Bloquez complètement un compte ou retirez-le simplement de vos suggestions."
        >
          <div className="rounded-2xl border border-border/70 bg-background/45 p-4">
            <div className="flex gap-2">
              <Input
                value={controlSearch}
                onChange={(event) => setControlSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") setSubmittedControlSearch(controlSearch.trim());
                }}
                placeholder="Rechercher @pseudo ou nom"
                className="h-11 rounded-xl"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setSubmittedControlSearch(controlSearch.trim())}
                disabled={controlSearch.trim().length < 2 || searchingControls}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {submittedControlSearch.length >= 2 && (
              <div className="mt-3 space-y-2">
                {controlSearchResults.length === 0 && !searchingControls ? (
                  <p className="text-xs text-muted-foreground">Aucun compte trouvé.</p>
                ) : (
                  controlSearchResults.map((profile) => (
                    <div
                      key={profile.id}
                      className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {profile.display_name || profile.username}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={controlBusy === profile.id}
                          onClick={() =>
                            applyControl(
                              profile.id,
                              "restricted",
                              profile.display_name || `@${profile.username}`,
                            )
                          }
                        >
                          <UserX className="mr-1 h-4 w-4" /> Restreindre
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                          disabled={controlBusy === profile.id}
                          onClick={() =>
                            applyControl(
                              profile.id,
                              "blocked",
                              profile.display_name || `@${profile.username}`,
                            )
                          }
                        >
                          <Ban className="mr-1 h-4 w-4" /> Bloquer
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <ControlList
            title={`Bloqués (${blockedControls.length})`}
            empty="Aucun compte bloqué."
            items={blockedControls}
            busyId={controlBusy}
            onRemove={removeControl}
          />
          <ControlList
            title={`Restreints (${restrictedControls.length})`}
            empty="Aucun compte restreint."
            items={restrictedControls}
            busyId={controlBusy}
            onRemove={removeControl}
          />
        </SettingsSection>
      )}

      {(showAll || activeSection === "travel-match") && (
        <SettingsSection
          id="travel-match-settings"
          icon={<Heart className="h-5 w-5" />}
          title="Travel Match"
          description="Décidez si vous apparaissez dans Travel Match et affinez les profils proposés."
        >
          <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70">
            <SettingRow
              title="Activer Travel Match"
              description="Si vous le désactivez, vos intentions de voyage publiques en cours passent en privé et vous n'apparaissez plus dans les nouvelles suggestions."
              checked={settingsDraft.travel_match_enabled}
              onCheckedChange={(value) => updateSetting("travel_match_enabled", value)}
            />
            <SettingRow
              title="Profils vérifiés uniquement"
              description="N'afficher que les voyageurs dont le profil GlobeLink est vérifié."
              checked={settingsDraft.travel_match_verified_only}
              disabled={!settingsDraft.travel_match_enabled}
              onCheckedChange={(value) => updateSetting("travel_match_verified_only", value)}
            />
          </div>

          <div className="mt-4 grid gap-4 rounded-2xl border border-border/70 bg-background/45 p-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold">
              Âge minimum
              <Input
                type="number"
                min={18}
                max={99}
                value={settingsDraft.travel_match_age_min}
                disabled={!settingsDraft.travel_match_enabled}
                onChange={(event) =>
                  updateSetting("travel_match_age_min", Number(event.target.value) || 18)
                }
              />
            </label>
            <label className="space-y-2 text-sm font-semibold">
              Âge maximum
              <Input
                type="number"
                min={18}
                max={99}
                value={settingsDraft.travel_match_age_max}
                disabled={!settingsDraft.travel_match_enabled}
                onChange={(event) =>
                  updateSetting("travel_match_age_max", Number(event.target.value) || 99)
                }
              />
            </label>
          </div>
        </SettingsSection>
      )}

      {(showAll || activeSection === "travel") && (
        <SettingsSection
          id="travel-preferences"
          icon={<Compass className="h-5 w-5" />}
          title="Voyage et localisation"
          description="Ces préférences serviront aux recommandations, à Travel Match et à la carte GlobeLink."
        >
          <div className="grid gap-4 rounded-2xl border border-border/70 bg-background/45 p-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold">
              Style de budget
              <select
                value={settingsDraft.preferred_budget}
                onChange={(event) =>
                  updateSetting(
                    "preferred_budget",
                    event.target.value as AccountSettings["preferred_budget"],
                  )
                }
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary/40"
              >
                {Object.entries(budgetLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold">
              Devise
              <Input
                value={settingsDraft.preferred_currency}
                maxLength={3}
                onChange={(event) => updateSetting("preferred_currency", event.target.value)}
                placeholder="EUR"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold sm:col-span-2">
              Centres d'intérêt voyage
              <Input
                value={travelInterestsText}
                onChange={(event) => {
                  setTravelInterestsText(event.target.value);
                  setSettingsDirty(true);
                }}
                placeholder="Plage, randonnée, street food, plongée…"
              />
              <span className="block text-xs font-normal text-muted-foreground">
                Séparez les intérêts par des virgules.
              </span>
            </label>
          </div>

          <div className="mt-4 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70">
            <SettingRow
              icon={<LocateFixed className="h-4 w-4" />}
              title="Utiliser ma localisation"
              description="Autorise GlobeLink à utiliser la position de l'appareil pour les recommandations de proximité."
              checked={settingsDraft.use_location}
              onCheckedChange={toggleLocation}
            />
            <SettingRow
              title="Position précise"
              description="Utiliser une localisation plus précise lorsque le navigateur l'autorise."
              checked={settingsDraft.precise_location}
              disabled={!settingsDraft.use_location}
              onCheckedChange={(value) => updateSetting("precise_location", value)}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-border/70 bg-background/45 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Map className="h-4 w-4 text-primary" /> Catégories visibles sur la carte
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <MiniToggle
                label="🏨 Hôtels"
                checked={settingsDraft.map_hotels}
                onChange={(value) => updateSetting("map_hotels", value)}
              />
              <MiniToggle
                label="🍴 Restaurants"
                checked={settingsDraft.map_restaurants}
                onChange={(value) => updateSetting("map_restaurants", value)}
              />
              <MiniToggle
                label="🎟️ Activités"
                checked={settingsDraft.map_activities}
                onChange={(value) => updateSetting("map_activities", value)}
              />
              <MiniToggle
                label="🔥 Offres"
                checked={settingsDraft.map_offers}
                onChange={(value) => updateSetting("map_offers", value)}
              />
            </div>
          </div>
        </SettingsSection>
      )}

      {sectionNeedsSave && (
        <div className="sticky bottom-4 z-20 flex justify-end">
          <Button
            type="button"
            size="lg"
            disabled={!settingsDirty || savingSettings}
            onClick={saveSettings}
            className="gap-2 rounded-2xl shadow-elevated"
          >
            <Save className="h-4 w-4" />
            {savingSettings
              ? "Enregistrement…"
              : settingsDirty
                ? "Enregistrer les paramètres"
                : "Paramètres enregistrés"}
          </Button>
        </div>
      )}
    </div>
  );
}

function SettingsSection({
  id,
  icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-6"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <h2 className="font-display text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function SettingRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  icon,
  className,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-4 bg-background/45 p-4 ${className ?? ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </div>
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function MiniToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-3 py-2.5">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ControlList({
  title,
  empty,
  items,
  busyId,
  onRemove,
}: {
  title: string;
  empty: string;
  items: Awaited<ReturnType<typeof listRelationshipControls>>;
  busyId: string | null;
  onRemove: (targetId: string, label: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/45 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Users className="h-4 w-4 text-primary" /> {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const label = item.profile?.display_name || item.profile?.username || "Compte";
            return (
              <div
                key={item.target_id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{label}</p>
                  {item.profile?.username && (
                    <p className="truncate text-xs text-muted-foreground">@{item.profile.username}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busyId === item.target_id}
                  onClick={() => onRemove(item.target_id, label)}
                  aria-label={`Retirer le réglage pour ${label}`}
                  className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
