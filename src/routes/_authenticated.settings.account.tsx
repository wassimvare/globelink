import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Camera,
  ChevronRight,
  Clock3,
  Database,
  Download,
  HardDrive,
  KeyRound,
  Laptop,
  Loader2,
  LocateFixed,
  LogOut,
  Mail,
  Mic,
  Palette,
  PauseCircle,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import {
  clearGlobeLinkCache,
  deactivateAccount,
  deleteAccountPermanently,
  exportAccountData,
  getBrowserStorageEstimate,
  listMySessions,
  listSecurityEvents,
  logSecurityEvent,
  resetRecommendations,
  revokeMySession,
  type AccountSession,
} from "@/lib/account-data";

export const Route = createFileRoute("/_authenticated/settings/account")({
  head: () => ({
    meta: [
      { title: "Compte, données et sécurité — GlobeLink" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccountDataPage,
});

type PermissionStateMap = {
  geolocation: string;
  notifications: string;
  camera: string;
  microphone: string;
};

const eventLabels: Record<string, string> = {
  email_change_requested: "Modification d’e-mail demandée",
  password_changed: "Mot de passe modifié",
  password_reset_requested: "Lien de réinitialisation demandé",
  other_sessions_revoked: "Autres appareils déconnectés",
  all_sessions_revoked: "Toutes les sessions déconnectées",
  session_revoked: "Appareil déconnecté",
  data_exported: "Données du compte exportées",
  recommendations_reset: "Recommandations réinitialisées",
  account_deactivated: "Compte désactivé",
  account_reactivated: "Compte réactivé",
  cache_cleared: "Cache GlobeLink nettoyé",
};

function AccountDataPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deletePhrase, setDeletePhrase] = useState("");
  const [storage, setStorage] = useState<{ usage: number | null; quota: number | null }>({ usage: null, quota: null });
  const [permissions, setPermissions] = useState<PermissionStateMap>({
    geolocation: "inconnu",
    notifications: typeof Notification === "undefined" ? "indisponible" : Notification.permission,
    camera: "inconnu",
    microphone: "inconnu",
  });

  const sessions = useQuery({
    queryKey: ["account-sessions", user?.id],
    enabled: !!user,
    queryFn: listMySessions,
    refetchInterval: 60_000,
  });

  const securityEvents = useQuery({
    queryKey: ["account-security-events", user?.id],
    enabled: !!user,
    queryFn: () => listSecurityEvents(30),
  });

  useEffect(() => {
    getBrowserStorageEstimate().then(setStorage).catch(() => {});
  }, []);

  useEffect(() => {
    async function readPermissions() {
      if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
      const next = { ...permissions };
      for (const name of ["geolocation", "camera", "microphone"] as const) {
        try {
          const result = await navigator.permissions.query({ name: name as PermissionName });
          next[name] = result.state;
        } catch {
          next[name] = "géré par le navigateur";
        }
      }
      if (typeof Notification !== "undefined") next.notifications = Notification.permission;
      setPermissions(next);
    }
    void readPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const otherSessions = useMemo(
    () => (sessions.data ?? []).filter((session) => !session.is_current),
    [sessions.data],
  );

  async function run(key: string, work: () => Promise<void>, success?: string) {
    if (busy) return;
    setBusy(key);
    try {
      await work();
      if (success) toast.success(success);
    } catch (error) {
      toast.error((error as Error).message || "Action impossible");
    } finally {
      setBusy(null);
    }
  }

  async function updateEmail() {
    const email = newEmail.trim().toLowerCase();
    if (!email || email === user?.email?.toLowerCase()) return;
    await run("email", async () => {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      await logSecurityEvent("email_change_requested", { new_email_domain: email.split("@")[1] ?? null });
      await qc.invalidateQueries({ queryKey: ["account-security-events", user?.id] });
    }, "Vérifie tes e-mails pour confirmer la nouvelle adresse.");
  }

  async function updatePassword() {
    if (password.length < 8) return toast.error("Utilise au moins 8 caractères.");
    if (password !== passwordConfirm) return toast.error("Les mots de passe ne correspondent pas.");
    await run("password", async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setPasswordConfirm("");
      await logSecurityEvent("password_changed");
      await qc.invalidateQueries({ queryKey: ["account-security-events", user?.id] });
    }, "Mot de passe modifié.");
  }

  async function revokeSession(session: AccountSession) {
    if (session.is_current) return;
    if (!window.confirm(`Déconnecter ${deviceLabel(session.user_agent)} ?`)) return;
    await run(`session-${session.session_id}`, async () => {
      await revokeMySession(session.session_id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["account-sessions", user?.id] }),
        qc.invalidateQueries({ queryKey: ["account-security-events", user?.id] }),
      ]);
    }, "Appareil déconnecté.");
  }

  async function signOutOthers() {
    if (!otherSessions.length) return;
    if (!window.confirm("Déconnecter tous les autres appareils et garder celui-ci connecté ?")) return;
    await run("others", async () => {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      await logSecurityEvent("other_sessions_revoked", { count: otherSessions.length });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["account-sessions", user?.id] }),
        qc.invalidateQueries({ queryKey: ["account-security-events", user?.id] }),
      ]);
    }, "Tous les autres appareils ont été déconnectés.");
  }

  async function downloadData() {
    await run("export", async () => {
      const data = await exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `globelink-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      await qc.invalidateQueries({ queryKey: ["account-security-events", user?.id] });
    }, "Export GlobeLink préparé.");
  }

  async function clearCache() {
    await run("cache", async () => {
      await clearGlobeLinkCache();
      setStorage(await getBrowserStorageEstimate());
      await qc.invalidateQueries({ queryKey: ["account-security-events", user?.id] });
    }, "Cache GlobeLink nettoyé. Ta session reste connectée.");
  }

  async function resetSuggestions() {
    if (!window.confirm("Réinitialiser Travel Match, les recherches et les centres d’intérêt utilisés pour les recommandations ? Tes publications et tes J’aime ne seront pas supprimés.")) return;
    await run("recommendations", async () => {
      await resetRecommendations();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["account-settings", user?.id] }),
        qc.invalidateQueries({ queryKey: ["my-activity", user?.id] }),
        qc.invalidateQueries({ queryKey: ["match-real-candidates"] }),
        qc.invalidateQueries({ queryKey: ["match-exclusions", user?.id] }),
        qc.invalidateQueries({ queryKey: ["account-security-events", user?.id] }),
      ]);
    }, "Recommandations réinitialisées.");
  }

  async function deactivate() {
    const confirmation = window.prompt('Tape DESACTIVER pour masquer temporairement ton compte.');
    if (confirmation !== "DESACTIVER") return;
    await run("deactivate", async () => {
      await deactivateAccount();
      await qc.invalidateQueries();
      navigate({ to: "/account-deactivated", replace: true });
    });
  }

  async function deleteForever() {
    if (!user?.email) return toast.error("Aucune adresse e-mail confirmable sur ce compte.");
    if (deleteEmail.trim().toLowerCase() !== user.email.toLowerCase() || deletePhrase !== "SUPPRIMER") {
      return toast.error("Entre ton e-mail exact et le mot SUPPRIMER.");
    }
    if (!window.confirm("Supprimer définitivement le compte GlobeLink ? Cette action est irréversible.")) return;
    await run("delete", async () => {
      await deleteAccountPermanently(deleteEmail.trim(), deletePhrase);
      await supabase.auth.signOut({ scope: "local" });
      qc.clear();
      navigate({ to: "/", replace: true });
    });
  }

  async function requestPermission(kind: keyof PermissionStateMap) {
    try {
      if (kind === "notifications" && typeof Notification !== "undefined") {
        const state = await Notification.requestPermission();
        setPermissions((current) => ({ ...current, notifications: state }));
        return;
      }
      if (kind === "geolocation" && navigator.geolocation) {
        await new Promise<void>((resolve, reject) => navigator.geolocation.getCurrentPosition(() => resolve(), reject, { timeout: 8000 }));
        setPermissions((current) => ({ ...current, geolocation: "granted" }));
        return;
      }
      if ((kind === "camera" || kind === "microphone") && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: kind === "camera", audio: kind === "microphone" });
        stream.getTracks().forEach((track) => track.stop());
        setPermissions((current) => ({ ...current, [kind]: "granted" }));
      }
    } catch {
      setPermissions((current) => ({ ...current, [kind]: "denied" }));
      toast.error("Permission refusée ou indisponible dans les réglages du navigateur.");
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-9">
        <header className="mb-6 rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-7">
          <div className="eyebrow"><ShieldCheck className="h-4 w-4" /> Centre du compte</div>
          <h1 className="mt-2 font-display text-3xl font-semibold sm:text-5xl">Compte, données et sécurité</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Gère tes accès, tes appareils, tes données personnelles, les permissions du téléphone et le cycle de vie de ton compte GlobeLink.
          </p>
        </header>

        <div className="space-y-6">
          <Section icon={<Mail className="h-5 w-5" />} title="Identifiants du compte" description="Modifier l’adresse e-mail ou le mot de passe avec Supabase Auth.">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="text-sm font-semibold">Adresse e-mail</p>
                <div className="mt-3 flex gap-2"><Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" /><Button disabled={busy !== null || !newEmail.trim()} onClick={() => void updateEmail()}>Modifier</Button></div>
                <p className="mt-2 text-xs text-muted-foreground">Une confirmation peut être demandée sur l’ancienne et/ou la nouvelle adresse selon la configuration Auth.</p>
              </div>
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4" /> Nouveau mot de passe</p>
                <div className="mt-3 grid gap-2"><Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="8 caractères minimum" /><Input value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} type="password" placeholder="Confirmer" /><Button disabled={busy !== null || !password} onClick={() => void updatePassword()}>Changer le mot de passe</Button></div>
              </div>
            </div>
            <Link to="/security" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">Ouvrir aussi le centre de sécurité <ChevronRight className="h-4 w-4" /></Link>
          </Section>

          <Section icon={<Smartphone className="h-5 w-5" />} title="Appareils et sessions" description="Sessions réelles enregistrées par Supabase Auth. Aucun jeton n’est affiché.">
            <div className="space-y-3">
              {(sessions.data ?? []).map((session) => (
                <div key={session.session_id} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/45 p-4 sm:flex-row sm:items-center">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{isMobileUa(session.user_agent) ? <Smartphone className="h-5 w-5" /> : <Laptop className="h-5 w-5" />}</div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{deviceLabel(session.user_agent)} {session.is_current && <span className="ml-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600">Cet appareil</span>}</p><p className="mt-1 text-xs text-muted-foreground">{session.ip ? `IP ${session.ip} · ` : ""}activité {formatDate(session.refreshed_at || session.updated_at)}</p></div>
                  {!session.is_current && <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void revokeSession(session)}>Déconnecter</Button>}
                </div>
              ))}
              {!sessions.isLoading && (sessions.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Aucune session active trouvée.</p>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" disabled={busy !== null || otherSessions.length === 0} onClick={() => void signOutOthers()}><LogOut className="mr-2 h-4 w-4" /> Déconnecter les autres appareils</Button><Button variant="outline" onClick={() => void sessions.refetch()} disabled={sessions.isFetching}><RefreshCcw className="mr-2 h-4 w-4" /> Actualiser</Button></div>
          </Section>

          <Section icon={<Download className="h-5 w-5" />} title="Télécharger tes données" description="Crée un fichier JSON privé avec ton profil, contenus, interactions, voyages, paramètres, recherches et conversations auxquelles tu participes.">
            <Button disabled={busy !== null} onClick={() => void downloadData()}>{busy === "export" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Télécharger mon export</Button>
          </Section>

          <Section icon={<Sparkles className="h-5 w-5" />} title="Données utilisées pour les recommandations" description="Travel Match utilise notamment tes centres d’intérêt, recherches et choix de profils.">
            <p className="text-sm text-muted-foreground">La réinitialisation efface les recherches, likes/pass de Travel Match et centres d’intérêt de recommandation. Elle ne supprime ni tes publications, ni tes messages, ni tes J’aime sociaux.</p>
            <Button className="mt-4" variant="outline" disabled={busy !== null} onClick={() => void resetSuggestions()}><RefreshCcw className="mr-2 h-4 w-4" /> Réinitialiser les recommandations</Button>
          </Section>

          <Section icon={<HardDrive className="h-5 w-5" />} title="Stockage et cache" description="Nettoie les caches de cette installation sans supprimer la session Supabase.">
            <div className="grid gap-3 sm:grid-cols-2"><Metric label="Utilisé par ce site" value={formatBytes(storage.usage)} /><Metric label="Quota navigateur estimé" value={formatBytes(storage.quota)} /></div>
            <Button className="mt-4" variant="outline" disabled={busy !== null} onClick={() => void clearCache()}><Trash2 className="mr-2 h-4 w-4" /> Nettoyer le cache GlobeLink</Button>
          </Section>

          <Section icon={<LocateFixed className="h-5 w-5" />} title="Permissions de l’appareil" description="Teste les autorisations réellement accordées par ton navigateur ou ton téléphone.">
            <div className="grid gap-3 sm:grid-cols-2">
              <PermissionCard icon={<LocateFixed className="h-4 w-4" />} label="Localisation" value={permissions.geolocation} onRequest={() => void requestPermission("geolocation")} />
              <PermissionCard icon={<Bell className="h-4 w-4" />} label="Notifications" value={permissions.notifications} onRequest={() => void requestPermission("notifications")} />
              <PermissionCard icon={<Camera className="h-4 w-4" />} label="Caméra" value={permissions.camera} onRequest={() => void requestPermission("camera")} />
              <PermissionCard icon={<Mic className="h-4 w-4" />} label="Microphone" value={permissions.microphone} onRequest={() => void requestPermission("microphone")} />
            </div>
          </Section>

          <Section icon={<Palette className="h-5 w-5" />} title="Apparence" description="Le choix est appliqué immédiatement sur cet appareil.">
            <div className="flex gap-2"><Button variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")}>Mode clair</Button><Button variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")}>Mode sombre</Button></div>
          </Section>

          <Section icon={<Clock3 className="h-5 w-5" />} title="Historique de sécurité" description="Actions sensibles enregistrées sur ton compte.">
            <div className="space-y-2">{(securityEvents.data ?? []).map((event) => <div key={event.id} className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/45 px-3 py-2.5"><span className="text-sm font-medium">{eventLabels[event.event_type] ?? event.event_type}</span><span className="shrink-0 text-xs text-muted-foreground">{formatDate(event.created_at)}</span></div>)}{!securityEvents.isLoading && (securityEvents.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Aucune action sensible enregistrée pour le moment.</p>}</div>
          </Section>

          <Section icon={<PauseCircle className="h-5 w-5" />} title="Désactiver temporairement le compte" description="Ton profil est retiré de la recherche et de Travel Match. Tes données restent conservées et tu peux réactiver le compte plus tard.">
            <Button variant="outline" disabled={busy !== null} onClick={() => void deactivate()}><PauseCircle className="mr-2 h-4 w-4" /> Désactiver temporairement</Button>
          </Section>

          <section className="rounded-[2rem] border border-destructive/30 bg-destructive/[0.03] p-5 shadow-soft sm:p-6">
            <div className="flex items-start gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-destructive/10 text-destructive"><Trash2 className="h-5 w-5" /></div><div><h2 className="font-display text-2xl">Supprimer définitivement le compte</h2><p className="mt-1 text-sm text-muted-foreground">Suppression irréversible du compte Auth et des données liées. Les fichiers dont tu es propriétaire dans Storage sont nettoyés avant la suppression.</p></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><Input value={deleteEmail} onChange={(e) => setDeleteEmail(e.target.value)} placeholder={user?.email ?? "Ton e-mail"} type="email" /><Input value={deletePhrase} onChange={(e) => setDeletePhrase(e.target.value)} placeholder="Tape SUPPRIMER" /></div>
            <Button className="mt-3" variant="destructive" disabled={busy !== null || !deleteEmail || deletePhrase !== "SUPPRIMER"} onClick={() => void deleteForever()}>{busy === "delete" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Supprimer définitivement</Button>
          </section>
        </div>
      </main>
    </div>
  );
}

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-6"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div><div><h2 className="font-display text-2xl">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div><div className="mt-5">{children}</div></section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border/70 bg-background/45 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>;
}

function PermissionCard({ icon, label, value, onRequest }: { icon: React.ReactNode; label: string; value: string; onRequest: () => void }) {
  const good = value === "granted";
  return <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/45 p-4"><div className={good ? "text-emerald-600" : "text-primary"}>{icon}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{label}</p><p className="text-xs text-muted-foreground">{permissionLabel(value)}</p></div>{value !== "granted" && value !== "indisponible" && <Button size="sm" variant="outline" onClick={onRequest}>Autoriser</Button>}</div>;
}

function permissionLabel(value: string) {
  if (value === "granted") return "Autorisé";
  if (value === "denied") return "Refusé — modifiable dans les réglages du navigateur";
  if (value === "prompt" || value === "default") return "À demander";
  return value;
}

function isMobileUa(ua: string | null) {
  return /Mobi|Android|iPhone|iPad/i.test(ua ?? "");
}

function deviceLabel(ua: string | null) {
  const value = ua ?? "";
  if (/iPhone/i.test(value)) return "iPhone";
  if (/iPad/i.test(value)) return "iPad";
  if (/Android/i.test(value)) return "Appareil Android";
  if (/Macintosh|Mac OS X/i.test(value)) return "Mac";
  if (/Windows/i.test(value)) return "PC Windows";
  if (/Linux/i.test(value)) return "Ordinateur Linux";
  return value ? "Navigateur" : "Appareil inconnu";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "inconnue";
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatBytes(value: number | null) {
  if (value === null) return "Non disponible";
  if (value < 1024) return `${value} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[index]}`;
}
