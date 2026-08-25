import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  Check,
  EyeOff,
  MessageSquareText,
  ShieldCheck,
  Star,
  Tags,
  UserMinus,
  UserRoundCheck,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_SOCIAL_PRIVACY_SETTINGS,
  getSocialPrivacySettings,
  listCloseFriends,
  listMutedProfiles,
  listPendingPostTags,
  listStoryHiddenAccounts,
  removeMute,
  respondToPostTag,
  saveSocialPrivacySettings,
  searchMuteProfiles,
  searchRelationshipProfiles,
  setCloseFriend,
  setMute,
  setStoryHidden,
  type SocialPermission,
  type SocialPrivacySettings,
  type SocialProfile,
} from "@/lib/social-privacy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const permissionLabels: Record<SocialPermission, string> = {
  everyone: "Tout le monde",
  following: "Comptes que je suis",
  nobody: "Personne",
};

export function SocialPrivacySettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SocialPrivacySettings>(DEFAULT_SOCIAL_PRIVACY_SETTINGS);
  const [hiddenWordsText, setHiddenWordsText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audienceSearch, setAudienceSearch] = useState("");
  const [submittedAudienceSearch, setSubmittedAudienceSearch] = useState("");
  const [muteSearch, setMuteSearch] = useState("");
  const [submittedMuteSearch, setSubmittedMuteSearch] = useState("");
  const [busyProfile, setBusyProfile] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["social-privacy-settings", user?.id],
    enabled: !!user,
    queryFn: () => getSocialPrivacySettings(user!.id),
  });
  const { data: closeFriends = [] } = useQuery({
    queryKey: ["close-friends", user?.id],
    enabled: !!user,
    queryFn: () => listCloseFriends(user!.id),
  });
  const { data: storyHidden = [] } = useQuery({
    queryKey: ["story-hidden-accounts", user?.id],
    enabled: !!user,
    queryFn: () => listStoryHiddenAccounts(user!.id),
  });
  const { data: mutedProfiles = [] } = useQuery({
    queryKey: ["muted-profiles", user?.id],
    enabled: !!user,
    queryFn: () => listMutedProfiles(user!.id),
  });
  const { data: pendingTags = [] } = useQuery({
    queryKey: ["pending-post-tags", user?.id],
    enabled: !!user,
    queryFn: () => listPendingPostTags(user!.id),
  });
  const { data: audienceResults = [], isFetching: audienceSearching } = useQuery({
    queryKey: ["social-audience-search", user?.id, submittedAudienceSearch],
    enabled: !!user && submittedAudienceSearch.length >= 2,
    queryFn: () => searchRelationshipProfiles(user!.id, submittedAudienceSearch),
  });
  const { data: muteResults = [], isFetching: muteSearching } = useQuery({
    queryKey: ["social-mute-search", user?.id, submittedMuteSearch],
    enabled: !!user && submittedMuteSearch.length >= 2,
    queryFn: () => searchMuteProfiles(user!.id, submittedMuteSearch),
  });

  useEffect(() => {
    if (!settings) return;
    setDraft(settings);
    setHiddenWordsText(settings.hidden_words.join(", "));
    setDirty(false);
  }, [settings]);

  const closeIds = useMemo(() => new Set(closeFriends.map((profile) => profile.id)), [closeFriends]);
  const hiddenIds = useMemo(() => new Set(storyHidden.map((profile) => profile.id)), [storyHidden]);
  const mutedIds = useMemo(() => new Set(mutedProfiles.map((profile) => profile.id)), [mutedProfiles]);

  function update<K extends keyof SocialPrivacySettings>(key: K, value: SocialPrivacySettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  async function save() {
    if (!user || saving) return;
    setSaving(true);
    try {
      const hiddenWords = hiddenWordsText
        .split(",")
        .map((word) => word.trim())
        .filter(Boolean);
      const saved = await saveSocialPrivacySettings(user.id, { ...draft, hidden_words: hiddenWords });
      setDraft(saved);
      setHiddenWordsText(saved.hidden_words.join(", "));
      setDirty(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["social-privacy-settings", user.id] }),
        qc.invalidateQueries({ queryKey: ["account-settings", user.id] }),
        qc.invalidateQueries({ queryKey: ["stories"] }),
      ]);
      toast.success("Confidentialité sociale enregistrée");
    } catch (error) {
      toast.error((error as Error).message || "Impossible d'enregistrer ces réglages");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCloseFriend(profile: SocialProfile) {
    if (!user || busyProfile) return;
    setBusyProfile(profile.id);
    try {
      const enabled = !closeIds.has(profile.id);
      await setCloseFriend(user.id, profile.id, enabled);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["close-friends", user.id] }),
        qc.invalidateQueries({ queryKey: ["stories"] }),
      ]);
      toast.success(enabled ? `${profile.display_name || `@${profile.username}`} ajouté aux Amis proches` : "Retiré des Amis proches");
    } catch (error) {
      toast.error((error as Error).message || "Action impossible");
    } finally {
      setBusyProfile(null);
    }
  }

  async function toggleStoryHidden(profile: SocialProfile) {
    if (!user || busyProfile) return;
    setBusyProfile(profile.id);
    try {
      const enabled = !hiddenIds.has(profile.id);
      await setStoryHidden(user.id, profile.id, enabled);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["story-hidden-accounts", user.id] }),
        qc.invalidateQueries({ queryKey: ["stories"] }),
      ]);
      toast.success(enabled ? "Tes stories sont maintenant masquées pour ce compte" : "Ce compte peut de nouveau voir tes stories selon leur audience");
    } catch (error) {
      toast.error((error as Error).message || "Action impossible");
    } finally {
      setBusyProfile(null);
    }
  }

  async function mute(profile: SocialProfile) {
    if (!user || busyProfile) return;
    setBusyProfile(profile.id);
    try {
      await setMute(user.id, profile.id, { mute_posts: true, mute_stories: true });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["muted-profiles", user.id] }),
        qc.invalidateQueries({ queryKey: ["feed"] }),
        qc.invalidateQueries({ queryKey: ["stories"] }),
      ]);
      toast.success(`${profile.display_name || `@${profile.username}`} mis en sourdine`);
    } catch (error) {
      toast.error((error as Error).message || "Action impossible");
    } finally {
      setBusyProfile(null);
    }
  }

  async function unmute(profile: SocialProfile) {
    if (!user || busyProfile) return;
    setBusyProfile(profile.id);
    try {
      await removeMute(user.id, profile.id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["muted-profiles", user.id] }),
        qc.invalidateQueries({ queryKey: ["feed"] }),
        qc.invalidateQueries({ queryKey: ["stories"] }),
      ]);
      toast.success("Compte réactivé dans ton fil");
    } catch {
      toast.error("Impossible de retirer la sourdine");
    } finally {
      setBusyProfile(null);
    }
  }

  async function answerTag(postId: string, action: "approved" | "declined") {
    try {
      await respondToPostTag(postId, action);
      await qc.invalidateQueries({ queryKey: ["pending-post-tags", user?.id] });
      toast.success(action === "approved" ? "Identification approuvée" : "Identification refusée");
    } catch (error) {
      toast.error((error as Error).message || "Action impossible");
    }
  }

  return (
    <section id="social-privacy-v2" className="mt-6 space-y-6 scroll-mt-24">
      <div className="rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-2xl">Interactions et confidentialité sociale</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Mentions, identifications, demandes de messages, mots masqués et statut en ligne.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <PermissionSelect
            icon={<AtSign className="h-4 w-4" />}
            title="Qui peut te mentionner ?"
            value={draft.mention_permission}
            onChange={(value) => update("mention_permission", value)}
          />
          <PermissionSelect
            icon={<Tags className="h-4 w-4" />}
            title="Qui peut t'identifier ?"
            value={draft.tag_permission}
            onChange={(value) => update("tag_permission", value)}
          />
        </div>

        <div className="mt-4 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70">
          <ToggleRow
            title="Approuver les identifications manuellement"
            description="Une identification reste en attente tant que tu ne l'as pas approuvée."
            checked={draft.manual_tag_approval}
            onChange={(value) => update("manual_tag_approval", value)}
          />
          <ToggleRow
            icon={<MessageSquareText className="h-4 w-4" />}
            title="Demandes de messages"
            description="Les personnes autorisées à te contacter mais que tu ne suis pas passent d'abord par une demande."
            checked={draft.allow_message_requests}
            onChange={(value) => update("allow_message_requests", value)}
          />
          <ToggleRow
            title="Filtrer les commentaires potentiellement offensants"
            description="Bloque automatiquement une petite liste d'insultes évidentes avant publication sur tes posts."
            checked={draft.filter_offensive_comments}
            onChange={(value) => update("filter_offensive_comments", value)}
          />
          <ToggleRow
            icon={<UserRoundCheck className="h-4 w-4" />}
            title="Afficher mon statut en ligne"
            description="Autorise les membres connectés à voir si tu as été actif récemment, sauf comptes bloqués."
            checked={draft.show_activity_status}
            onChange={(value) => update("show_activity_status", value)}
          />
        </div>

        <label className="mt-4 block space-y-2 text-sm font-semibold">
          Mots masqués
          <Input
            value={hiddenWordsText}
            onChange={(event) => {
              setHiddenWordsText(event.target.value);
              setDirty(true);
            }}
            placeholder="mot1, expression à masquer, mot2"
          />
          <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
            Si un commentaire contient l'un de ces mots ou expressions, GlobeLink le refuse avant publication.
          </span>
        </label>

        <div className="mt-5 flex justify-end">
          <Button disabled={!dirty || saving} onClick={() => void save()} className="rounded-xl">
            {saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
          </Button>
        </div>
      </div>

      {pendingTags.length > 0 && (
        <div className="rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="flex items-center gap-2 font-semibold">
            <Tags className="h-5 w-5 text-primary" /> Identifications à approuver ({pendingTags.length})
          </div>
          <div className="mt-4 space-y-2">
            {pendingTags.map((tag: any) => (
              <div key={`${tag.post_id}-${tag.tagger_id}`} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {tag.profile?.display_name || tag.profile?.username || "Un membre"}
                  </p>
                  <p className="text-xs text-muted-foreground">souhaite t'identifier sur une publication</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void answerTag(tag.post_id, "declined")}>
                  <X className="mr-1 h-4 w-4" /> Refuser
                </Button>
                <Button size="sm" onClick={() => void answerTag(tag.post_id, "approved")}>
                  <Check className="mr-1 h-4 w-4" /> Accepter
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <Star className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-2xl">Stories et Amis proches</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choisis l'audience par défaut et les personnes qui peuvent ou non voir tes stories.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-border/70 bg-background/45 p-4">
          <label className="text-sm font-semibold">Audience par défaut de tes nouvelles stories</label>
          <select
            value={draft.story_default_audience}
            onChange={(event) => update("story_default_audience", event.target.value as "followers" | "close_friends")}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
          >
            <option value="followers">Tous mes abonnés</option>
            <option value="close_friends">Amis proches uniquement</option>
          </select>
        </div>

        <SearchBox
          value={audienceSearch}
          onChange={setAudienceSearch}
          onSubmit={() => setSubmittedAudienceSearch(audienceSearch.trim())}
          placeholder="Rechercher parmi tes abonnés et abonnements"
          loading={audienceSearching}
        />

        {submittedAudienceSearch.length >= 2 && (
          <div className="mt-3 space-y-2">
            {audienceResults.length === 0 && !audienceSearching ? (
              <p className="text-xs text-muted-foreground">Aucun compte lié à ton profil ne correspond.</p>
            ) : (
              audienceResults.map((profile) => (
                <div key={profile.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 p-3 sm:flex-row sm:items-center">
                  <ProfileIdentity profile={profile} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={closeIds.has(profile.id) ? "default" : "outline"}
                      disabled={busyProfile === profile.id}
                      onClick={() => void toggleCloseFriend(profile)}
                    >
                      <Star className={`mr-1 h-4 w-4 ${closeIds.has(profile.id) ? "fill-current" : ""}`} />
                      {closeIds.has(profile.id) ? "Ami proche" : "Ajouter proche"}
                    </Button>
                    <Button
                      size="sm"
                      variant={hiddenIds.has(profile.id) ? "default" : "outline"}
                      disabled={busyProfile === profile.id}
                      onClick={() => void toggleStoryHidden(profile)}
                    >
                      <EyeOff className="mr-1 h-4 w-4" />
                      {hiddenIds.has(profile.id) ? "Story masquée" : "Masquer story"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <ManagedList
            icon={<Star className="h-4 w-4 text-emerald-600" />}
            title={`Amis proches (${closeFriends.length})`}
            empty="Aucun ami proche pour le moment."
            profiles={closeFriends}
            actionLabel="Retirer"
            onAction={toggleCloseFriend}
          />
          <ManagedList
            icon={<EyeOff className="h-4 w-4 text-primary" />}
            title={`Stories masquées (${storyHidden.length})`}
            empty="Tes stories ne sont masquées pour personne."
            profiles={storyHidden}
            actionLabel="Réautoriser"
            onAction={toggleStoryHidden}
          />
        </div>
      </div>

      <div className="rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <VolumeX className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-2xl">Comptes en sourdine</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Leurs publications disparaissent de ton fil et leurs stories de ta barre de stories, sans les bloquer.
            </p>
          </div>
        </div>

        <SearchBox
          value={muteSearch}
          onChange={setMuteSearch}
          onSubmit={() => setSubmittedMuteSearch(muteSearch.trim())}
          placeholder="Rechercher un compte à mettre en sourdine"
          loading={muteSearching}
        />
        {submittedMuteSearch.length >= 2 && (
          <div className="mt-3 space-y-2">
            {muteResults
              .filter((profile) => !mutedIds.has(profile.id))
              .map((profile) => (
                <div key={profile.id} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3">
                  <ProfileIdentity profile={profile} />
                  <Button size="sm" variant="outline" disabled={busyProfile === profile.id} onClick={() => void mute(profile)}>
                    <VolumeX className="mr-1 h-4 w-4" /> Sourdine
                  </Button>
                </div>
              ))}
          </div>
        )}
        <div className="mt-5">
          <ManagedList
            icon={<VolumeX className="h-4 w-4 text-primary" />}
            title={`En sourdine (${mutedProfiles.length})`}
            empty="Aucun compte en sourdine."
            profiles={mutedProfiles}
            actionLabel="Réactiver"
            onAction={unmute}
          />
        </div>
      </div>
    </section>
  );
}

function PermissionSelect({
  icon,
  title,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  value: SocialPermission;
  onChange: (value: SocialPermission) => void;
}) {
  return (
    <label className="rounded-2xl border border-border/70 bg-background/45 p-4 text-sm font-semibold">
      <span className="flex items-center gap-2">{icon}{title}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SocialPermission)}
        className="mt-3 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary/40"
      >
        {Object.entries(permissionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
  );
}

function ToggleRow({ icon, title, description, checked, onChange }: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 bg-background/45 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SearchBox({ value, onChange, onSubmit, placeholder, loading }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  loading: boolean;
}) {
  return (
    <div className="mt-4 flex gap-2">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") onSubmit(); }}
        placeholder={placeholder}
        className="h-11 rounded-xl"
      />
      <Button type="button" variant="outline" onClick={onSubmit} disabled={value.trim().length < 2 || loading}>
        {loading ? "…" : "Rechercher"}
      </Button>
    </div>
  );
}

function ProfileIdentity({ profile }: { profile: SocialProfile }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {profile.avatar_url ? (
        <img src={profile.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary font-semibold">
          {(profile.display_name || profile.username)[0]?.toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{profile.display_name || profile.username}</p>
        <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>
      </div>
    </div>
  );
}

function ManagedList({ icon, title, empty, profiles, actionLabel, onAction }: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  profiles: SocialProfile[];
  actionLabel: string;
  onAction: (profile: SocialProfile) => void | Promise<void>;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/45 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>
      {profiles.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {profiles.map((profile) => (
            <div key={profile.id} className="flex items-center gap-2 rounded-xl bg-card p-2.5">
              <ProfileIdentity profile={profile} />
              <button
                type="button"
                onClick={() => void onAction(profile)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <UserMinus className="h-3.5 w-3.5" /> {actionLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
