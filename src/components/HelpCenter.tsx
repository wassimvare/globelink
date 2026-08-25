import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeHelp,
  BookOpen,
  Bug,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Flag,
  Info,
  LifeBuoy,
  Loader2,
  MessageSquareText,
  Scale,
  Search,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  createReport,
  createSupportTicket,
  extractUuid,
  isCurrentUserAdmin,
  listMyReports,
  listMySupportTickets,
  searchProfilesForReport,
  type ReportProfile,
  type ReportTargetType,
  type SupportCategory,
} from "@/lib/support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const APP_VERSION = "11.0.13-beta.1";

const faq = [
  {
    question: "Comment modifier mon profil ou ma confidentialité ?",
    answer: "Ouvre Paramètres et confidentialité. Chaque rubrique dispose maintenant de sa propre page : profil, confidentialité, interactions, notifications, Travel Match, voyage et sécurité.",
  },
  {
    question: "Comment bloquer ou restreindre quelqu’un ?",
    answer: "Dans Paramètres > Comptes bloqués et restreints, recherche le compte puis choisis Bloquer ou Restreindre. Les comptes bloqués sont retirés de la recherche, de Travel Match, de la carte et des conversations directes.",
  },
  {
    question: "Comment fonctionne Travel Match ?",
    answer: "Travel Match propose des voyageurs compatibles avec tes préférences. Tu peux le désactiver, régler la tranche d’âge et limiter les suggestions aux profils vérifiés depuis les paramètres.",
  },
  {
    question: "Je ne vois plus certaines notifications. Pourquoi ?",
    answer: "Vérifie Paramètres > Notifications. GlobeLink peut mettre toutes les notifications en pause ou filtrer séparément l’activité sociale, les messages et les alertes voyage.",
  },
  {
    question: "Comment récupérer mes données ?",
    answer: "Va dans Paramètres > Compte, données et sécurité puis utilise Télécharger mes données. GlobeLink prépare un export JSON lié uniquement à ton compte.",
  },
  {
    question: "Comment signaler un bug ?",
    answer: "Utilise le formulaire Contacter le support ci-dessous, choisis Bug dans l’application et décris exactement ce qui s’est passé. La version de GlobeLink et les informations techniques de base sont jointes automatiquement.",
  },
  {
    question: "Quelle différence entre un ticket support et un signalement ?",
    answer: "Un ticket support concerne ton compte, un bug ou un problème technique. Un signalement concerne un profil, une publication, un commentaire ou un message qui pourrait enfreindre les règles de la communauté.",
  },
  {
    question: "Puis-je suivre une demande après l’envoi ?",
    answer: "Oui. Tes tickets support et tes signalements apparaissent dans cette page avec leur statut et, lorsqu’elle existe, la réponse de l’équipe GlobeLink.",
  },
] as const;

const categoryLabels: Record<SupportCategory, string> = {
  bug: "Bug dans l’application",
  technical: "Problème technique",
  account: "Compte et connexion",
  safety: "Sécurité et urgence sur GlobeLink",
  feedback: "Suggestion ou retour",
  other: "Autre demande",
};

const ticketStatusLabels: Record<string, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  waiting_user: "En attente de votre réponse",
  resolved: "Résolu",
  closed: "Fermé",
};

const reportStatusLabels: Record<string, string> = {
  open: "Reçu",
  reviewing: "En cours d’examen",
  resolved: "Traité",
  dismissed: "Classé",
};

const reportTypeLabels: Record<ReportTargetType, string> = {
  profile: "Compte",
  post: "Publication",
  comment: "Commentaire",
  message: "Message",
};

const reportReasons = [
  "Harcèlement ou intimidation",
  "Spam ou contenu trompeur",
  "Arnaque ou fraude",
  "Usurpation d’identité",
  "Contenu inapproprié",
  "Atteinte à la vie privée",
  "Autre violation des règles",
];

