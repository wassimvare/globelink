import { useEffect } from "react";
import { ensurePushSubscription } from "@/lib/push-notifications";

/** Enregistre le cache hors ligne sans forcer de rechargement d'écran. */
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
        void ensurePushSubscription();
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