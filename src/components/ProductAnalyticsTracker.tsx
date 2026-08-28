import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { trackProductEvent, type ProductEventName } from "@/lib/product-analytics";

function areaEvent(pathname: string): { event: ProductEventName; area: string } | null {
  if (["/map", "/destinations", "/activities", "/deals", "/marketplace"].some((path) => pathname.startsWith(path))) {
    return { event: "explorer_opened", area: "explorer" };
  }
  if (pathname.startsWith("/trips")) {
    return { event: "voyage_opened", area: "voyage" };
  }
  if (["/intelligence", "/ai-trip", "/ai-pro"].some((path) => pathname.startsWith(path))) {
    return { event: "ai_opened", area: "ai" };
  }
  if (pathname.startsWith("/match")) {
    return { event: "travel_match_opened", area: "travel_match" };
  }
  if (pathname.startsWith("/new-post")) {
    return { event: "post_creation_opened", area: "social" };
  }
  if (pathname.startsWith("/new-place")) {
    return { event: "place_creation_opened", area: "community_places" };
  }
  return null;
}

export function ProductAnalyticsTracker() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { user, loading } = useAuth();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !pathname || lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;

    const authenticated = Boolean(user);
    void trackProductEvent("page_view", { authenticated });

    const area = areaEvent(pathname);
    if (area) {
      void trackProductEvent(area.event, {
        area: area.area,
        authenticated,
      });
    }
  }, [loading, pathname, user]);

  return null;
}
