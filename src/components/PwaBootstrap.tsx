import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  enablePushNotifications,
  ensurePushSubscription,
  pushPermissionState,
} from "@/lib/push-notifications";

const PUSH_PROMPT_KEY = "globelink.push-call-prompt.v1";

/** Enregistre le cache hors ligne et prépare les notifications d'appels. */
export function PwaBootstrap() {
  const { user, loading } = useAuth();

  // Le service worker doit rester disponible même avant connexion pour le cache/PWA.
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        await registration.update();
      } catch {
        // L'application reste utilisable même si le cache hors ligne échoue.
      }
    };

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
    };
  }, []);

  // Ne demande/attache le push qu'une fois la session Supabase réellement chargée.
  // Sinon le navigateur peut accorder la permission puis l'RPC d'enregistrement
  // partir sans JWT et répondre 401.
  useEffect(() => {
    if (
      !import.meta.env.PROD ||
      loading ||
      !user ||
      !("serviceWorker" in navigator)
    )
      return;

    let cancelled = false;
    let promptTimer: number | undefined;

    const preparePush = async () => {
      try {
        await navigator.serviceWorker.ready;
        if (cancelled) return;

        const permission = pushPermissionState();
        if (permission === "granted") {
          const state = await ensurePushSubscription();
          if (state !== "granted") {
            console.warn("Push subscription could not be attached to authenticated user");
          }
          return;
        }

        if (permission === "default" && !window.localStorage.getItem(PUSH_PROMPT_KEY)) {
          window.localStorage.setItem(PUSH_PROMPT_KEY, "shown");
          promptTimer = window.setTimeout(() => {
            if (cancelled) return;
            toast("Recevoir les appels même hors de GlobeLink", {
              description: "Active les notifications une fois pour ne plus rater un appel entrant.",
              duration: 15_000,
              action: {
                label: "Activer",
                onClick: () => {
                  void enablePushNotifications()
                    .then((state) => {
                      if (state === "granted") toast.success("Notifications d'appels activées");
                      else if (state === "unsupported")
                        toast.info("Sur iPhone, ajoute GlobeLink à l’écran d’accueil pour activer les notifications.");
                      else toast.info("Notifications non activées");
                    })
                    .catch((error) => {
                      console.warn("Push notification activation failed", error);
                      toast.error("Impossible d'activer les notifications");
                    });
                },
              },
            });
          }, 900);
        }
      } catch (error) {
        console.warn("Push notification preparation failed", error);
      }
    };

    void preparePush();
    return () => {
      cancelled = true;
      if (promptTimer !== undefined) window.clearTimeout(promptTimer);
    };
  }, [loading, user?.id]);

  return null;
}
