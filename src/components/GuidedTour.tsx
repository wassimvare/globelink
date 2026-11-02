import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  Home,
  MessageCircle,
  NotebookTabs,
  PlusCircle,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import {
  GUIDED_TOUR_START_EVENT,
  guidedTourDoneKey,
  guidedTourPendingKey,
} from "@/lib/guided-tour";

type TourStep = {
  title: string;
  text: string;
  desktopSelector?: string;
  mobileSelector?: string;
  icon: typeof Sparkles;
};

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const STEPS: TourStep[] = [
  {
    title: "Bienvenue sur GlobeLink",
    text: "Découvre les fonctions essentielles en moins d’une minute. Tu pourras revoir ce guide depuis Paramètres → Aide.",
    icon: Sparkles,
  },
  {
    title: "Ton accueil",
    text: "Retrouve le fil de la communauté, les stories et les idées de voyage. C’est ton point de départ sur GlobeLink.",
    desktopSelector: '[data-tour="home-desktop"]',
    mobileSelector: '[data-tour="home-mobile"]',
    icon: Home,
  },
  {
    title: "Explorer le monde",
    text: "Ouvre Explorer pour chercher des destinations, hôtels, restaurants, activités et offres du moment.",
    desktopSelector: '[data-tour="explorer-desktop"]',
    mobileSelector: '[data-tour="explorer-mobile"]',
    icon: Compass,
  },
  {
    title: "Créer rapidement",
    text: "Le bouton central te permet de créer du contenu ou de démarrer rapidement une nouvelle action dans GlobeLink.",
    desktopSelector: '[data-tour="quick-create-desktop"]',
    mobileSelector: '[data-tour="quick-create-mobile"]',
    icon: PlusCircle,
  },
  {
    title: "Préparer ton voyage",
    text: "Dans Voyage, retrouve tes carnets, GlobeLink IA pour organiser ton séjour et Travel Match pour rencontrer des voyageurs compatibles.",
    desktopSelector: '[data-tour="travel-desktop"]',
    mobileSelector: '[data-tour="travel-mobile"]',
    icon: NotebookTabs,
  },
  {
    title: "Discuter avec les voyageurs",
    text: "La messagerie te permet de garder le contact avec les personnes rencontrées sur GlobeLink et de préparer un voyage ensemble.",
    desktopSelector: '[data-tour="messages"]',
    mobileSelector: '[data-tour="messages"]',
    icon: MessageCircle,
  },
  {
    title: "Ton profil et tes réglages",
    text: "Retrouve ton profil, tes préférences, la confidentialité, la sécurité et l’aide. Tu peux aussi relancer ce tutoriel à tout moment.",
    desktopSelector: '[data-tour="profile-desktop"]',
    mobileSelector: '[data-tour="profile-mobile"]',
    icon: UserRound,
  },
  {
    title: "Tu es prêt à voyager",
    text: "Explore une destination ou crée ton premier voyage. IA+, le carnet, le budget et Travel Match seront là pour t’accompagner.",
    icon: Sparkles,
  },
];

function isVisible(element: Element) {
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
}

function findTarget(step: TourStep) {
  if (typeof window === "undefined") return null;
  const preferMobile = window.innerWidth < 640;
  const selectors = preferMobile
    ? [step.mobileSelector, step.desktopSelector]
    : [step.desktopSelector, step.mobileSelector];

  for (const selector of selectors) {
    if (!selector) continue;
    const candidates = Array.from(document.querySelectorAll(selector));
    const target = candidates.find(isVisible);
    if (target) return target as HTMLElement;
  }
  return null;
}

export function GuidedTour() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const step = STEPS[stepIndex];
  const Icon = step.icon;

  const progress = useMemo(
    () => Math.round(((stepIndex + 1) / STEPS.length) * 100),
    [stepIndex],
  );

  const refreshTarget = useCallback(() => {
    if (!open || typeof window === "undefined") {
      setTargetRect(null);
      return;
    }
    const target = findTarget(STEPS[stepIndex]);
    if (!target) {
      setTargetRect(null);
      return;
    }

    const rect = target.getBoundingClientRect();
    const padding = 7;
    setTargetRect({
      top: Math.max(6, rect.top - padding),
      left: Math.max(6, rect.left - padding),
      width: Math.min(window.innerWidth - 12, rect.width + padding * 2),
      height: rect.height + padding * 2,
    });
  }, [open, stepIndex]);

  useEffect(() => {
    const onStart = () => {
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener(GUIDED_TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(GUIDED_TOUR_START_EVENT, onStart);
  }, []);

  useEffect(() => {
    if (!user || open || pathname.startsWith("/onboarding")) return;

    let stopped = false;
    const tryStart = () => {
      if (stopped) return;
      let pending = false;
      try {
        pending = localStorage.getItem(guidedTourPendingKey(user.id)) === "1";
      } catch {
        pending = false;
      }
      if (!pending) return;
      if (document.querySelector(".phase2-onboarding")) return;
      setStepIndex(0);
      setOpen(true);
    };

    tryStart();
    const interval = window.setInterval(tryStart, 500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [open, pathname, user]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    refreshTarget();

    const onViewportChange = () => refreshTarget();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishTour();
    };

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(refreshTarget, 120);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open, refreshTarget, stepIndex]);

  function rememberFinished() {
    if (!user) return;
    try {
      localStorage.removeItem(guidedTourPendingKey(user.id));
      localStorage.setItem(guidedTourDoneKey(user.id), "1");
    } catch {
      // The guide remains usable for the current session.
    }
  }

  function finishTour() {
    rememberFinished();
    setOpen(false);
    setStepIndex(0);
    setTargetRect(null);
  }

  function next() {
    if (stepIndex >= STEPS.length - 1) {
      finishTour();
      return;
    }
    setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
  }

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-[170]" role="dialog" aria-modal="true" aria-label="Tutoriel GlobeLink">
      {targetRect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-2xl border-2 border-white/90 bg-white/5 shadow-[0_0_0_9999px_rgba(2,6,23,0.72),0_0_0_5px_rgba(8,123,131,0.35)] transition-all duration-300"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-slate-950/72 backdrop-blur-[1px]" aria-hidden />
      )}

      <section className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] mx-auto max-w-md overflow-hidden rounded-[1.75rem] border border-white/15 bg-card/98 shadow-2xl backdrop-blur-2xl sm:bottom-7 sm:inset-x-6">
        <div className="h-1 bg-secondary">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                Étape {stepIndex + 1} sur {STEPS.length}
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-foreground">{step.title}</h2>
            </div>
            <button
              type="button"
              onClick={finishTour}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground transition hover:text-foreground"
              aria-label="Fermer le tutoriel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{step.text}</p>

          <div className="mt-5 flex items-center gap-2">
            {stepIndex > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                className="rounded-xl"
              >
                <ChevronLeft className="h-4 w-4" /> Retour
              </Button>
            ) : (
              <button
                type="button"
                onClick={finishTour}
                className="min-h-10 px-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Passer
              </button>
            )}

            <Button type="button" onClick={next} className="ml-auto rounded-xl px-5">
              {stepIndex === STEPS.length - 1 ? "Terminer" : "Suivant"}
              {stepIndex < STEPS.length - 1 && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
