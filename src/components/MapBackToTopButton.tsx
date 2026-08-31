import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { ChevronsLeft } from "lucide-react";

export function MapBackToTopButton() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [scroller, setScroller] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (pathname !== "/map") {
      setScroller(null);
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

  if (pathname !== "/map" || !scroller) return null;

  const returnToStart = () => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ left: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return createPortal(
    <button
      type="button"
      onClick={returnToStart}
      aria-label="Retourner au début de la liste À découvrir"
      className="group grid min-h-[118px] w-[132px] shrink-0 snap-start place-items-center rounded-2xl border border-primary/25 bg-primary/5 px-3 py-4 text-center shadow-sm transition hover:border-primary/40 hover:bg-primary/10 active:scale-[0.98] lg:hidden"
    >
      <span className="flex flex-col items-center gap-2 text-sm font-semibold text-primary">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft transition group-active:scale-95">
          <ChevronsLeft className="h-5 w-5" />
        </span>
        Retour au début
      </span>
    </button>,
    scroller,
  );
}
