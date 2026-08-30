import { useEffect } from "react";
import { toast } from "sonner";
import {
  enablePushNotifications,
  ensurePushSubscription,
  pushPermissionState,
} from "@/lib/push-notifications";

const PUSH_PROMPT_KEY = "globelink.push-call-prompt.v1";

/** Enregistre le cache hors ligne et prépare les notifications d'appels. */
export function PwaBootstrap() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        await registration.update();

        const permission = pushPermissionState();
        if (permission === "granted") {
          void ensurePushSubscription();
          return;
        }

        if (permission === "default" && !window.localStorage.getItem(PUSH_PROMPT_KEY)) {
          window.localStorage.setItem(PUSH_PROMPT_KEY, "shown");
          window.setTimeout(() => {
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
                    .catch(() => toast.error("Impossible d'activer les notifications"));
                },
              },
            });
          }, 900);
        }
      } catch {
        // L'application reste utilisable même si le cache hors ligne ou le push échoue.
      }
    };

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
    };
  }, []);
  return null;
}