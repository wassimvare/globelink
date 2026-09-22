import { useMemo, useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

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

type ProfileReportFlowProps = {
  username: string;
  submitting: boolean;
  onBack: () => void;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<void>;
};

export function ProfileReportFlow({
  username,
  submitting,
  onBack,
  onCancel,
  onSubmit,
}: ProfileReportFlowProps) {
  const [reportReasonId, setReportReasonId] = useState<ReportReasonId | null>(null);
  const [otherReason, setOtherReason] = useState("");

  const selectedReason = useMemo(
    () => REPORT_REASONS.find((reason) => reason.id === reportReasonId),
    [reportReasonId],
  );
  const canSubmit =
    !!selectedReason && (selectedReason.id !== "other" || otherReason.trim().length >= 3);

  const submit = async () => {
    if (!selectedReason || !canSubmit || submitting) return;
    const reason =
      selectedReason.id === "other"
        ? `Autre : ${otherReason.trim().slice(0, 240)}`
        : selectedReason.label;
    await onSubmit(reason);
  };

  return (
    <>
      <DrawerHeader className="px-5 pb-2 pt-5 text-left">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
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
                disabled={submitting}
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
              disabled={submitting}
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
          onClick={() => void submit()}
          disabled={!canSubmit || submitting}
          className="mt-4 w-full rounded-2xl bg-destructive px-4 py-3.5 text-sm font-bold text-destructive-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting ? "Envoi…" : "Envoyer le signalement"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
    </>
  );
}
