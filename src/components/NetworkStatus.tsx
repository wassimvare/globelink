import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function NetworkStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-20 z-[70] mx-auto flex max-w-md items-center justify-center gap-2 rounded-full border border-amber-500/30 bg-amber-50/95 px-4 py-2 text-xs font-medium text-amber-950 shadow-soft backdrop-blur dark:bg-amber-950/90 dark:text-amber-50"
    >
      <WifiOff className="h-4 w-4" />
      Connexion perdue — certaines actions seront indisponibles.
    </div>
  );
}
