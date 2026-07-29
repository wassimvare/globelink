import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
      className="relative grid h-10 w-10 place-items-center rounded-full border border-border/70 bg-card/80 text-foreground transition hover:border-primary/25 hover:shadow-soft"
    >
      <Sun className={`h-4 w-4 transition-all ${theme === "dark" ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100"}`} />
      <Moon className={`absolute h-4 w-4 transition-all ${theme === "dark" ? "rotate-0 scale-100" : "rotate-90 scale-0 opacity-0"}`} />
    </button>
  );
}
