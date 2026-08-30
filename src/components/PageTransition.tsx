import { type ReactNode } from "react";

/**
 * Keep route content fully visible during navigation.
 *
 * The previous Framer Motion opacity transition could leave the current screen
 * almost transparent while TanStack Router was waiting for the next protected
 * route to resolve on iOS/PWA. That produced the washed-out/white screen seen
 * when opening the travel notebook. Route transitions now stay visually stable;
 * NavigationProgress still provides lightweight feedback at the top of the app.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
