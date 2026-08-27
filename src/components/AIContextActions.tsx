import { Link } from "@tanstack/react-router";
import { Crown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type ProMode = "research" | "compare" | "plan" | "safety";

type Props = {
  destination?: string | null;
  freePrompt: string;
  proPrompt: string;
  proMode?: ProMode;
  tripId?: string | null;
  freeLabel?: string;
  proLabel?: string;
  className?: string;
  compact?: boolean;
  dark?: boolean;
  showFree?: boolean;
  showPro?: boolean;
};

export function AIContextActions({
  destination,
  freePrompt,
  proPrompt,
  proMode = "research",
  tripId,
  freeLabel = "Demander à GlobeLink",
  proLabel = "Approfondir avec IA+",
  className = "",
  compact = false,
  dark = false,
  showFree = true,
  showPro = true,
}: Props) {
  return (
    <div className={["flex flex-wrap gap-2", className].filter(Boolean).join(" ")}>
      {showFree && (
        <Button
          asChild
          size={compact ? "sm" : "default"}
          variant="outline"
          className={
            dark
              ? "rounded-full border-white/35 bg-black/20 text-white hover:bg-white/10 hover:text-white"
              : "rounded-full border-cyan-400/25 bg-cyan-500/[0.06] text-cyan-700 hover:bg-cyan-500/[0.12] dark:text-cyan-300"
          }
        >
          <Link
            to="/ai-trip"
            search={{
              destination: destination || undefined,
              prompt: freePrompt,
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" /> {freeLabel}
          </Link>
        </Button>
      )}

      {showPro && (
        <Button
          asChild
          size={compact ? "sm" : "default"}
          className="rounded-full bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-500 text-white shadow-soft hover:opacity-95"
        >
          <Link
            to="/ai-pro"
            search={{
              prompt: proPrompt,
              mode: proMode,
              tripId: tripId || undefined,
            }}
          >
            <Crown className="mr-2 h-4 w-4" /> {proLabel}
          </Link>
        </Button>
      )}
    </div>
  );
}
