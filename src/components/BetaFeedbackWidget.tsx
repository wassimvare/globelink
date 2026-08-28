import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bug, Lightbulb, Loader2, MessageCircleQuestion, Send, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { createSupportTicket, SUPPORT_TICKET_MESSAGE_MIN_LENGTH } from "@/lib/support";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type FeedbackKind = "bug" | "confusing" | "idea";
type FeedbackImpact = "blocking" | "annoying" | "minor";

const BETA_FEEDBACK_MAX_LENGTH = 1500;

const feedbackKinds: Array<{
  value: FeedbackKind;
  label: string;
  helper: string;
  icon: typeof Bug;
}> = [
  { value: "bug", label: "Bug", helper: "Quelque chose ne fonctionne pas", icon: Bug },
  { value: "confusing", label: "Pas clair", helper: "Je ne comprends pas quoi faire", icon: MessageCircleQuestion },
  { value: "idea", label: "Idée", helper: "Une amélioration qui me manque", icon: Lightbulb },
];

const impacts: Array<{ value: FeedbackImpact; label: string }> = [
  { value: "blocking", label: "Ça me bloque" },
  { value: "annoying", label: "C’est gênant" },
  { value: "minor", label: "Petit détail" },
];

const hiddenPrefixes = ["/auth", "/verify-email", "/forgot-password", "/reset-password", "/onboarding", "/beta-admin"];

export function BetaFeedbackWidget() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [impact, setImpact] = useState<FeedbackImpact>("annoying");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [adminBetaTabHost, setAdminBetaTabHost] = useState<HTMLElement | null>(null);

  const hidden = !user || hiddenPrefixes.some((prefix) => pathname.startsWith(prefix));
  const selected = useMemo(() => feedbackKinds.find((item) => item.value === kind) ?? feedbackKinds[0], [kind]);
  const trimmedMessageLength = message.trim().length;
  const remainingMinimum = Math.max(0, SUPPORT_TICKET_MESSAGE_MIN_LENGTH - trimmedMessageLength);
  const messageTooShort = trimmedMessageLength > 0 && trimmedMessageLength < SUPPORT_TICKET_MESSAGE_MIN_LENGTH;

  useEffect(() => {
    if (pathname !== "/admin" || typeof document === "undefined") {
      setAdminBetaTabHost(null);
      return;
    }

    let host: HTMLElement | null = null;
    const frame = window.requestAnimationFrame(() => {
      const tabList = document.querySelector<HTMLElement>('[role="tablist"]');
      if (!tabList) return;

      const reportTab = Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]')).find((item) =>
        item.textContent?.trim().includes("Signalements"),
      );

      host = document.createElement("span");
      host.dataset.betaAdminTabHost = "true";
      host.style.display = "contents";

      if (reportTab) reportTab.insertAdjacentElement("afterend", host);
      else tabList.appendChild(host);

      setAdminBetaTabHost(host);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      host?.remove();
      setAdminBetaTabHost(null);
    };
  }, [pathname]);

  if (hidden) return null;

  async function submit() {
    const body = message.trim();
    if (!user || pending) return;
    if (body.length < SUPPORT_TICKET_MESSAGE_MIN_LENGTH) {
      toast.error(`Ton retour doit contenir au moins ${SUPPORT_TICKET_MESSAGE_MIN_LENGTH} caractères.`);
      return;
    }

    setPending(true);
    try {
      const width = typeof window === "undefined" ? 0 : window.innerWidth;
      const height = typeof window === "undefined" ? 0 : window.innerHeight;
      const priority = impact === "blocking" ? "high" : "normal";
      const page = pathname.slice(0, 180) || "/";

      await createSupportTicket({
        userId: user.id,
        category: kind === "bug" ? "bug" : "feedback",
        subject: `[Bêta] ${selected.label} · ${page}`,
        message: body,
        priority,
        context: {
          beta: true,
          beta_round: "private-1",
          feedback_kind: kind,
          impact,
          page,
          viewport: width && height ? `${width}x${height}` : "unknown",
          source: "in-app-beta",
        },
      });

      toast.success("Merci — ton retour bêta a bien été envoyé.");
      setOpen(false);
      setMessage("");
      setKind("bug");
      setImpact("annoying");
    } catch (error) {
      toast.error((error as Error)?.message || "Impossible d’envoyer le retour bêta.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {adminBetaTabHost &&
        createPortal(
          <Link
            to="/beta-admin"
            role="tab"
            aria-label="Voir les retours de la bêta privée"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium text-primary ring-offset-background transition-all hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <TestTube2 className="mr-2 h-4 w-4" />
            Bêta
          </Link>,
          adminBetaTabHost,
        )}

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-3 z-40 inline-flex h-10 items-center gap-1.5 rounded-full border border-primary/25 bg-card/95 px-3 text-xs font-bold text-primary shadow-elevated backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-primary/45 sm:bottom-5 sm:right-5"
            aria-label="Envoyer un retour sur la bêta GlobeLink"
          >
            <TestTube2 className="h-4 w-4" />
            Bêta
          </button>
        </DialogTrigger>

        <DialogContent className="rounded-[1.75rem] sm:max-w-lg">
          <DialogHeader>
            <div className="mb-1 flex items-center gap-2 text-primary">
              <TestTube2 className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-[0.14em]">Bêta privée</span>
            </div>
            <DialogTitle>Qu’est-ce qui t’a marqué ici ?</DialogTitle>
            <DialogDescription>
              Signale seulement ce que tu as réellement rencontré. La page actuelle est jointe automatiquement au retour.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2">
            {feedbackKinds.map((item) => {
              const Icon = item.icon;
              const active = kind === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setKind(item.value)}
                  className={`min-h-24 rounded-2xl border p-3 text-left transition ${
                    active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
                  <div className="mt-2 text-sm font-bold">{item.label}</div>
                  <div className="mt-1 hidden text-[10px] leading-4 sm:block">{item.helper}</div>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {impacts.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setImpact(item.value)}
                className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  impact === item.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value.slice(0, BETA_FEEDBACK_MAX_LENGTH))}
            rows={5}
            autoFocus
            aria-invalid={messageTooShort}
            placeholder={
              kind === "bug"
                ? "Ex. J’appuie sur Ajouter à mon voyage et rien ne se passe…"
                : kind === "confusing"
                  ? "Ex. Je ne savais pas quoi faire après avoir créé mon voyage…"
                  : "Ex. J’aimerais pouvoir…"
            }
            className={`resize-none rounded-2xl text-base leading-6 ${messageTooShort ? "border-destructive/70 focus-visible:ring-destructive/30" : ""}`}
          />
          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span className={messageTooShort ? "font-semibold text-destructive" : "truncate"}>
              {messageTooShort
                ? `Encore ${remainingMinimum} caractère${remainingMinimum > 1 ? "s" : ""} minimum`
                : `Page : ${pathname || "/"}`}
            </span>
            <span className="shrink-0 tabular-nums">
              min. {SUPPORT_TICKET_MESSAGE_MIN_LENGTH} · {message.length}/{BETA_FEEDBACK_MAX_LENGTH}
            </span>
          </div>

          <DialogFooter>
            <Button
              disabled={pending || trimmedMessageLength < SUPPORT_TICKET_MESSAGE_MIN_LENGTH}
              onClick={submit}
              className="h-11 rounded-2xl"
            >
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Envoyer le retour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
