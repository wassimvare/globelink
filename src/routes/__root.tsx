import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/lib/theme";
import { BottomNav } from "@/components/BottomNav";
import { PageTransition } from "@/components/PageTransition";
import { NetworkStatus } from "@/components/NetworkStatus";
import { PwaBootstrap } from "@/components/PwaBootstrap";
import { MobileBootstrap } from "@/components/MobileBootstrap";
import { CallProvider } from "@/components/CallProvider";
import { OnboardingGate } from "@/components/OnboardingGate";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl">404</h1>
        <p className="mt-2 text-muted-foreground">Cette page n'existe pas.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-full gradient-hero px-5 py-2 text-sm font-medium text-primary-foreground shadow-soft"
        >
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl">Quelque chose a mal tourné</h1>
        <p className="mt-2 text-sm text-muted-foreground">Réessaie ou reviens à l'accueil.</p>
        {import.meta.env.DEV && (
          <details className="mt-4 rounded-2xl border border-border bg-muted/40 p-3 text-left text-xs">
            <summary className="cursor-pointer font-semibold">Voir la cause technique</summary>
            <p className="mt-2 break-words text-muted-foreground">{error.message}</p>
          </details>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Réessayer
          </button>
          <a href="/" className="rounded-full border border-border bg-background px-4 py-2 text-sm">
            Accueil
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#087b83" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "application-name", content: "GlobeLink" },
      { name: "format-detection", content: "telephone=no, date=no, address=no, email=no" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "GlobeLink" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { title: "GlobeLink — Le réseau social des voyageurs" },
      {
        name: "description",
        content:
          "Partage tes voyages, découvre des lieux recommandés par la communauté et prépare tes prochains itinéraires sur GlobeLink.",
      },
      { property: "og:title", content: "GlobeLink — Le réseau social des voyageurs" },
      {
        property: "og:description",
        content: "Photos, lieux et conseils voyage par une communauté mondiale.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "icon",
        href: "/icons/globelink-app-icon-192-v20260824.png?v=20260825-rgb2",
        type: "image/png",
        sizes: "192x192",
      },
      {
        rel: "shortcut icon",
        href: "/icons/globelink-app-icon-192-v20260824.png?v=20260825-rgb2",
        type: "image/png",
      },
      { rel: "manifest", href: "/manifest.webmanifest?v=20260825-rgb2" },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png?v=20260825-rgb2",
        sizes: "180x180",
      },
      {
        rel: "apple-touch-icon-precomposed",
        href: "/apple-touch-icon.png?v=20260825-rgb2",
        sizes: "180x180",
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthSync() {
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <CallProvider>
            <AuthSync />
            <PwaBootstrap />
            <MobileBootstrap />
            <OnboardingGate>
              <div className="mobile-app-content">
                <PageTransition>
                  <Outlet />
                </PageTransition>
              </div>
            </OnboardingGate>
            <BottomNav />
            <NetworkStatus />
            <Toaster position="top-center" richColors closeButton />
          </CallProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
