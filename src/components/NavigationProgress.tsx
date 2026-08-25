import { useRouterState } from "@tanstack/react-router";

/**
 * Immediate visual feedback for route transitions, especially useful on mobile
 * networks where a protected route may need a short data check before rendering.
 */
export function NavigationProgress() {
  const pending = useRouterState({ select: (state) => state.status === "pending" });

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden transition-opacity duration-150 ${pending ? "opacity-100" : "opacity-0"}`}
    >
      <div className="h-full w-full bg-primary/20">
        <div className="h-full w-1/2 animate-pulse rounded-r-full bg-primary shadow-[0_0_14px_color-mix(in_oklab,var(--color-primary)_65%,transparent)]" />
      </div>
    </div>
  );
}
