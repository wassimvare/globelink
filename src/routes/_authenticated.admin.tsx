import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminStats, adminListUsers, adminSetUserStatus, adminDeleteUser, adminSetUserRole,
  adminListReports, adminResolveReport, adminDeleteContent, adminRecentContent,
  adminListAnnouncements, adminUpsertAnnouncement, adminDeleteAnnouncement,
  adminListDemos, adminGetMyRoles, adminAuditLog, adminClaimBootstrap,
  adminSetUserAccess, adminListBadges, adminSetUserBadge,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/BackButton";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Shield, Users, Flag, FileText, BarChart3, Megaphone, Bot, ScrollText,
  Ban, Trash2, Check, X, ShieldCheck, ShieldOff, UserCog, Search,
  BadgeCheck, Eye, EyeOff, Sparkles, Star, Settings2, ChevronDown,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  loader: async () => {
    const roles = await adminGetMyRoles();
    if (!roles.includes("admin")) {
      // Allow bootstrap page — component handles the empty admin case.
      return { roles };
    }
    return { roles };
  },
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md p-8 text-center">
      <Shield className="mx-auto h-10 w-10 text-destructive" />
      <h2 className="mt-4 font-display text-xl">Accès refusé</h2>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button asChild className="mt-4"><Link to="/">Retour</Link></Button>
    </div>
  ),
  component: AdminPage,
});

function AdminPage() {
  const { roles } = Route.useLoaderData();
  if (!roles.includes("admin")) return <BootstrapView />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <BackButton compact />
        <div className="grid h-11 w-11 place-items-center rounded-xl gradient-hero text-primary-foreground shadow-glow">

          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Administration</h1>
          <p className="text-sm text-muted-foreground">Gestion de la plateforme — accès admin uniquement</p>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="glass mb-4 flex w-full flex-wrap gap-1 rounded-xl p-1">
          <TabsTrigger value="overview"><BarChart3 className="mr-2 h-4 w-4" />Analytics</TabsTrigger>
          <TabsTrigger value="users"><Users className="mr-2 h-4 w-4" />Utilisateurs</TabsTrigger>
          <TabsTrigger value="reports"><Flag className="mr-2 h-4 w-4" />Signalements</TabsTrigger>
          <TabsTrigger value="content"><FileText className="mr-2 h-4 w-4" />Contenu</TabsTrigger>
          <TabsTrigger value="announcements"><Megaphone className="mr-2 h-4 w-4" />Annonces</TabsTrigger>
          <TabsTrigger value="demos"><Bot className="mr-2 h-4 w-4" />Démo</TabsTrigger>
          <TabsTrigger value="audit"><ScrollText className="mr-2 h-4 w-4" />Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="reports"><ReportsTab /></TabsContent>
        <TabsContent value="content"><ContentTab /></TabsContent>
        <TabsContent value="announcements"><AnnouncementsTab /></TabsContent>
        <TabsContent value="demos"><DemosTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function BootstrapView() {
  const claim = useServerFn(adminClaimBootstrap);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => claim(),
    onSuccess: () => { toast.success("Vous êtes désormais administrateur"); qc.invalidateQueries(); location.reload(); },
    onError: (e: any) => toast.error(e.message ?? "Erreur"),
  });
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <Shield className="mx-auto h-12 w-12 text-primary" />
      <h2 className="mt-4 font-display text-2xl font-semibold">Aucun administrateur</h2>
      <p className="mt-2 text-sm text-muted-foreground">Aucun administrateur n'est encore configuré. Pour sécuriser la plateforme, seul l'identifiant défini dans ADMIN_BOOTSTRAP_USER_ID peut initialiser ce rôle.</p>
      <Button className="mt-4 gradient-hero text-primary-foreground" onClick={() => m.mutate()} disabled={m.isPending}>
        Initialiser l’administration
      </Button>
    </div>
  );
}

