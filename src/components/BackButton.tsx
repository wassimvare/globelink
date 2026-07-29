import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/**
 * Universal "leave this page" control.
 * Goes back in history when possible, otherwise falls back to the feed.
 */
export function BackButton({
  label = "Retour",
  className = "",
  compact = false,
}: { label?: string; className?: string; compact?: boolean }) {
  const router = useRouter();

  function leave() {
    const canGoBack = typeof window !== "undefined" && window.history.length > 1;
    if (canGoBack) router.history.back();
    else router.navigate({ to: "/" });
  }

  return (
    <button
      type="button"
      onClick={leave}
      aria-label={label}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card text-sm font-medium text-foreground transition hover:shadow-soft ${compact ? "h-9 w-9 justify-center" : "h-9 px-3"} ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      {!compact && <span>{label}</span>}
    </button>
  );
}
