import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronRight,
  Compass,
  LockKeyhole,
  MessageCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

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
    id: "notification-settings",
    label: "Notifications",
    description: "Choisir les alertes que vous souhaitez voir",
    icon: Bell,
  },
] as const;

export function SettingsHub() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);

  const { data: privacy } = useQuery({
    queryKey: ["settings-privacy", user?.id],
    enabled: !!user,
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

  useEffect(() => {
    setPrefs(loadNotificationPreferences(user?.id));
  }, [user?.id]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quickItems;
    return quickItems.filter((item) =>
      `${item.label} ${item.description}`.toLowerCase().includes(q),
    );
  }, [query]);

  const isPublic = privacy?.visibility !== "hidden";

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

  return (
    <div className="space-y-6">
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
              Gérez votre compte, votre confidentialité, vos notifications et la sécurité depuis un
              seul endroit.
            </p>
          </div>
          <Link
            to="/security"
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

        <div className="mt-5 grid gap-3 md:grid-cols-3">
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

      <section
        id="privacy-settings"
        className="scroll-mt-24 rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-2xl">Confidentialité</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choisissez si votre profil peut être découvert publiquement sur GlobeLink.
            </p>
          </div>
        </div>

        <SettingRow
          className="mt-5"
          title="Profil public"
          description="Lorsqu'il est désactivé, votre profil est masqué aux autres utilisateurs et retiré de la recherche des voyageurs. Vos contenus déjà partagés ne sont pas supprimés."
          checked={isPublic}
          disabled={visibilityBusy || !privacy}
          onCheckedChange={setPublicProfile}
        />
      </section>

      <section
        id="notification-settings"
        className="scroll-mt-24 rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-2xl">Notifications</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Réduisez le bruit sans perdre les alertes qui comptent pour vous.
            </p>
          </div>
        </div>

        <div className="mt-5 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70">
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
      </section>
    </div>
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
