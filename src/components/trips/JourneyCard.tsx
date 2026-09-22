import { Link } from "@tanstack/react-router";
import { ArrowRight, type LucideIcon } from "lucide-react";

type JourneyCardProps = {
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
  to: string;
  onClick?: () => void;
  actionLabel?: string;
};

export function JourneyCard({
  number,
  icon: Icon,
  title,
  description,
  to,
  onClick,
  actionLabel = "Ouvrir",
}: JourneyCardProps) {
  return (
    <Link
      to={to as any}
      preload="intent"
      onClick={onClick}
      className="group rounded-3xl border border-border/70 bg-card p-4 shadow-soft transition hover:-translate-y-1 hover:border-primary/25 hover:shadow-elevated"
    >
      <div className="flex items-center justify-between">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-xs font-bold text-muted-foreground">0{number}</span>
      </div>
      <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
      <p className="mt-1 min-h-[44px] text-xs leading-relaxed text-muted-foreground">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary">
        {actionLabel} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
      </span>
    </Link>
  );
}
