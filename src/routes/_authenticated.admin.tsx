import { createFileRoute, redirect, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminStats,
  adminListUsers,
  adminSetUserStatus,
  adminDeleteUser,
  adminSetUserRole,
  adminListReports,
  adminResolveReport,
  adminDeleteContent,
  adminRecentContent,
  adminListAnnouncements,
  adminUpsertAnnouncement,
  adminDeleteAnnouncement,
  adminGetMyRoles,
  adminAuditLog,
  adminClaimBootstrap,
  adminSetUserAccess,
  adminListBadges,
  adminSetUserBadge,
  adminListPlaceReviews,
  adminModeratePlace,
  adminListCatalogItems,
  adminDeleteCatalogItem,
  adminListCatalogAreas,
  adminUpsertCatalogArea,
  adminDeleteCatalogArea,
  adminListCatalogSyncRuns,
  adminTriggerCatalogSync,
  adminConfigureCatalogCron,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { getSignedMediaUrl } from "@/lib/storage";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Shield,
  Users,
  Flag,
  FileText,
  BarChart3,
  Megaphone,
  ScrollText,
  Ban,
  Trash2,
  Check,
  X,
  ShieldCheck,
  ShieldOff,
  UserCog,
  Search,
  BadgeCheck,
  Eye,
  EyeOff,
  Sparkles,
  Star,
  Settings2,
  ChevronDown,
  Database,
  RefreshCw,
  MapPin,
  ExternalLink,
  Store,
  Hotel,
  Utensils,
  Activity,
  Clock,
  Crown,
  ShieldAlert,
  Brain,
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
      <Button asChild className="mt-4">
        <Link to="/">Retour</Link>
      </Button>
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
          <p className="text-sm text-muted-foreground">
            Gestion de la plateforme — accès admin uniquement
          </p>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="glass mb-5 flex w-full snap-x gap-1 overflow-x-auto rounded-2xl p-1.5 sm:flex-wrap sm:overflow-visible">
          <TabsTrigger value="overview">
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="mr-2 h-4 w-4" />
            Utilisateurs
          </TabsTrigger>
          <TabsTrigger value="reports">
            <Flag className="mr-2 h-4 w-4" />
            Signalements
          </TabsTrigger>
          <TabsTrigger value="content">
            <FileText className="mr-2 h-4 w-4" />
            Contenu
          </TabsTrigger>
          <TabsTrigger value="places">
            <MapPin className="mr-2 h-4 w-4" />
            Lieux IA
          </TabsTrigger>
          <TabsTrigger value="catalog">
            <Database className="mr-2 h-4 w-4" />
            Catalogue web
          </TabsTrigger>
          <TabsTrigger value="announcements">
            <Megaphone className="mr-2 h-4 w-4" />
            Annonces
          </TabsTrigger>
          <TabsTrigger value="audit">
            <ScrollText className="mr-2 h-4 w-4" />
            Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>
        <TabsContent value="content">
          <ContentTab />
        </TabsContent>
        <TabsContent value="places">
          <PlaceReviewsTab />
        </TabsContent>
        <TabsContent value="catalog">
          <CatalogTab />
        </TabsContent>
        <TabsContent value="announcements">
          <AnnouncementsTab />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BootstrapView() {
  const claim = useServerFn(adminClaimBootstrap);
  const qc = useQueryClient();
  const router = useRouter();
  const m = useMutation({
    mutationFn: () => claim(),
    onSuccess: async () => {
      toast.success("Vous êtes désormais administrateur");
      await qc.invalidateQueries();
      await router.invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Erreur"),
  });
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <Shield className="mx-auto h-12 w-12 text-primary" />
      <h2 className="mt-4 font-display text-2xl font-semibold">Aucun administrateur</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Aucun administrateur n'est encore configuré. Pour sécuriser la plateforme, seul
        l'identifiant défini dans ADMIN_BOOTSTRAP_USER_ID peut initialiser ce rôle.
      </p>
      <Button
        className="mt-4 gradient-hero text-primary-foreground"
        onClick={() => m.mutate()}
        disabled={m.isPending}
      >
        Initialiser l’administration
      </Button>
    </div>
  );
}

/* ---------------- Overview ---------------- */
function OverviewTab() {
  const fn = useServerFn(adminStats);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => fn(),
    retry: 1,
  });
  if (isLoading)
    return (
      <div className="surface-card p-10 text-center text-muted-foreground">
        Chargement de l’administration…
      </div>
    );
  if (isError || !data)
    return (
      <div className="surface-card mx-auto max-w-xl rounded-3xl p-7 text-center">
        <ShieldAlert className="mx-auto h-9 w-9 text-destructive" />
        <h2 className="mt-3 font-display text-xl">Administration indisponible</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {(error as Error)?.message || "Les données administrateur n’ont pas pu être chargées."}
        </p>
        <Button className="mt-5 rounded-full" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Réessayer
        </Button>
      </div>
    );

  const cards = [
    {
      label: "Utilisateurs",
      value: data.users.total,
      sub: `${data.users.active} actifs · ${data.users.suspended} suspendus · ${data.users.banned} bannis`,
    },
    {
      label: "Publications",
      value: data.content.posts,
      sub: `+${data.content.posts7d} (7j) · +${data.content.posts30d} (30j)`,
    },
    { label: "Commentaires", value: data.content.comments },
    { label: "Voyages", value: data.content.trips },
    { label: "Messages", value: data.content.messages },
    { label: "Lieux à valider", value: data.content.pendingPlaces },
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

  const useAdminMutation = <T,>(fn: (v: T) => Promise<any>, msg: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        toast.success(msg);
        qc.invalidateQueries({ queryKey: ["admin-users"] });
      },
      onError: (e: any) => toast.error(e.message ?? "Erreur"),
    });

  const setStatus_ = useAdminMutation((v: any) => setStatusFn({ data: v }), "Statut mis à jour");
  const del = useAdminMutation((v: any) => delFn({ data: v }), "Utilisateur supprimé");
  const role = useAdminMutation((v: any) => roleFn({ data: v }), "Rôle mis à jour");
  const access = useAdminMutation(
    (v: any) => accessFn({ data: v }),
    "Accès et visibilité mis à jour",
  );
  const aiProGrant = useAdminMutation(
    async (v: {
      userId: string;
      action: "grant" | "revoke";
      durationDays?: number;
      note?: string;
    }) => {
      const { error } = await supabase.rpc("admin_set_ai_pro_grant", {
        p_user_id: v.userId,
        p_action: v.action,
        p_duration_days: v.durationDays ?? 30,
        p_note: v.note?.trim() || null,
      });
      if (error) throw error;
    },
    "Abonnement AI Pro mis à jour",
  );
  const badge = useAdminMutation((v: any) => badgeFn({ data: v }), "Badge mis à jour");

  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-wrap gap-2 rounded-2xl p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pseudo ou nom…"
            className="h-11 rounded-xl pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold"
        >
          <option value="all">Tous les comptes</option>
          <option value="active">Actifs</option>
          <option value="suspended">Suspendus</option>
          <option value="banned">Bannis</option>
        </select>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Chargement…</div>
      ) : (
        <div className="surface-card overflow-hidden rounded-[1.75rem]">
          {data.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">Aucun utilisateur</div>
          )}
          {data.map((u: any) => (
            <div key={u.id} className="border-b border-border/60 last:border-b-0">
              <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                <div className="relative">
                  {u.avatar_url ? (
                    <img
                      src={u.avatar_url}
                      alt=""
                      className="h-11 w-11 rounded-full bg-secondary object-cover ring-2 ring-background"
                    />
                  ) : (
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-sm font-bold ring-2 ring-background">
                      {u.username?.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  {u.verified && (
                    <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-semibold">{u.display_name || u.username}</span>
                    {u.verified && (
                      <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10px]">
                        <BadgeCheck className="mr-1 h-3 w-3" />
                        vérifié
                      </Badge>
                    )}
                    {u.featured && (
                      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px]">
                        <Star className="mr-1 h-3 w-3" />à la une
                      </Badge>
                    )}
                    {(u.ai_subscription_active ||
                      u.roles.includes("admin") ||
                      u.roles.includes("moderator")) && (
                      <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[10px]">
                        <Sparkles className="mr-1 h-3 w-3" />
                        IA Pro
                      </Badge>
                    )}
                    {u.roles.includes("admin") && (
                      <Badge className="bg-primary text-primary-foreground text-[10px]">
                        admin
                      </Badge>
                    )}
                    {u.roles.includes("moderator") && (
                      <Badge className="bg-accent text-accent-foreground text-[10px]">mod</Badge>
                    )}
                    <StatusBadge status={u.status} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>@{u.username}</span>
                    <span>·</span>
                    <span>
                      {u.visibility === "hidden"
                        ? "Masqué"
                        : u.visibility === "limited"
                          ? "Visibilité limitée"
                          : "Public"}
                    </span>
                    <span>·</span>
                    <span>
                      IA {u.ai_access === "disabled" ? "désactivée" : "autorisée"} · abonnement{" "}
                      {u.ai_subscription_active ? "actif" : "inactif"} · {u.ai_daily_limit ?? 50}/j
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={expanded === u.id ? "secondary" : "outline"}
                  onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                  className="rounded-xl"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Gérer{" "}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition ${expanded === u.id ? "rotate-180" : ""}`}
                  />
                </Button>
              </div>

              {expanded === u.id && (
                <UserAccessEditor
                  key={`${u.id}-${u.updated_at ?? ""}`}
                  user={u}
                  badges={badgeCatalog}
                  busy={
                    access.isPending ||
                    aiProGrant.isPending ||
                    badge.isPending ||
                    role.isPending ||
                    setStatus_.isPending
                  }
                  onSave={(value) => access.mutate(value)}
                  onSubscription={(value) => aiProGrant.mutate(value)}
                  onBadge={(value) => badge.mutate(value)}
                  onRole={(value) => role.mutate(value)}
                  onStatus={(value) => setStatus_.mutate(value)}
                  onDelete={() =>
                    confirm(`Supprimer définitivement @${u.username} ?`) &&
                    del.mutate({ userId: u.id })
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserAccessEditor({
  user,
  badges,
  busy,
  onSave,
  onSubscription,
  onBadge,
  onRole,
  onStatus,
  onDelete,
}: {
  user: any;
  badges: any[];
  busy: boolean;
  onSave: (value: any) => void;
  onSubscription: (value: {
    userId: string;
    action: "grant" | "revoke";
    durationDays?: number;
    note?: string;
  }) => void;
  onBadge: (value: any) => void;
  onRole: (value: any) => void;
  onStatus: (value: any) => void;
  onDelete: () => void;
}) {
  const [visibility, setVisibility] = useState(user.visibility ?? "public");
  const [aiAccess, setAiAccess] = useState(user.ai_access === "disabled" ? "disabled" : "free");
  const [aiDailyLimit, setAiDailyLimit] = useState(Number(user.ai_daily_limit ?? 50));
  const [grantDays, setGrantDays] = useState(30);
  const [grantNote, setGrantNote] = useState("");
  const [verified, setVerified] = useState(Boolean(user.verified));
  const [featured, setFeatured] = useState(Boolean(user.featured));
  const earned = new Set<string>(user.badges ?? []);

  return (
    <div className="admin-access-panel animate-rise border-t border-border/60 bg-secondary/25 p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField
            label="Visibilité du compte"
            icon={
              visibility === "hidden" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />
            }
          >
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
            >
              <option value="public">Public</option>
              <option value="limited">Limité dans les recommandations</option>
              <option value="hidden">Masqué de la découverte</option>
            </select>
          </AdminField>
          <AdminField label="Accès à l'IA" icon={<Sparkles className="h-4 w-4" />}>
            <select
              value={aiAccess}
              onChange={(e) => setAiAccess(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
            >
              <option value="free">IA autorisée selon l’abonnement</option>
              <option value="disabled">IA désactivée</option>
            </select>
          </AdminField>
          <AdminField label="Quota IA quotidien" icon={<Crown className="h-4 w-4" />}>
            <Input
              type="number"
              min={1}
              max={1000}
              value={aiDailyLimit}
              onChange={(e) =>
                setAiDailyLimit(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))
              }
              className="h-11 rounded-xl"
            />
          </AdminField>
          <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-3 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Crown className="h-4 w-4 text-violet-500" />
                  Attribution temporaire AI Pro
                </h4>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Le serveur vérifie que seul un administrateur peut effectuer cette action.
                </p>
              </div>
              <Badge variant={user.ai_subscription_active ? "default" : "outline"}>
                {user.ai_subscription_active ? "Accès actif" : "Accès inactif"}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr]">
              <select
                value={grantDays}
                onChange={(e) => setGrantDays(Number(e.target.value))}
                className="h-11 rounded-xl border border-border bg-card px-3 text-sm"
              >
                <option value={7}>7 jours</option>
                <option value={30}>30 jours</option>
                <option value={90}>90 jours</option>
                <option value={365}>1 an</option>
              </select>
              <Input
                value={grantNote}
                onChange={(e) => setGrantNote(e.target.value.slice(0, 300))}
                placeholder="Motif interne facultatif"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  onSubscription({
                    userId: user.id,
                    action: "grant",
                    durationDays: grantDays,
                    note: grantNote,
                  })
                }
                className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
              >
                <Sparkles className="h-4 w-4" />
                Attribuer AI Pro
              </Button>
              <Button
                type="button"
                disabled={busy}
                variant="outline"
                onClick={() =>
                  onSubscription({ userId: user.id, action: "revoke", note: grantNote })
                }
                className="rounded-xl"
              >
                <X className="h-4 w-4" />
                Retirer l'attribution admin
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ToggleCard
              active={verified}
              onClick={() => setVerified(!verified)}
              icon={<BadgeCheck className="h-4 w-4" />}
              label="Compte vérifié"
            />
            <ToggleCard
              active={featured}
              onClick={() => setFeatured(!featured)}
              icon={<Star className="h-4 w-4" />}
              label="Mettre à la une"
            />
          </div>
          <Button
            disabled={busy}
            onClick={() =>
              onSave({ userId: user.id, visibility, verified, featured, aiAccess, aiDailyLimit })
            }
            className="h-11 rounded-xl sm:col-span-2"
          >
            <Check className="h-4 w-4" /> Enregistrer les accès
          </Button>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold">Badges du profil</h4>
              <p className="text-[11px] text-muted-foreground">
                Attribution contrôlée et enregistrée dans l'audit.
              </p>
            </div>
            <Badge variant="outline">{earned.size}</Badge>
          </div>
          <div className="grid max-h-52 gap-2 overflow-y-auto pr-1 scrollbar-subtle">
            {badges.map((item) => {
              const active = earned.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onBadge({
                      userId: user.id,
                      badgeId: item.id,
                      action: active ? "revoke" : "grant",
                    })
                  }
                  className={`pressable flex items-center gap-3 rounded-xl border p-2.5 text-left ${active ? "border-primary/35 bg-primary/[0.08]" : "border-border/70 bg-background/70 hover:border-primary/25"}`}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-lg">
                    {item.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">{item.label}</span>
                    <span className="line-clamp-1 text-[10px] text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full border ${active ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
        {user.status !== "active" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onStatus({ userId: user.id, status: "active" })}
          >
            <Check className="h-3.5 w-3.5" />
            Activer
          </Button>
        )}
        {user.status !== "suspended" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onStatus({ userId: user.id, status: "suspended", reason: "Modération" })}
          >
            <ShieldOff className="h-3.5 w-3.5" />
            Suspendre
          </Button>
        )}
        {user.status !== "banned" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onStatus({ userId: user.id, status: "banned", reason: "Violation des règles" })
            }
          >
            <Ban className="h-3.5 w-3.5" />
            Bannir
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onRole({
              userId: user.id,
              role: "moderator",
              action: user.roles.includes("moderator") ? "revoke" : "grant",
            })
          }
        >
          {user.roles.includes("moderator") ? "Retirer modérateur" : "Nommer modérateur"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onRole({
              userId: user.id,
              role: "admin",
              action: user.roles.includes("admin") ? "revoke" : "grant",
            })
          }
        >
          {user.roles.includes("admin") ? "Retirer admin" : "Nommer admin"}
        </Button>
        <Button size="sm" variant="destructive" className="sm:ml-auto" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Supprimer
        </Button>
      </div>
    </div>
  );
}

function AdminField({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function ToggleCard({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`pressable flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold ${active ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-border bg-card hover:border-primary/25"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    suspended: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    banned: "bg-red-500/20 text-red-700 dark:text-red-300",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[status] ?? ""}`}>
      {status}
    </span>
  );
}

/* ---------------- Reports ---------------- */
function ReportsTab() {
  const [status, setStatus] = useState("open");
  const list = useServerFn(adminListReports);
  const resolve = useServerFn(adminResolveReport);
  const del = useServerFn(adminDeleteContent);
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["admin-reports", status],
    queryFn: () => list({ data: { status } }),
  });
  const resolveM = useMutation({
    mutationFn: (v: any) => resolve({ data: v }),
    onSuccess: () => {
      toast.success("Signalement mis à jour");
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (v: any) => del({ data: v }),
    onSuccess: () => {
      toast.success("Contenu supprimé");
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
      >
        <option value="open">Ouverts</option>
        <option value="reviewing">En cours</option>
        <option value="resolved">Résolus</option>
        <option value="dismissed">Rejetés</option>
        <option value="all">Tous</option>
      </select>
      <div className="glass rounded-2xl">
        {data.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">Aucun signalement</div>
        )}
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
                <p className="mt-1 text-xs text-muted-foreground">
                  Cible : <code className="text-xs">{r.target_id}</code> ·{" "}
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {(r.target_type === "post" || r.target_type === "comment") && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      delM.mutate({ targetType: r.target_type, targetId: r.target_id })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolveM.mutate({ id: r.id, status: "resolved", note: "Traité" })}
                >
                  <Check className="h-3.5 w-3.5" />
                  Résoudre
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolveM.mutate({ id: r.id, status: "dismissed", note: "Rejeté" })}
                >
                  <X className="h-3.5 w-3.5" />
                  Rejeter
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Place moderation ---------------- */
function PlaceReviewImage({ path, name }: { path?: string | null; name: string }) {
  const { data: url } = useQuery({
    queryKey: ["admin-place-image", path],
    enabled: !!path,
    queryFn: () => getSignedMediaUrl(path),
    staleTime: 30 * 60_000,
  });
  return (
    <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary">
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <MapPin className="h-6 w-6 text-muted-foreground" />
      )}
    </div>
  );
}

function moderationLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "En attente admin",
    ai_flagged: "En attente admin",
    approved: "Validé",
    rejected: "Refusé",
  };
  return labels[status] ?? status;
}

function moderationBadgeClass(status: string) {
  if (status === "approved") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "rejected") return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (status === "ai_flagged") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
}

type AiRecommendation = "approve" | "manual_review" | "reject";

const AI_RECOMMENDATION_CONFIG = {
  approve: {
    label: "Accepter",
    description: "Les éléments analysés paraissent suffisamment cohérents pour une validation.",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    icon: Check,
  },
  manual_review: {
    label: "Vérifier manuellement",
    description: "L'IA n'a pas assez d'éléments fiables pour conseiller une validation directe.",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    icon: ShieldAlert,
  },
  reject: {
    label: "Refuser",
    description: "Un ou plusieurs signaux importants rendent la publication déconseillée.",
    className: "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200",
    icon: X,
  },
} as const;

function getAiRecommendation(place: any): AiRecommendation {
  const flags = Array.isArray(place.moderation_ai_flags)
    ? place.moderation_ai_flags.map(String)
    : [];
  if (flags.includes("recommandation_refuser")) return "reject";
  if (flags.includes("recommandation_accepter")) return "approve";
  if (flags.includes("recommandation_verifier")) return "manual_review";

  const severeFlags = ["contenu_illegal", "contenu_sexuel", "haine_violence"];
  if (severeFlags.some((flag) => flags.includes(flag))) return "reject";
  if (place.moderation_status === "pending" && Number(place.moderation_ai_score) >= 75) {
    return "approve";
  }
  return "manual_review";
}

const MODERATION_FLAG_LABELS: Record<string, string> = {
  analyse_auto_locale: "Analyse automatique locale",
  modele_ia_indisponible: "Analyse automatique locale",
  modele_ia_secours: "Analyse automatique locale",
  ville_trouvee: "Localité confirmée",
  localite_confirmee: "Localité confirmée",
  lieu_exact_trouve: "Lieu exact confirmé",
  lieu_exact_confirme: "Lieu exact confirmé",
  lieu_exact_a_verifier: "Lieu/activité à vérifier",
  lieu_non_trouve_automatiquement: "Localisation à vérifier",
  localisation_a_verifier: "Localisation à vérifier",
  coordonnees_coherentes: "Coordonnées cohérentes",
  coordonnees_a_controler: "Coordonnées à contrôler",
  coordonnees_eloignees: "Coordonnées éloignées",
  description_presente: "Description présente",
  description_courte: "Description courte",
  photo_presente: "Photo présente",
  photo_absente: "Photo absente",
  gemini_cle_invalide: "Clé Gemini invalide",
  gemini_non_configure: "Gemini non configuré",
  gemini_api_a_verifier: "API Gemini à vérifier",
  contenu_illegal: "Contenu illégal possible",
  contenu_sexuel: "Contenu adulte possible",
  haine_violence: "Violence/haine possible",
};

function moderationFlagLabel(flag: string) {
  return (
    MODERATION_FLAG_LABELS[flag] ||
    flag
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .slice(0, 60)
  );
}

function PlaceReviewsTab() {
  const [status, setStatus] = useState("awaiting");
  const [search, setSearch] = useState("");
  const list = useServerFn(adminListPlaceReviews);
  const moderate = useServerFn(adminModeratePlace);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-place-reviews", status, search],
    queryFn: () => list({ data: { status, search, limit: 160 } }),
  });
  const action = useMutation({
    mutationFn: (payload: { id: string; action: "approve" | "reject"; reason?: string }) =>
      moderate({ data: payload }),
    onSuccess: (_result, variables) => {
      toast.success(variables.action === "approve" ? "Lieu validé" : "Lieu refusé");
      qc.invalidateQueries({ queryKey: ["admin-place-reviews"] });
      qc.invalidateQueries({ queryKey: ["places"] });
      qc.invalidateQueries({ queryKey: ["country-places"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erreur"),
  });

  return (
    <div className="space-y-4">
      <section className="surface-card rounded-2xl p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl">Lieux et activités à valider</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Les propositions passent par une vérification automatique puis restent invisibles sur
              la carte jusqu'à ta validation.
            </p>
          </div>
          <Badge className="w-fit bg-primary/10 text-primary">
            <Brain className="mr-1 h-3.5 w-3.5" />
            Vérification automatique + validation admin
          </Badge>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un lieu, pays, ville…"
              className="pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold"
          >
            <option value="awaiting">En attente</option>
            <option value="approved">Validés</option>
            <option value="rejected">Refusés</option>
            <option value="all">Tous</option>
          </select>
        </div>
      </section>

      {isLoading ? (
        <div className="surface-card p-8 text-center text-muted-foreground">Chargement…</div>
      ) : data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          Aucun lieu dans cette file.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((place: any) => {
            const profile = Array.isArray(place.profiles) ? place.profiles[0] : place.profiles;
            const mapsUrl = `https://www.google.com/maps?q=${place.lat},${place.lng}`;
            const recommendation = AI_RECOMMENDATION_CONFIG[getAiRecommendation(place)];
            const RecommendationIcon = recommendation.icon;
            return (
              <article key={place.id} className="surface-card rounded-2xl p-3">
                <div className="flex gap-3">
                  <PlaceReviewImage path={place.image_url} name={place.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="line-clamp-1 font-semibold">{place.name}</h3>
                      <Badge className={moderationBadgeClass(place.moderation_status)}>
                        {moderationLabel(place.moderation_status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[place.city, place.country].filter(Boolean).join(", ")} · {place.category}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Proposé par @{profile?.username ?? "inconnu"} ·{" "}
                      {new Date(place.created_at).toLocaleString()}
                    </p>
                    {place.description && (
                      <p className="mt-2 line-clamp-3 text-sm">{place.description}</p>
                    )}
                  </div>
                </div>

                <div className={`mt-3 rounded-xl border p-3 ${recommendation.className}`}>
                  <p className="flex items-center gap-2 text-sm font-bold">
                    <RecommendationIcon className="h-4 w-4" />
                    Recommandation IA : {recommendation.label}
                  </p>
                  <p className="mt-1 text-xs opacity-90">{recommendation.description}</p>
                  <p className="mt-2 text-[11px] font-medium opacity-80">
                    Conseil interne uniquement — la décision finale reste à l'administrateur.
                  </p>
                </div>

                <div className="mt-3 rounded-xl border border-border bg-background/60 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      Score vérif. {place.moderation_ai_score ?? "—"}/100
                    </Badge>
                    {(place.moderation_ai_flags ?? [])
                      .filter((flag: string) => !flag.startsWith("recommandation_"))
                      .map((flag: string) => (
                        <Badge key={flag} variant="outline">
                          {moderationFlagLabel(flag)}
                        </Badge>
                      ))}
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    {place.moderation_ai_summary ||
                      "Aucun résumé de vérification enregistré. Vérifie manuellement avant validation."}
                  </p>
                  {place.moderation_rejection_reason && (
                    <p className="mt-2 text-red-600">
                      Motif de refus : {place.moderation_rejection_reason}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      Vérifier sur la carte
                    </a>
                  </Button>
                  {place.moderation_status !== "approved" && (
                    <Button
                      size="sm"
                      onClick={() => action.mutate({ id: place.id, action: "approve" })}
                      disabled={action.isPending}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Valider
                    </Button>
                  )}
                  {place.moderation_status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        const reason =
                          prompt("Motif du refus ?", "Non conforme aux règles GlobeLink") ||
                          "Non conforme aux règles GlobeLink";
                        action.mutate({ id: place.id, action: "reject", reason });
                      }}
                      disabled={action.isPending}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Refuser
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
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
    onSuccess: () => {
      toast.success("Supprimé");
      qc.invalidateQueries({ queryKey: ["admin-content"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map((p: any) => (
        <div key={p.id} className="glass flex gap-3 rounded-2xl p-3">
          {p.image_url && (
            <img src={p.image_url} alt="" className="h-20 w-20 rounded-lg object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">
              @{p.profiles?.username ?? "inconnu"} · {p.country_code ?? "—"} · ♥{" "}
              {p.likes_count ?? 0}
            </div>
            <p className="line-clamp-3 text-sm">{p.caption}</p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => confirm("Supprimer cette publication ?") && delM.mutate(p.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Internet catalog ---------------- */
function CatalogTab() {
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [areaForm, setAreaForm] = useState({
    city: "",
    country: "",
    countryCode: "",
    iataCode: "",
    latitude: "",
    longitude: "",
    radiusM: "8000",
    priority: "100",
    enabled: true,
  });
  const listItems = useServerFn(adminListCatalogItems);
  const deleteItem = useServerFn(adminDeleteCatalogItem);
  const listAreas = useServerFn(adminListCatalogAreas);
  const upsertArea = useServerFn(adminUpsertCatalogArea);
  const deleteArea = useServerFn(adminDeleteCatalogArea);
  const listRuns = useServerFn(adminListCatalogSyncRuns);
  const triggerSync = useServerFn(adminTriggerCatalogSync);
  const configureCron = useServerFn(adminConfigureCatalogCron);
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-catalog-items", kind, search],
    queryFn: () => listItems({ data: { kind, search, limit: 160 } }),
  });
  const { data: areas = [] } = useQuery({
    queryKey: ["admin-catalog-areas"],
    queryFn: () => listAreas(),
  });
  const { data: runs = [] } = useQuery({
    queryKey: ["admin-catalog-runs"],
    queryFn: () => listRuns(),
  });

  const remove = useMutation({
    mutationFn: (item: any) =>
      deleteItem({ data: { id: item.id, reason: "Supprimé depuis l’administration GlobeLink" } }),
    onSuccess: () => {
      toast.success("Élément supprimé et bloqué pour les prochaines collectes");
      qc.invalidateQueries({ queryKey: ["admin-catalog-items"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const saveArea = useMutation({
    mutationFn: () =>
      upsertArea({
        data: {
          ...areaForm,
          latitude: Number(areaForm.latitude),
          longitude: Number(areaForm.longitude),
          radiusM: Number(areaForm.radiusM),
          priority: Number(areaForm.priority),
        },
      }),
    onSuccess: () => {
      toast.success("Zone ajoutée");
      setAreaForm({
        city: "",
        country: "",
        countryCode: "",
        iataCode: "",
        latitude: "",
        longitude: "",
        radiusM: "8000",
        priority: "100",
        enabled: true,
      });
      qc.invalidateQueries({ queryKey: ["admin-catalog-areas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const removeArea = useMutation({
    mutationFn: (id: string) => deleteArea({ data: { id } }),
    onSuccess: () => {
      toast.success("Zone supprimée");
      qc.invalidateQueries({ queryKey: ["admin-catalog-areas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const cron = useMutation({
    mutationFn: () => configureCron({ data: { schedule: "15 4 * * *" } }),
    onSuccess: () => toast.success("Renouvellement automatique activé chaque jour à 04:15 UTC"),
    onError: (e: any) => toast.error(e.message),
  });
  const sync = useMutation({
    mutationFn: () => triggerSync(),
    onSuccess: (data: any) => {
      toast.success(`Synchronisation terminée : ${data?.imported ?? 0} éléments traités`);
      qc.invalidateQueries({ queryKey: ["admin-catalog"] });
      qc.invalidateQueries({ queryKey: ["admin-catalog-items"] });
      qc.invalidateQueries({ queryKey: ["admin-catalog-runs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const kindIcon = (value: string) =>
    value === "restaurant" ? (
      <Utensils className="h-4 w-4" />
    ) : value === "hotel" ? (
      <Hotel className="h-4 w-4" />
    ) : value === "activity" ? (
      <Activity className="h-4 w-4" />
    ) : (
      <Store className="h-4 w-4" />
    );

  return (
    <div className="space-y-5">
      <section className="surface-card rounded-2xl p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl">Collecte automatique</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Restaurants, hôtels et activités via OpenStreetMap. Offres via les fournisseurs
              configurés. Les éléments supprimés ne reviennent pas.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => cron.mutate()}
              disabled={cron.isPending}
              className="rounded-full"
            >
              <Clock className="mr-2 h-4 w-4" /> Activer chaque jour
            </Button>
            <Button
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              className="rounded-full"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />{" "}
              Actualiser maintenant
            </Button>
          </div>
        </div>
        {runs[0] && (
          <div className="mt-4 rounded-xl border border-border bg-background/60 p-3 text-xs text-muted-foreground">
            Dernier passage : {new Date(runs[0].started_at).toLocaleString()} · statut{" "}
            <strong className="text-foreground">{runs[0].status}</strong> ·{" "}
            {runs[0].imported_count ?? 0} éléments traités · {runs[0].areas_count ?? 0} zones
          </div>
        )}
      </section>

      <section className="surface-card rounded-2xl p-4">
        <h3 className="font-semibold">Zones surveillées</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          La collecte choisit en priorité les zones les moins récemment mises à jour.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Ville"
            value={areaForm.city}
            onChange={(e) => setAreaForm({ ...areaForm, city: e.target.value })}
          />
          <Input
            placeholder="Pays"
            value={areaForm.country}
            onChange={(e) => setAreaForm({ ...areaForm, country: e.target.value })}
          />
          <Input
            placeholder="Latitude"
            inputMode="decimal"
            value={areaForm.latitude}
            onChange={(e) => setAreaForm({ ...areaForm, latitude: e.target.value })}
          />
          <Input
            placeholder="Longitude"
            inputMode="decimal"
            value={areaForm.longitude}
            onChange={(e) => setAreaForm({ ...areaForm, longitude: e.target.value })}
          />
          <Input
            placeholder="Code pays (FR)"
            value={areaForm.countryCode}
            onChange={(e) => setAreaForm({ ...areaForm, countryCode: e.target.value })}
          />
          <Input
            placeholder="Code IATA (LYS)"
            value={areaForm.iataCode}
            onChange={(e) => setAreaForm({ ...areaForm, iataCode: e.target.value })}
          />
          <Input
            placeholder="Rayon en mètres"
            inputMode="numeric"
            value={areaForm.radiusM}
            onChange={(e) => setAreaForm({ ...areaForm, radiusM: e.target.value })}
          />
          <Button
            onClick={() => saveArea.mutate()}
            disabled={
              saveArea.isPending ||
              !areaForm.city ||
              !areaForm.country ||
              !areaForm.latitude ||
              !areaForm.longitude
            }
          >
            Ajouter la zone
          </Button>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-subtle">
          {areas.map((area: any) => (
            <div
              key={area.id}
              className="min-w-[230px] rounded-xl border border-border bg-background/60 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {area.city}, {area.country}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Rayon {Math.round(area.radius_m / 1000)} km · priorité {area.priority}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Supprimer la zone"
                  onClick={() => confirm(`Supprimer ${area.city} ?`) && removeArea.mutate(area.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {area.last_synced_at
                  ? `Mise à jour ${new Date(area.last_synced_at).toLocaleString()}`
                  : "Jamais synchronisée"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="surface-card flex flex-col gap-2 rounded-2xl p-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un lieu ou une offre…"
              className="pl-9"
            />
          </div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold"
          >
            <option value="all">Tout</option>
            <option value="activity">Activités</option>
            <option value="restaurant">Restaurants</option>
            <option value="hotel">Hôtels</option>
            <option value="deal">Offres</option>
          </select>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            Aucun élément collecté pour ce filtre.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item: any) => (
              <div key={item.id} className="surface-card flex gap-3 rounded-2xl p-3">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary">
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    kindIcon(item.kind)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="line-clamp-1 font-semibold">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[item.city, item.country].filter(Boolean).join(", ") || item.provider}
                      </p>
                    </div>
                    <Badge variant="outline">{item.kind}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {item.description || "Aucune description fournie par la source."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />
                        Source
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        confirm("Supprimer cet élément et empêcher son retour ?") &&
                        remove.mutate(item)
                      }
                      disabled={remove.isPending}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Supprimer
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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
  const [form, setForm] = useState({
    title: "",
    body: "",
    audience: "all",
    severity: "info",
    publish: true,
  });

  const create = useMutation({
    mutationFn: () => upsert({ data: form as any }),
    onSuccess: () => {
      toast.success("Annonce publiée");
      setForm({ title: "", body: "", audience: "all", severity: "info", publish: true });
      qc.invalidateQueries({ queryKey: ["admin-ann"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Supprimée");
      qc.invalidateQueries({ queryKey: ["admin-ann"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="glass space-y-2 rounded-2xl p-4">
        <h3 className="font-semibold">Nouvelle annonce</h3>
        <Input
          placeholder="Titre"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <Textarea
          placeholder="Message…"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={form.audience}
            onChange={(e) => setForm({ ...form, audience: e.target.value })}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="all">Tous</option>
            <option value="premium">Premium</option>
            <option value="moderators">Modérateurs</option>
            <option value="admins">Admins</option>
          </select>
          <select
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value })}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="info">Info</option>
            <option value="success">Succès</option>
            <option value="warning">Attention</option>
            <option value="critical">Critique</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.publish}
              onChange={(e) => setForm({ ...form, publish: e.target.checked })}
            />
            Publier immédiatement
          </label>
        </div>
        <Button
          onClick={() => create.mutate()}
          disabled={!form.title || !form.body || create.isPending}
          className="gradient-hero text-primary-foreground"
        >
          Publier
        </Button>
      </div>
      <div className="glass rounded-2xl">
        {data.map((a: any) => (
          <div
            key={a.id}
            className="flex items-start justify-between gap-2 border-b border-border/60 p-3 last:border-b-0"
          >
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{a.severity}</Badge>
                <Badge variant="outline">{a.audience}</Badge>
                <span className="font-medium">{a.title}</span>
                {!a.published_at && (
                  <span className="text-xs text-muted-foreground">(brouillon)</span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
            </div>
            <Button size="sm" variant="destructive" onClick={() => delM.mutate(a.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Audit log ---------------- */
function AuditTab() {
  const list = useServerFn(adminAuditLog);
  const { data = [] } = useQuery({ queryKey: ["admin-audit"], queryFn: () => list() });
  return (
    <div className="glass overflow-hidden rounded-2xl">
      {data.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">Aucune action enregistrée</div>
      )}
      {data.map((a: any) => (
        <div
          key={a.id}
          className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 p-3 text-sm last:border-b-0"
        >
          <div>
            <Badge variant="outline" className="mr-2">
              {a.action}
            </Badge>
            {a.target_type && (
              <span className="text-muted-foreground">
                {a.target_type}:<code className="ml-1 text-xs">{a.target_id}</code>
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(a.created_at).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
