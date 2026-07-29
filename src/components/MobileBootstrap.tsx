import { useEffect } from "react";

type StandaloneNavigator = Navigator & { standalone?: boolean };

/**
 * Mobile browser/runtime fixes that do not alter GlobeLink's UI.
 * Keeps viewport measurements stable when the address bar or keyboard opens,
 * and exposes the installed/standalone state to CSS when needed.
 */
export function MobileBootstrap() {
  useEffect(() => {
    const root = document.documentElement;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as StandaloneNavigator).standalone);

    root.dataset.appDisplay = standalone ? "standalone" : "browser";
    root.classList.toggle("is-standalone", standalone);
    root.classList.toggle("is-touch", window.matchMedia("(pointer: coarse)").matches);

    const updateViewport = () => {
      const viewport = window.visualViewport;
      const visibleHeight = Math.round(viewport?.height ?? window.innerHeight);
      const keyboardInset = Math.max(
        0,
        Math.round(window.innerHeight - visibleHeight - (viewport?.offsetTop ?? 0)),
      );

      root.style.setProperty("--mobile-viewport-height", `${visibleHeight}px`);
      root.style.setProperty("--mobile-keyboard-inset", `${keyboardInset}px`);
      root.classList.toggle("is-keyboard-open", keyboardInset > 120);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport, { passive: true });
    window.addEventListener("orientationchange", updateViewport, { passive: true });
    window.visualViewport?.addEventListener("resize", updateViewport, { passive: true });
    window.visualViewport?.addEventListener("scroll", updateViewport, { passive: true });

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, []);

  return null;
}
