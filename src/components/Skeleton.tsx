export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}

export function PostCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      <div className="flex items-center gap-3 p-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2 w-20" />
        </div>
      </div>
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}
