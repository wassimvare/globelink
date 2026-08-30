import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Check, ChevronLeft, MoreHorizontal, ShieldAlert, UserX } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { reportProfile, saveRelationshipControl } from "@/features/social/profile-moderation";

type ProfileActionsProps = {
  currentUserId?: string | null;
  targetUserId: string;
  username: string;
};

type ProfileAction = "restrict" | "block" | "report";

const REPORT_REASONS = [
  { id: "spam", label: "Spam ou contenu indésirable" },
  { id: "harassment", label: "Harcèlement ou intimidation" },
  { id: "impersonation", label: "Faux compte ou usurpation d'identité" },
  { id: "inappropriate", label: "Contenu inapproprié" },
  { id: "scam", label: "Arnaque ou fraude" },
  { id: "dangerous", label: "Menace, haine ou comportement dangereux" },
  { id: "other", label: "Autre" },
] as const;

type ReportReasonId = (typeof REPORT_REASONS)[number]["id"];

export function ProfileActions({
  currentUserId,
  targetUserId,
  username,
}: ProfileActionsProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ProfileAction | null>(null);
  const [reportMode, setReportMode] = useState(false);
  const [reportReasonId, setReportReasonId] = useState<ReportReasonId | null>(null);
  const [otherReason, setOtherReason] = useState("");

  const isOwnProfile = !!currentUserId && currentUserId === targetUserId;
  const selectedReason = REPORT_REASONS.find((reason) => reason.id === reportReasonId);
  const canSubmitReport =
    !!selectedReason && (selectedReason.id !== "other" || otherReason.trim().length >= 3);

  if (!currentUserId || isOwnProfile) return null;

  const resetReportFlow = () => {
    setReportMode(false);
    setReportReasonId(null);
    setOtherReason("");
  };

  const closeDrawer = () => {
    setOpen(false);
    resetReportFlow();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (loading) return;
    setOpen(nextOpen);
    if (!nextOpen) resetReportFlow();
  };

  const syncRelationshipVisibilityCaches = () => {
    queryClient.setQueriesData({ queryKey: ["search"] }, (cached: unknown) => {
      if (!cached || typeof cached !== "object") return cached;

      const searchResults = cached as { user?: Array<{ id?: string }> };
      if (!Array.isArray(searchResults.user)) return cached;

      const visibleUsers = searchResults.user.filter((result) => result.id !== targetUserId);
      if (visibleUsers.length === searchResults.user.length) return cached;

      return { ...searchResults, user: visibleUsers };
    });

    void queryClient.invalidateQueries({ queryKey: ["search"] });
    void queryClient.invalidateQueries({ queryKey: ["relationship-controls"] });
  };

  const handleRestrict = async () => {
    if (loading) return;
    setLoading("restrict");

    try {
      await saveRelationshipControl({
        ownerId: currentUserId,
        targetId: targetUserId,
        mode: "restricted",
      });
      syncRelationshipVisibilityCaches();
      toast.success(`@${username} a été restreint`);
      closeDrawer();
    } catch {
      toast.error("Impossible de restreindre ce compte.");
    } finally {
      setLoading(null);
    }
  };

  const handleBlock = async () => {
    if (loading) return;
    setLoading("block");

    try {
      await saveRelationshipControl({
        ownerId: currentUserId,
        targetId: targetUserId,
        mode: "blocked",
      });
      syncRelationshipVisibilityCaches();
      toast.success(`@${username} a été bloqué`);
      closeDrawer();
    } catch {
      toast.error("Impossible de bloquer ce compte.");
    } finally {
      setLoading(null);
    }
  };

  const handleReport = async () => {
    if (loading || !selectedReason || !canSubmitReport) return;
    setLoading("report");

    const reason =
      selectedReason.id === "other"
        ? `Autre : ${otherReason.trim().slice(0, 240)}`
        : selectedReason.label;

    try {
      await reportProfile({
        reporterId: currentUserId,
        targetId: targetUserId,
        reason,
      });
      toast.success("Signalement envoyé");
      closeDrawer();
    } catch {
      toast.error("Impossible d'envoyer ce signalement.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Options du profil"
          className="grid h-10 w-10 place-items-center rounded-full bg-background/90 text-foreground shadow-soft backdrop-blur transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <MoreHorizontal className="h-6 w-6" />
        </button>
      </DrawerTrigger>

      <DrawerContent className="mx-auto max-h-[88dvh] max-w-lg rounded-t-[28px] border-border/70 bg-card/98 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {reportMode ? (
          <>
            <DrawerHeader className="px-5 pb-2 pt-5 text-left">
              <button
                type="button"
                onClick={() => resetReportFlow()}
                disabled={loading !== null}
                className="mb-3 inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-60"
              >
                <ChevronLeft className="h-4 w-4" />
                Retour
              </button>
              <DrawerTitle>Pourquoi signalez-vous @{username} ?</DrawerTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Choisissez la raison qui correspond le mieux. Aucun signalement n'est envoyé avant votre confirmation.
              </p>
            </DrawerHeader>

            <div className="overflow-y-auto px-4 pb-3">
              <div className="space-y-2" role="radiogroup" aria-label="Raison du signalement">
                {REPORT_REASONS.map((reason) => {
                  const selected = reportReasonId === reason.id;
                  return (
                    <button
                      key={reason.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setReportReasonId(reason.id)}
                      disabled={loading !== null}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        selected
                          ? "border-primary/60 bg-primary/10 text-foreground"
                          : "border-border/70 bg-background/40 hover:bg-secondary"
                      }`}
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                          selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                        }`}
                      >
                        {selected ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                      <span>{reason.label}</span>
                    </button>
                  );
                })}
              </div>

              {reportReasonId === "other" ? (
                <div className="mt-3">
                  <label htmlFor="profile-report-other" className="mb-1.5 block text-sm font-semibold">
                    Précisez la raison
                  </label>
                  <textarea
                    id="profile-report-other"
                    value={otherReason}
                    onChange={(event) => setOtherReason(event.target.value.slice(0, 240))}
                    disabled={loading !== null}
                    maxLength={240}
                    rows={3}
                    placeholder="Expliquez brièvement le problème…"
                    className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                  <div className="mt-1 text-right text-xs text-muted-foreground">
                    {otherReason.length}/240
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleReport()}
                disabled={!canSubmitReport || loading !== null}
                className="mt-4 w-full rounded-2xl bg-destructive px-4 py-3.5 text-sm font-bold text-destructive-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loading === "report" ? "Envoi…" : "Envoyer le signalement"}
              </button>

              <button
                type="button"
                onClick={closeDrawer}
                disabled={loading !== null}
                className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Annuler
              </button>
            </div>
          </>
        ) : (
          <>
            <DrawerHeader className="px-5 pb-2 pt-5 text-left">
              <DrawerTitle>Options du profil</DrawerTitle>
            </DrawerHeader>

            <div className="space-y-2 px-4 pb-3">
              <button
                type="button"
                onClick={() => void handleRestrict()}
                disabled={loading !== null}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary">
                  <ShieldAlert className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">Restreindre</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Limiter discrètement les interactions de ce compte.
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleBlock()}
                disabled={loading !== null}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10">
                  <Ban className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">Bloquer</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Empêcher ce compte d'interagir avec toi.
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setReportMode(true)}
                disabled={loading !== null}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary">
                  <UserX className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">Signaler</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Envoyer ce profil à la modération GlobeLink.
                  </span>
                </span>
              </button>

              <DrawerClose asChild>
                <button
                  type="button"
                  disabled={loading !== null}
                  className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Annuler
                </button>
              </DrawerClose>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
