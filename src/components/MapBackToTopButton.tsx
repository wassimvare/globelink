import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export function MapBackToTopButton() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pathname !== "/map") {
      setScroller(null);
      setPortalTarget(null);
      setVisible(false);
      return;
    }

    const locateExplorerScroller = () => {
      const mobileExplorerSection = Array.from(document.querySelectorAll<HTMLElement>("section")).find(
        (section) => section.querySelector("h2")?.textContent?.includes("À découvrir"),
      );
      const nextScroller =
        mobileExplorerSection?.querySelector<HTMLElement>(
          '[class*="snap-x"][class*="overflow-x-auto"]',
        ) ?? null;

      if (mobileExplorerSection) mobileExplorerSection.classList.add("relative");
      setPortalTarget((current) =>
        current === mobileExplorerSection ? current : mobileExplorerSection ?? null,
      );
      setScroller((current) => (current === nextScroller ? current : nextScroller));
    };

    locateExplorerScroller();
    const observer = new MutationObserver(locateExplorerScroller);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!scroller) {
      setVisible(false);
      return;
    }

    const updateVisibility = () => setVisible(scroller.scrollLeft > 24);
    updateVisibility();
    scroller.addEventListener("scroll", updateVisibility, { passive: true });
    return () => scroller.removeEventListener("scroll", updateVisibility);
  }, [scroller]);

  if (pathname !== "/map" || !scroller || !portalTarget || !visible) return null;

  const returnToStart = () => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ left: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return createPortal(
    <button
      type="button"
      onClick={returnToStart}
      aria-label="Revenir au début de la liste À découvrir"
      className="absolute left-2 top-1/2 z-30 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-border/70 bg-background/95 text-primary shadow-elevated backdrop-blur-xl transition hover:bg-background active:scale-95 lg:hidden"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>,
    portalTarget,
  );
}