export function HelpCenter() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [faqQuery, setFaqQuery] = useState("");
  const [supportCategory, setSupportCategory] = useState<SupportCategory>("bug");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [sendingSupport, setSendingSupport] = useState(false);
  const [reportType, setReportType] = useState<ReportTargetType>("profile");
  const [reportReason, setReportReason] = useState(reportReasons[0]);
  const [reportDetails, setReportDetails] = useState("");
  const [reportTarget, setReportTarget] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [submittedProfileSearch, setSubmittedProfileSearch] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<ReportProfile | null>(null);
  const [sendingReport, setSendingReport] = useState(false);

  const tickets = useQuery({
    queryKey: ["support-tickets", user?.id],
    enabled: !!user,
    queryFn: () => listMySupportTickets(user!.id),
  });

  const reports = useQuery({
    queryKey: ["my-reports", user?.id],
    enabled: !!user,
    queryFn: () => listMyReports(user!.id),
  });

  const admin = useQuery({
    queryKey: ["help-is-admin", user?.id],
    enabled: !!user,
    queryFn: () => isCurrentUserAdmin(user!.id),
    staleTime: 5 * 60_000,
  });

  const profileResults = useQuery({
    queryKey: ["report-profile-search", user?.id, submittedProfileSearch],
    enabled: !!user && submittedProfileSearch.length >= 2,
    queryFn: () => searchProfilesForReport(user!.id, submittedProfileSearch),
  });

  const filteredFaq = useMemo(() => {
    const q = faqQuery.trim().toLowerCase();
    if (!q) return faq;
    return faq.filter((entry) => `${entry.question} ${entry.answer}`.toLowerCase().includes(q));
  }, [faqQuery]);

  async function sendSupportTicket() {
    if (!user || sendingSupport) return;
    const subject = supportSubject.trim();
    const message = supportMessage.trim();
    if (subject.length < 3) return toast.error("Ajoute un objet à ta demande.");
    if (message.length < 10) return toast.error("Décris un peu plus le problème.");

    setSendingSupport(true);
    try {
      await createSupportTicket({
        userId: user.id,
        category: supportCategory,
        subject,
        message,
        priority: supportCategory === "safety" ? "high" : "normal",
        context: {
          app_version: APP_VERSION,
          page: typeof window !== "undefined" ? window.location.pathname : null,
          language: typeof navigator !== "undefined" ? navigator.language : null,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          submitted_at: new Date().toISOString(),
        },
      });
      setSupportSubject("");
      setSupportMessage("");
      await qc.invalidateQueries({ queryKey: ["support-tickets", user.id] });
      toast.success("Demande envoyée au support GlobeLink.");
    } catch (error) {
      toast.error((error as Error).message || "Impossible d’envoyer la demande.");
    } finally {
      setSendingSupport(false);
    }
  }

  async function sendReport() {
    if (!user || sendingReport) return;
    const targetId = reportType === "profile" ? selectedProfile?.id ?? null : extractUuid(reportTarget);
    if (!targetId) {
      return toast.error(
        reportType === "profile"
          ? "Sélectionne le compte à signaler."
          : "Colle un lien GlobeLink ou un identifiant valide.",
      );
    }
    if (reportDetails.trim().length > 3000) return toast.error("Le détail est limité à 3 000 caractères.");

    setSendingReport(true);
    try {
      await createReport({
        userId: user.id,
        targetType: reportType,
        targetId,
        reason: reportReason,
        details: reportDetails,
      });
      setReportDetails("");
      setReportTarget("");
      setSelectedProfile(null);
      setProfileSearch("");
      setSubmittedProfileSearch("");
      await qc.invalidateQueries({ queryKey: ["my-reports", user.id] });
      toast.success("Signalement transmis à l’équipe de modération.");
    } catch (error) {
      toast.error((error as Error).message || "Impossible d’envoyer le signalement.");
    } finally {
      setSendingReport(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-7">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">GlobeLink Assistance</p>
            <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Aide et support</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Trouve une réponse, contacte le support, signale un problème et suis tes demandes depuis un seul endroit.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <InfoCard icon={<BadgeHelp className="h-5 w-5" />} title="Version GlobeLink" value={APP_VERSION} />
          <InfoCard icon={<ShieldCheck className="h-5 w-5" />} title="Support et modération" value="Suivi intégré à ton compte" />
        </div>

        {admin.data && (
          <Link
            to="/support-admin"
            className="mt-4 flex min-h-12 items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 text-sm font-semibold text-primary transition hover:bg-primary/10"
          >
            <ShieldCheck className="h-4 w-4" /> Gestion du support
            <ChevronRight className="ml-auto h-4 w-4" />
          </Link>
        )}
      </section>

      <section className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-6">
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-display text-2xl">Questions fréquentes</h2>
            <p className="text-sm text-muted-foreground">Les réponses aux principaux réglages et problèmes GlobeLink.</p>
          </div>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={faqQuery} onChange={(event) => setFaqQuery(event.target.value)} placeholder="Rechercher dans l’aide" className="h-12 rounded-2xl pl-11" />
        </div>
        <div className="mt-4 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70">
          {filteredFaq.map((entry) => (
            <details key={entry.question} className="group bg-background/35 px-4 py-1 open:bg-background/60">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 text-sm font-semibold">
                <span className="min-w-0 flex-1">{entry.question}</span>
                <ChevronRight className="h-4 w-4 shrink-0 transition group-open:rotate-90" />
              </summary>
              <p className="pb-4 pr-6 text-sm leading-relaxed text-muted-foreground">{entry.answer}</p>
            </details>
          ))}
          {filteredFaq.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Aucune réponse trouvée.</p>}
        </div>
      </section>

      <section className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-2xl">Contacter le support</h2>
            <p className="mt-1 text-sm text-muted-foreground">Bug, compte, problème technique ou suggestion.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="space-y-2 text-sm font-semibold">
            Type de demande
            <select value={supportCategory} onChange={(event) => setSupportCategory(event.target.value as SupportCategory)} className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm font-normal outline-none focus:border-primary/40">
              {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm font-semibold">
            Objet
            <Input value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} maxLength={160} placeholder="Ex. Impossible d’ouvrir Travel Match" className="h-12 rounded-2xl" />
          </label>
          <label className="space-y-2 text-sm font-semibold">
            Description
            <Textarea value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} maxLength={5000} rows={6} placeholder="Explique ce que tu faisais, ce qui s’est passé et ce que tu attendais…" className="rounded-2xl" />
            <span className="block text-xs font-normal text-muted-foreground">La version de l’app et les informations techniques du navigateur sont jointes automatiquement.</span>
          </label>
          <div className="flex justify-end">
            <Button onClick={() => void sendSupportTicket()} disabled={sendingSupport} className="min-w-40 rounded-2xl">
              {sendingSupport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Envoyer
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
            <Flag className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-2xl">Signaler un contenu ou un compte</h2>
            <p className="mt-1 text-sm text-muted-foreground">Les signalements sont séparés des demandes techniques et envoyés à la modération.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="space-y-2 text-sm font-semibold">
            Élément à signaler
            <select value={reportType} onChange={(event) => { setReportType(event.target.value as ReportTargetType); setSelectedProfile(null); setReportTarget(""); }} className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm font-normal outline-none focus:border-primary/40">
              {Object.entries(reportTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          {reportType === "profile" ? (
            <div className="space-y-3">
              <label className="block space-y-2 text-sm font-semibold">
                Rechercher le compte
                <div className="flex gap-2">
                  <Input value={profileSearch} onChange={(event) => setProfileSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setSubmittedProfileSearch(profileSearch.trim()); }} placeholder="@pseudo ou nom" className="h-12 rounded-2xl" />
                  <Button variant="outline" className="h-12 rounded-2xl" onClick={() => setSubmittedProfileSearch(profileSearch.trim())} disabled={profileSearch.trim().length < 2 || profileResults.isFetching}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </label>
              {submittedProfileSearch.length >= 2 && (
                <div className="space-y-2 rounded-2xl border border-border/70 p-2">
                  {(profileResults.data ?? []).map((profile) => (
                    <button key={profile.id} type="button" onClick={() => setSelectedProfile(profile)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${selectedProfile?.id === profile.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-secondary/60"}`}>
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary"><UserRound className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{profile.display_name || profile.username}</p>
                        <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>
                      </div>
                      {selectedProfile?.id === profile.id && <CheckCircle2 className="h-5 w-5 text-primary" />}
                    </button>
                  ))}
                  {!profileResults.isFetching && (profileResults.data ?? []).length === 0 && <p className="p-3 text-sm text-muted-foreground">Aucun compte trouvé.</p>}
                </div>
              )}
            </div>
          ) : (
            <label className="space-y-2 text-sm font-semibold">
              Lien GlobeLink ou identifiant
              <Input value={reportTarget} onChange={(event) => setReportTarget(event.target.value)} placeholder="Colle le lien ou l’identifiant UUID" className="h-12 rounded-2xl" />
            </label>
          )}

          <label className="space-y-2 text-sm font-semibold">
            Motif
            <select value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm font-normal outline-none focus:border-primary/40">
              {reportReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm font-semibold">
            Détails facultatifs
            <Textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={3000} rows={5} placeholder="Ajoute le contexte utile à la modération…" className="rounded-2xl" />
          </label>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => void sendReport()} disabled={sendingReport} className="min-w-44 rounded-2xl border-amber-500/30 text-amber-700 dark:text-amber-300">
              {sendingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Flag className="mr-2 h-4 w-4" />}
              Envoyer le signalement
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <HistoryCard title="Mes demandes support" icon={<LifeBuoy className="h-5 w-5" />} loading={tickets.isLoading} empty="Aucune demande support pour le moment.">
          {(tickets.data ?? []).map((ticket) => (
            <div key={ticket.id} className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{ticket.subject}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{categoryLabels[ticket.category]} · {formatDate(ticket.created_at)}</p>
                </div>
                <StatusPill value={ticketStatusLabels[ticket.status] ?? ticket.status} active={ticket.status === "open" || ticket.status === "in_progress"} />
              </div>
              <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{ticket.message}</p>
              {ticket.admin_reply && (
                <div className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.05] p-3">
                  <p className="text-xs font-semibold text-primary">Réponse GlobeLink</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{ticket.admin_reply}</p>
                </div>
              )}
            </div>
          ))}
        </HistoryCard>

        <HistoryCard title="Mes signalements" icon={<Flag className="h-5 w-5" />} loading={reports.isLoading} empty="Aucun signalement pour le moment.">
          {(reports.data ?? []).map((report) => (
            <div key={report.id} className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{report.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{reportTypeLabels[report.target_type]} · {formatDate(report.created_at)}</p>
                </div>
                <StatusPill value={reportStatusLabels[report.status] ?? report.status} active={report.status === "open" || report.status === "reviewing"} />
              </div>
              {report.details && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{report.details}</p>}
              {report.resolution_note && (
                <div className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.05] p-3">
                  <p className="text-xs font-semibold text-primary">Décision de modération</p>
                  <p className="mt-1 text-sm leading-relaxed">{report.resolution_note}</p>
                </div>
              )}
            </div>
          ))}
        </HistoryCard>
      </div>

      <section className="rounded-[2rem] border border-border/70 bg-card p-3 shadow-soft sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <LegalLink to="/community-guidelines" icon={<ShieldCheck className="h-5 w-5" />} title="Règles de la communauté" description="Ce qui est autorisé ou non sur GlobeLink." />
          <LegalLink to="/privacy" icon={<FileText className="h-5 w-5" />} title="Confidentialité" description="Comment GlobeLink traite les données et les réglages de confidentialité." />
          <LegalLink to="/terms" icon={<Scale className="h-5 w-5" />} title="Conditions d’utilisation" description="Les règles d’utilisation du service GlobeLink." />
          <LegalLink to="/about" icon={<Info className="h-5 w-5" />} title="À propos de GlobeLink" description={`Mission, fonctionnement et version ${APP_VERSION}.`} />
        </div>
      </section>
    </div>
  );
}

function InfoCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/45 p-4"><div className="text-primary">{icon}</div><div><p className="text-xs text-muted-foreground">{title}</p><p className="mt-0.5 text-sm font-semibold">{value}</p></div></div>;
}

function HistoryCard({ title, icon, loading, empty, children }: { title: string; icon: React.ReactNode; loading: boolean; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-6"><div className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-foreground"><span className="text-primary">{icon}</span>{title}</div>{loading ? <div className="flex items-center justify-center p-8 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…</div> : !hasChildren ? <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{empty}</p> : <div className="space-y-3">{children}</div>}</section>;
}

function StatusPill({ value, active }: { value: string; active: boolean }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>{value}</span>;
}

function LegalLink({ to, icon, title, description }: { to: string; icon: React.ReactNode; title: string; description: string }) {
  return <Link to={to as any} className="group flex min-h-20 items-center gap-3 rounded-2xl p-3 transition hover:bg-secondary/55"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div><div className="min-w-0 flex-1"><p className="flex items-center gap-1 text-sm font-semibold">{title}<ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p></div></Link>;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}
