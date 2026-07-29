import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Laptop, Loader2, LockKeyhole, LogOut, MailCheck, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { authRedirect } from "@/lib/auth-redirects";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({ meta: [{ title: "Sécurité du compte — GlobeLink" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SecurityPage,
});

function SecurityPage() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"email" | "global" | null>(null);
  const provider = String(user?.app_metadata?.provider ?? "email");
  const device = useMemo(() => {
    if (typeof navigator === "undefined") return "Navigateur actuel";
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "Téléphone ou tablette" : "Ordinateur";
  }, []);

  async function sendReset() {
    if (!user?.email || busy) return;
    setBusy("email");
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: authRedirect("/reset-password") });
    setBusy(null);
    if (error) return toast.error("Le lien n'a pas pu être envoyé.");
    toast.success("Lien sécurisé envoyé à ton adresse e-mail.");
  }

  async function signOutEverywhere() {
    if (busy) return;
    if (!window.confirm("Déconnecter toutes les sessions GlobeLink, y compris cet appareil ?")) return;
    setBusy("global");
    const { error } = await supabase.auth.signOut({ scope: "global" });
    setBusy(null);
    if (error) return toast.error("La déconnexion globale a échoué.");
    toast.success("Toutes les sessions ont été fermées.");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="app-page">
      <AppHeader />
      <main className="page-container pb-20">
        <header className="page-heading">
          <div><div className="eyebrow"><ShieldCheck className="h-4 w-4" /> Centre de sécurité</div><h1 className="mt-2 font-display text-3xl font-semibold sm:text-5xl">Protège ton compte.</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">Contrôle ta session, renouvelle ton mot de passe et ferme rapidement les appareils qui ne doivent plus avoir accès.</p></div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <section className="surface-card rounded-[2rem] p-5 sm:p-7">
            <h2 className="font-display text-2xl">Session actuelle</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <SecurityFact icon={device.includes("Téléphone") ? <Smartphone className="h-5 w-5" /> : <Laptop className="h-5 w-5" />} label="Appareil" value={device} />
              <SecurityFact icon={<MailCheck className="h-5 w-5" />} label="Adresse confirmée" value={user?.email_confirmed_at ? "Oui" : "Non"} good={!!user?.email_confirmed_at} />
              <SecurityFact icon={<LockKeyhole className="h-5 w-5" />} label="Méthode" value={provider === "google" ? "Google" : "E-mail et mot de passe"} />
              <SecurityFact icon={<CheckCircle2 className="h-5 w-5" />} label="Dernière connexion" value={user?.last_sign_in_at ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(user.last_sign_in_at)) : "Session active"} good />
            </div>
            <div className="mt-5 rounded-2xl border border-border/70 bg-secondary/40 p-4 text-sm text-muted-foreground"><strong className="text-foreground">Durée de session :</strong> {session?.expires_at ? `valide jusqu'au ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.expires_at * 1000))}` : "gérée automatiquement"}. Aucun jeton d'authentification n'est affiché dans l'interface.</div>
          </section>

          <aside className="surface-subtle rounded-[2rem] p-5">
            <h2 className="font-display text-2xl">Actions rapides</h2>
            <Button onClick={sendReset} disabled={busy !== null || !user?.email} variant="outline" className="mt-5 h-auto min-h-12 w-full justify-start rounded-2xl px-4 py-3 text-left"><KeyRound className="mr-3 h-5 w-5 shrink-0 text-primary" /><span><strong className="block">Changer le mot de passe</strong><span className="text-xs font-normal text-muted-foreground">Recevoir un lien sécurisé</span></span>{busy === "email" && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}</Button>
            <Button onClick={signOutEverywhere} disabled={busy !== null} variant="outline" className="mt-3 h-auto min-h-12 w-full justify-start rounded-2xl border-destructive/20 px-4 py-3 text-left text-destructive hover:bg-destructive/5 hover:text-destructive"><LogOut className="mr-3 h-5 w-5 shrink-0" /><span><strong className="block">Déconnecter tous les appareils</strong><span className="text-xs font-normal opacity-75">Révoque toutes les sessions actives</span></span>{busy === "global" && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}</Button>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">GlobeLink ne te demandera jamais ton mot de passe, un code reçu par e-mail ou les informations complètes de ta carte dans une conversation.</p>
          </aside>
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground"><Link to="/settings/profile" className="font-semibold text-primary underline underline-offset-4">Retour aux paramètres du profil</Link></div>
      </main>
    </div>
  );
}

function SecurityFact({ icon, label, value, good }: { icon: React.ReactNode; label: string; value: string; good?: boolean }) {
  return <div className="rounded-2xl border border-border/70 bg-background/65 p-4"><div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${good ? "text-emerald-600" : "text-muted-foreground"}`}>{icon}{label}</div><div className="mt-2 text-sm font-semibold">{value}</div></div>;
}