/* ---------------- Overview ---------------- */
function OverviewTab() {
  const fn = useServerFn(adminStats);
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fn() });
  if (isLoading || !data) return <div className="p-8 text-center text-muted-foreground">Chargement…</div>;

  const cards = [
    { label: "Utilisateurs", value: data.users.total, sub: `${data.users.active} actifs · ${data.users.suspended} suspendus · ${data.users.banned} bannis` },
    { label: "Comptes démo", value: data.users.demo, sub: "Générés par l'app" },
    { label: "Publications", value: data.content.posts, sub: `+${data.content.posts7d} (7j) · +${data.content.posts30d} (30j)` },
    { label: "Commentaires", value: data.content.comments },
    { label: "Voyages", value: data.content.trips },
    { label: "Messages", value: data.content.messages },
    { label: "Signalements ouverts", value: data.reports.open, sub: `${data.reports.total} total` },
    { label: "Annonces", value: data.announcements },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="glass rounded-2xl p-4 shadow-soft">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</div>
          <div className="mt-1 font-display text-3xl font-semibold">{c.value.toLocaleString()}</div>
          {c.sub && <div className="mt-1 text-xs text-muted-foreground">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Users ---------------- */
function UsersTab() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const list = useServerFn(adminListUsers);
  const setStatusFn = useServerFn(adminSetUserStatus);
  const delFn = useServerFn(adminDeleteUser);
  const roleFn = useServerFn(adminSetUserRole);
  const accessFn = useServerFn(adminSetUserAccess);
  const badgeFn = useServerFn(adminSetUserBadge);
  const listBadges = useServerFn(adminListBadges);
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-users", search, status],
    queryFn: () => list({ data: { search: search || undefined, status, limit: 100 } }),
  });
  const { data: badgeCatalog = [] } = useQuery({
    queryKey: ["admin-badges"],
    queryFn: () => listBadges(),
    staleTime: 5 * 60_000,
  });

  const mut = <T,>(fn: (v: T) => Promise<any>, msg: string) => useMutation({
    mutationFn: fn,
    onSuccess: () => { toast.success(msg); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e: any) => toast.error(e.message ?? "Erreur"),
  });

  const setStatus_ = mut((v: any) => setStatusFn({ data: v }), "Statut mis à jour");
  const del = mut((v: any) => delFn({ data: v }), "Utilisateur supprimé");
  const role = mut((v: any) => roleFn({ data: v }), "Rôle mis à jour");
  const access = mut((v: any) => accessFn({ data: v }), "Accès et visibilité mis à jour");
  const badge = mut((v: any) => badgeFn({ data: v }), "Badge mis à jour");

  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-wrap gap-2 rounded-2xl p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pseudo ou nom…" className="h-11 rounded-xl pl-9" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold">
          <option value="all">Tous les comptes</option><option value="active">Actifs</option><option value="suspended">Suspendus</option><option value="banned">Bannis</option>
        </select>
      </div>

      {isLoading ? <div className="p-8 text-center text-muted-foreground">Chargement…</div> :
        <div className="surface-card overflow-hidden rounded-[1.75rem]">
          {data.length === 0 && <div className="p-8 text-center text-muted-foreground">Aucun utilisateur</div>}
          {data.map((u: any) => (
            <div key={u.id} className="border-b border-border/60 last:border-b-0">
              <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                <div className="relative">
                  <img src={u.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${u.username}`} alt="" className="h-11 w-11 rounded-full bg-secondary object-cover ring-2 ring-background" />
                  {u.verified && <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-card"><Check className="h-3 w-3" /></span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-semibold">{u.display_name || u.username}</span>
                    {u.is_demo && <Badge variant="outline" className="text-[10px]">démo</Badge>}
                    {u.verified && <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10px]"><BadgeCheck className="mr-1 h-3 w-3" />vérifié</Badge>}
                    {u.featured && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px]"><Star className="mr-1 h-3 w-3" />à la une</Badge>}
                    {u.ai_access === "pro" && <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[10px]"><Sparkles className="mr-1 h-3 w-3" />IA Pro</Badge>}
                    {u.roles.includes("admin") && <Badge className="bg-primary text-primary-foreground text-[10px]">admin</Badge>}
                    {u.roles.includes("moderator") && <Badge className="bg-accent text-accent-foreground text-[10px]">mod</Badge>}
                    <StatusBadge status={u.status} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>@{u.username}</span><span>·</span><span>{u.visibility === "hidden" ? "Masqué" : u.visibility === "limited" ? "Visibilité limitée" : "Public"}</span><span>·</span><span>IA {u.ai_access ?? "free"} · {u.ai_daily_limit ?? 50}/j</span></div>
                </div>
                <Button size="sm" variant={expanded === u.id ? "secondary" : "outline"} onClick={() => setExpanded(expanded === u.id ? null : u.id)} className="rounded-xl">
                  <Settings2 className="h-3.5 w-3.5" /> Gérer <ChevronDown className={`h-3.5 w-3.5 transition ${expanded === u.id ? "rotate-180" : ""}`} />
                </Button>
              </div>

              {expanded === u.id && (
                <UserAccessEditor
                  key={`${u.id}-${u.updated_at ?? ""}`}
                  user={u}
                  badges={badgeCatalog}
                  busy={access.isPending || badge.isPending || role.isPending || setStatus_.isPending}
                  onSave={(value) => access.mutate(value)}
                  onBadge={(value) => badge.mutate(value)}
                  onRole={(value) => role.mutate(value)}
                  onStatus={(value) => setStatus_.mutate(value)}
                  onDelete={() => confirm(`Supprimer définitivement @${u.username} ?`) && del.mutate({ userId: u.id })}
                />
              )}
            </div>
          ))}
        </div>}
    </div>
  );
}

function UserAccessEditor({ user, badges, busy, onSave, onBadge, onRole, onStatus, onDelete }: {
  user: any;
  badges: any[];
  busy: boolean;
  onSave: (value: any) => void;
  onBadge: (value: any) => void;
  onRole: (value: any) => void;
  onStatus: (value: any) => void;
  onDelete: () => void;
}) {
  const [visibility, setVisibility] = useState(user.visibility ?? "public");
  const [aiAccess, setAiAccess] = useState(user.ai_access ?? (user.is_demo ? "disabled" : "free"));
  const [aiDailyLimit, setAiDailyLimit] = useState(Number(user.ai_daily_limit ?? 50));
  const [verified, setVerified] = useState(Boolean(user.verified));
  const [featured, setFeatured] = useState(Boolean(user.featured));
  const earned = new Set<string>(user.badges ?? []);

  return (
    <div className="admin-access-panel animate-rise border-t border-border/60 bg-secondary/25 p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label="Visibilité du compte" icon={visibility === "hidden" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm">
              <option value="public">Public</option><option value="limited">Limité dans les recommandations</option><option value="hidden">Masqué de la découverte</option>
            </select>
          </AdminField>
          <AdminField label="Accès à l'IA" icon={<Sparkles className="h-4 w-4" />}>
            <select value={aiAccess} onChange={(e) => setAiAccess(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm">
              <option value="free">IA gratuite</option><option value="pro">IA Pro</option><option value="disabled">IA désactivée</option>
            </select>
          </AdminField>
          <AdminField label="Quota IA quotidien" icon={<Crown className="h-4 w-4" />}>
            <Input type="number" min={1} max={1000} value={aiDailyLimit} onChange={(e) => setAiDailyLimit(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))} className="h-11 rounded-xl" />
          </AdminField>
          <div className="grid grid-cols-2 gap-2">
            <ToggleCard active={verified} onClick={() => setVerified(!verified)} icon={<BadgeCheck className="h-4 w-4" />} label="Compte vérifié" />
            <ToggleCard active={featured} onClick={() => setFeatured(!featured)} icon={<Star className="h-4 w-4" />} label="Mettre à la une" />
          </div>
          <Button disabled={busy} onClick={() => onSave({ userId: user.id, visibility, verified, featured, aiAccess, aiDailyLimit })} className="h-11 rounded-xl sm:col-span-2"><Check className="h-4 w-4" /> Enregistrer les accès</Button>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2"><div><h4 className="text-sm font-semibold">Badges du profil</h4><p className="text-[11px] text-muted-foreground">Attribution contrôlée et enregistrée dans l'audit.</p></div><Badge variant="outline">{earned.size}</Badge></div>
          <div className="grid max-h-52 gap-2 overflow-y-auto pr-1 scrollbar-subtle">
            {badges.map((item) => {
              const active = earned.has(item.id);
              return <button key={item.id} type="button" disabled={busy} onClick={() => onBadge({ userId: user.id, badgeId: item.id, action: active ? "revoke" : "grant" })} className={`pressable flex items-center gap-3 rounded-xl border p-2.5 text-left ${active ? "border-primary/35 bg-primary/[0.08]" : "border-border/70 bg-background/70 hover:border-primary/25"}`}><span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-lg">{item.emoji}</span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{item.label}</span><span className="line-clamp-1 text-[10px] text-muted-foreground">{item.description}</span></span><span className={`grid h-5 w-5 place-items-center rounded-full border ${active ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{active && <Check className="h-3 w-3" />}</span></button>;
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
        {user.status !== "active" && <Button size="sm" variant="outline" onClick={() => onStatus({ userId: user.id, status: "active" })}><Check className="h-3.5 w-3.5" />Activer</Button>}
        {user.status !== "suspended" && <Button size="sm" variant="outline" onClick={() => onStatus({ userId: user.id, status: "suspended", reason: "Modération" })}><ShieldOff className="h-3.5 w-3.5" />Suspendre</Button>}
        {user.status !== "banned" && <Button size="sm" variant="outline" onClick={() => onStatus({ userId: user.id, status: "banned", reason: "Violation des règles" })}><Ban className="h-3.5 w-3.5" />Bannir</Button>}
        <Button size="sm" variant="outline" onClick={() => onRole({ userId: user.id, role: "moderator", action: user.roles.includes("moderator") ? "revoke" : "grant" })}>{user.roles.includes("moderator") ? "Retirer modérateur" : "Nommer modérateur"}</Button>
        <Button size="sm" variant="outline" onClick={() => onRole({ userId: user.id, role: "admin", action: user.roles.includes("admin") ? "revoke" : "grant" })}>{user.roles.includes("admin") ? "Retirer admin" : "Nommer admin"}</Button>
        <Button size="sm" variant="destructive" className="sm:ml-auto" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /> Supprimer</Button>
      </div>
    </div>
  );
}

function AdminField({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">{icon}{label}</span>{children}</label>;
}

function ToggleCard({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`pressable flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold ${active ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-border bg-card hover:border-primary/25"}`}>{icon}{label}</button>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    suspended: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    banned: "bg-red-500/20 text-red-700 dark:text-red-300",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[status] ?? ""}`}>{status}</span>;
}

/* ---------------- Reports ---------------- */
function ReportsTab() {
  const [status, setStatus] = useState("open");
  const list = useServerFn(adminListReports);
  const resolve = useServerFn(adminResolveReport);
  const del = useServerFn(adminDeleteContent);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["admin-reports", status], queryFn: () => list({ data: { status } }) });
  const resolveM = useMutation({
    mutationFn: (v: any) => resolve({ data: v }),
    onSuccess: () => { toast.success("Signalement mis à jour"); qc.invalidateQueries({ queryKey: ["admin-reports"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (v: any) => del({ data: v }),
    onSuccess: () => { toast.success("Contenu supprimé"); qc.invalidateQueries({ queryKey: ["admin-reports"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <option value="open">Ouverts</option><option value="reviewing">En cours</option>
        <option value="resolved">Résolus</option><option value="dismissed">Rejetés</option><option value="all">Tous</option>
      </select>
      <div className="glass rounded-2xl">
        {data.length === 0 && <div className="p-8 text-center text-muted-foreground">Aucun signalement</div>}
        {data.map((r: any) => (
          <div key={r.id} className="border-b border-border/60 p-4 last:border-b-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{r.target_type}</Badge>
                  <span className="font-medium">{r.reason}</span>
                  <Badge className="text-[10px]">{r.status}</Badge>
                </div>
                {r.details && <p className="mt-1 text-sm text-muted-foreground">{r.details}</p>}
                <p className="mt-1 text-xs text-muted-foreground">Cible : <code className="text-xs">{r.target_id}</code> · {new Date(r.created_at).toLocaleString()}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {(r.target_type === "post" || r.target_type === "comment") &&
                  <Button size="sm" variant="destructive" onClick={() => delM.mutate({ targetType: r.target_type, targetId: r.target_id })}><Trash2 className="h-3.5 w-3.5" />Supprimer</Button>}
                <Button size="sm" variant="outline" onClick={() => resolveM.mutate({ id: r.id, status: "resolved", note: "Traité" })}><Check className="h-3.5 w-3.5" />Résoudre</Button>
                <Button size="sm" variant="outline" onClick={() => resolveM.mutate({ id: r.id, status: "dismissed", note: "Rejeté" })}><X className="h-3.5 w-3.5" />Rejeter</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Content ---------------- */
function ContentTab() {
  const list = useServerFn(adminRecentContent);
  const del = useServerFn(adminDeleteContent);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["admin-content"], queryFn: () => list() });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { targetType: "post", targetId: id } }),
    onSuccess: () => { toast.success("Supprimé"); qc.invalidateQueries({ queryKey: ["admin-content"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map((p: any) => (
        <div key={p.id} className="glass flex gap-3 rounded-2xl p-3">
          {p.image_url && <img src={p.image_url} alt="" className="h-20 w-20 rounded-lg object-cover" />}
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">@{p.profiles?.username ?? "inconnu"} · {p.country_code ?? "—"} · ♥ {p.likes_count ?? 0}</div>
            <p className="line-clamp-3 text-sm">{p.caption}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => confirm("Supprimer cette publication ?") && delM.mutate(p.id)}>
                <Trash2 className="h-3.5 w-3.5" />Supprimer
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Announcements ---------------- */
function AnnouncementsTab() {
  const list = useServerFn(adminListAnnouncements);
  const upsert = useServerFn(adminUpsertAnnouncement);
  const del = useServerFn(adminDeleteAnnouncement);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["admin-ann"], queryFn: () => list() });
  const [form, setForm] = useState({ title: "", body: "", audience: "all", severity: "info", publish: true });

  const create = useMutation({
    mutationFn: () => upsert({ data: form as any }),
    onSuccess: () => { toast.success("Annonce publiée"); setForm({ title: "", body: "", audience: "all", severity: "info", publish: true }); qc.invalidateQueries({ queryKey: ["admin-ann"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Supprimée"); qc.invalidateQueries({ queryKey: ["admin-ann"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="glass space-y-2 rounded-2xl p-4">
        <h3 className="font-semibold">Nouvelle annonce</h3>
        <Input placeholder="Titre" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Textarea placeholder="Message…" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <div className="flex flex-wrap gap-2">
          <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <option value="all">Tous</option><option value="premium">Premium</option><option value="moderators">Modérateurs</option><option value="admins">Admins</option>
          </select>
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <option value="info">Info</option><option value="success">Succès</option><option value="warning">Attention</option><option value="critical">Critique</option>
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.publish} onChange={(e) => setForm({ ...form, publish: e.target.checked })} />Publier immédiatement</label>
        </div>
        <Button onClick={() => create.mutate()} disabled={!form.title || !form.body || create.isPending} className="gradient-hero text-primary-foreground">Publier</Button>
      </div>
      <div className="glass rounded-2xl">
        {data.map((a: any) => (
          <div key={a.id} className="flex items-start justify-between gap-2 border-b border-border/60 p-3 last:border-b-0">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{a.severity}</Badge>
                <Badge variant="outline">{a.audience}</Badge>
                <span className="font-medium">{a.title}</span>
                {!a.published_at && <span className="text-xs text-muted-foreground">(brouillon)</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
            </div>
            <Button size="sm" variant="destructive" onClick={() => delM.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Demo accounts ---------------- */
function DemosTab() {
  const list = useServerFn(adminListDemos);
  const del = useServerFn(adminDeleteUser);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["admin-demos"], queryFn: () => list() });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { userId: id } }),
    onSuccess: () => { toast.success("Compte démo supprimé"); qc.invalidateQueries({ queryKey: ["admin-demos"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="glass rounded-2xl">
      {data.length === 0 && <div className="p-8 text-center text-muted-foreground">Aucun compte démo</div>}
      {data.map((u: any) => (
        <div key={u.id} className="flex items-center gap-3 border-b border-border/60 p-3 last:border-b-0">
          <img src={u.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${u.username}`} alt="" className="h-9 w-9 rounded-full bg-secondary object-cover" />
          <div className="flex-1"><div className="font-medium">{u.display_name}</div><div className="text-xs text-muted-foreground">@{u.username}</div></div>
          <Button size="sm" variant="destructive" onClick={() => confirm(`Supprimer @${u.username} ?`) && delM.mutate(u.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Audit log ---------------- */
function AuditTab() {
  const list = useServerFn(adminAuditLog);
  const { data = [] } = useQuery({ queryKey: ["admin-audit"], queryFn: () => list() });
  return (
    <div className="glass overflow-hidden rounded-2xl">
      {data.length === 0 && <div className="p-8 text-center text-muted-foreground">Aucune action enregistrée</div>}
      {data.map((a: any) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 p-3 text-sm last:border-b-0">
          <div>
            <Badge variant="outline" className="mr-2">{a.action}</Badge>
            {a.target_type && <span className="text-muted-foreground">{a.target_type}:<code className="ml-1 text-xs">{a.target_id}</code></span>}
          </div>
          <div className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
