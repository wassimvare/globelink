import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MapBackToTopButton() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pathname !== "/map") {
      setVisible(false);
      return;
    }

    const updateVisibility = () => {
      const threshold = Math.max(420, window.innerHeight * 0.55);
      setVisible(window.scrollY > threshold);
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, [pathname]);

  if (pathname !== "/map" || !visible) return null;

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={scrollToTop}
      aria-label="Retourner au début de la page Explorer"
      className="fixed left-1/2 z-50 -translate-x-1/2 rounded-full border border-border/70 bg-background/95 px-4 shadow-elevated backdrop-blur-xl sm:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.25rem)" }}
    >
      <ArrowUp className="mr-2 h-4 w-4" />
      Retour au début
    </Button>
  );
}
