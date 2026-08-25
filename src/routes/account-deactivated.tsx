import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PauseCircle, RefreshCcw, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/lib/auth-context";
import { reactivateAccount } from "@/lib/account-data";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/account-deactivated")({
  head: () => ({ meta: [{ title: "Compte désactivé — GlobeLink" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AccountDeactivatedPage,
});

function AccountDeactivatedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"reactivate" | "logout" | null>(null);

  async function reactivate() {
    if (!user || busy) return;
    setBusy("reactivate");
    try {
      await reactivateAccount();
      toast.success("Compte GlobeLink réactivé.");
      navigate({ to: "/", replace: true });
    } catch (error) {
      toast.error((error as Error).message || "Réactivation impossible");
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    if (busy) return;
    setBusy("logout");
    await supabase.auth.signOut({ scope: "local" });
    navigate({ to: "/", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-lg rounded-[2rem] border border-border bg-card p-6 text-center shadow-elevated sm:p-8">
        <div className="mx-auto grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-slate-950 shadow-soft">
          <BrandLogo className="h-full w-full" priority />
        </div>
        <div className="mx-auto mt-6 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <PauseCircle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-display text-3xl font-semibold">Ton compte est désactivé</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Ton profil n’apparaît plus dans la recherche ni dans Travel Match. Tes données sont conservées tant que tu ne supprimes pas définitivement le compte.
        </p>

        {user ? (
          <div className="mt-6 grid gap-3">
            <Button size="lg" disabled={busy !== null} onClick={() => void reactivate()} className="rounded-2xl">
              {busy === "reactivate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Réactiver mon compte
            </Button>
            <Button variant="outline" disabled={busy !== null} onClick={() => void logout()} className="rounded-2xl">
              <LogOut className="mr-2 h-4 w-4" /> Se déconnecter
            </Button>
          </div>
        ) : (
          <Link to="/auth" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Se connecter pour réactiver
          </Link>
        )}
      </section>
    </main>
  );
}
