import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { authRedirect } from "@/lib/auth-redirects";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Réinitialiser le mot de passe — GlobeLink" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      toast.error("Entre une adresse e-mail valide.");
      return;
    }

    setBusy(true);
    setDeliveryError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: authRedirect("/reset-password"),
    });
    setBusy(false);

    if (error) {
      console.warn("Password reset request failed", error.message);
      const raw = `${error.message} ${(error as any).code ?? ""}`.toLowerCase();
      const message =
        raw.includes("unauthorized ip") || raw.includes("5.7.1")
          ? "Brevo refuse actuellement les e-mails envoyés par Supabase à cause d’une restriction d’adresse IP. Dans Brevo, désactive la restriction IP du SMTP ou autorise l’envoi transactionnel depuis Supabase."
          : raw.includes("rate limit") || raw.includes("over_email_send_rate_limit")
            ? "Trop de codes ont été demandés récemment. Attends quelques minutes avant de réessayer."
            : "Le code n’a pas pu être envoyé. Vérifie la configuration SMTP dans Supabase et Brevo.";
      setDeliveryError(message);
      toast.error("E-mail non envoyé");
      return;
    }
    sessionStorage.setItem("globelink-recovery-email", normalizedEmail);
    setSent(true);
    toast.success("Si ce compte existe, un code temporaire a été envoyé.");
  }

  function openCodePage() {
    sessionStorage.setItem("globelink-recovery-email", email.trim().toLowerCase());
    navigate({ to: "/reset-password" });
  }

  return (
    <main className="auth-screen grid min-h-screen place-items-center px-4 py-8">
      <section className="auth-card w-full max-w-md rounded-[2rem] border border-border/70 bg-card/92 p-6 shadow-elevated backdrop-blur-2xl sm:p-8">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Mail className="h-5 w-5" />
        </div>
        <div className="eyebrow">
          <ShieldCheck className="h-3.5 w-3.5" /> Code à usage unique
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold">Mot de passe oublié</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Entre ton adresse e-mail. Tu recevras un code à 6 chiffres à saisir directement dans
          GlobeLink, sans lien externe.
        </p>

        {sent ? (
          <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <strong className="block">Code envoyé</strong>
                <span className="mt-1 block text-muted-foreground">
                  Le code est temporaire et utilisable une seule fois. Regarde aussi dans les
                  courriers indésirables.
                </span>
              </div>
            </div>
            <Button type="button" className="mt-4 h-11 w-full rounded-xl" onClick={openCodePage}>
              <KeyRound className="mr-2 h-4 w-4" /> Saisir le code
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full rounded-xl"
              onClick={() => setSent(false)}
            >
              Renvoyer un code
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {deliveryError && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm leading-6 text-destructive">
                <strong className="block">Envoi impossible</strong>
                {deliveryError}
              </div>
            )}
            <div>
              <Label htmlFor="reset-email">Adresse e-mail</Label>
              <Input
                id="reset-email"
                type="email"
                required
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="toi@exemple.fr"
                className="mt-1.5 h-12 rounded-xl"
              />
            </div>
            <Button disabled={busy} className="h-12 w-full rounded-xl">
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Envoi sécurisé…
                </>
              ) : (
                "Recevoir mon code"
              )}
            </Button>
          </form>
        )}

        <Link
          to="/auth"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à la connexion
        </Link>
      </section>
    </main>
  );
}
