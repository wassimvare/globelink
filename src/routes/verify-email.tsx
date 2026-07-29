import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MailCheck, RefreshCw, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { authRedirect } from "@/lib/auth-redirects";

export const Route = createFileRoute("/verify-email")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Confirme ton adresse e-mail — GlobeLink" },
      { name: "description", content: "Active ton compte GlobeLink en confirmant ton adresse e-mail pour accéder au fil, aux stories et à la messagerie." },
      { property: "og:title", content: "Confirme ton adresse e-mail — GlobeLink" },
      { property: "og:description", content: "Dernière étape avant de rejoindre la communauté GlobeLink." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const confirmed = !!user?.email_confirmed_at;

  // Once the account is activated (link clicked → session refreshed), go to the app.
  useEffect(() => {
    if (!loading && confirmed) router.navigate({ to: "/", replace: true });
  }, [loading, confirmed, router]);

  // Poll for confirmation while this tab stays open.
  useEffect(() => {
    if (confirmed) return;
    const t = setInterval(() => { supabase.auth.refreshSession(); }, 5000);
    return () => clearInterval(t);
  }, [confirmed]);

  async function resend() {
    if (!user?.email) return;
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: user.email,
      options: { emailRedirectTo: authRedirect("/verify-email") },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("E-mail de confirmation renvoyé ✉️");
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 gradient-hero" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12">
        <div className="w-full rounded-3xl border border-white/20 bg-card/95 p-6 text-center shadow-elevated backdrop-blur">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
            <MailCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-4 font-display text-2xl">Confirme ton adresse</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Nous avons envoyé un lien de confirmation à{" "}
            <strong className="text-foreground">{user?.email ?? "ton adresse e-mail"}</strong>.
            Clique sur ce lien pour activer ton compte — l'accès à l'application se débloque automatiquement.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Pense à vérifier tes spams. Le lien est valable 24 h.
          </p>

          <div className="mt-6 space-y-2">
            <Button onClick={resend} disabled={busy || !user} className="w-full rounded-xl gradient-hero text-primary-foreground shadow-soft">
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Renvoyer l'e-mail
            </Button>
            <Button onClick={signOut} variant="outline" className="w-full rounded-xl">
              <LogOut className="h-4 w-4" /> Changer de compte
            </Button>
          </div>
        </div>
        <Link to="/" className="mt-6 text-sm text-primary-foreground/80 hover:text-primary-foreground">
          ← Découvrir GlobeLink sans compte
        </Link>
      </div>
    </div>
  );
}
