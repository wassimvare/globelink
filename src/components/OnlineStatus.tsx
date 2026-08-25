import { useQuery } from "@tanstack/react-query";
import { getPresence } from "@/lib/social-privacy";

export function OnlineStatus({ userId, showLabel = true }: { userId: string; showLabel?: boolean }) {
  const { data: lastSeen } = useQuery({
    queryKey: ["user-presence", userId],
    queryFn: () => getPresence(userId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 0,
  });

  if (!lastSeen) return null;
  const ageMs = Date.now() - lastSeen.getTime();
  if (ageMs < 2 * 60_000) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/15" />
        {showLabel ? "En ligne" : null}
      </span>
    );
  }
  if (!showLabel || ageMs > 60 * 60_000) return null;
  const minutes = Math.max(2, Math.round(ageMs / 60_000));
  return <span className="shrink-0 text-[11px] text-muted-foreground">Actif il y a {minutes} min</span>;
}
