import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

type ArrowPosition = {
  left: number;
  top: number;
};

export function MapBackToTopButton() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<ArrowPosition | null>(null);

  useEffect(() => {
    if (pathname !== "/map") {
      setScroller(null);
      setVisible(false);
      setPosition(null);
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
      setPosition(null);
      return;
    }

    const sync = () => {
      const rect = scroller.getBoundingClientRect();
      const hasStartedScrolling = scroller.scrollLeft > 4;
      const isOnScreen = rect.bottom > 0 && rect.top < window.innerHeight;

      setVisible(hasStartedScrolling && isOnScreen);
      setPosition({
        left: Math.max(12, rect.left + 8),
        top: rect.top + rect.height / 2,
      });
    };

    sync();
    scroller.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);

    const frame = window.requestAnimationFrame(sync);
    const delayed = window.setTimeout(sync, 250);

    return () => {
      scroller.removeEventListener("scroll", sync);
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayed);
    };
  }, [scroller]);

  if (
    pathname !== "/map" ||
    !scroller ||
    !visible ||
    !position ||
    typeof document === "undefined"
  )
    return null;

  const returnToStart = () => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ left: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return createPortal(
    <button
      type="button"
      onClick={returnToStart}
      aria-label="Revenir au début de la liste À découvrir"
      className="fixed z-[70] grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-border/70 bg-background/95 text-primary shadow-elevated backdrop-blur-xl transition active:scale-95 lg:hidden"
      style={{ left: position.left, top: position.top }}
    >
      <ChevronLeft className="h-5 w-5" strokeWidth={2.6} />
    </button>,
    document.body,
  );
}
