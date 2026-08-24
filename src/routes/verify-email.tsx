import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { MailCheck, RefreshCw, LogOut, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";

const verifySearch = z.object({ email: z.string().email().optional() });
const PENDING_EMAIL_KEY = "globelink.pending-signup-email";

export const Route = createFileRoute("/verify-email")({
  ssr: false,
  validateSearch: verifySearch,
  head: () => ({
    meta: [
      { title: "Code de vérification — GlobeLink" },
      {
        name: "description",
        content: "Entre le code reçu par e-mail pour activer ton compte GlobeLink.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const search = Route.useSearch();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const email = useMemo(() => {
    if (search.email) return search.email.toLowerCase();
    if (user?.email) return user.email.toLowerCase();
    if (typeof window !== "undefined")
      return sessionStorage.getItem(PENDING_EMAIL_KEY)?.toLowerCase() ?? "";
    return "";
  }, [search.email, user?.email]);

  useEffect(() => {
    if (!loading && user?.email_confirmed_at) {
      sessionStorage.removeItem(PENDING_EMAIL_KEY);
      router.navigate({ to: "/", replace: true });
    }
  }, [loading, user?.email_confirmed_at, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!email) return toast.error("Adresse e-mail manquante. Recommence l'inscription.");
    if (!/^\d{6,8}$/.test(code)) return toast.error("Entre le code complet reçu par e-mail.");
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setBusy(false);
    if (error) {
      if (/expired|invalid|token/i.test(error.message))
        return toast.error("Code invalide ou expiré. Demande un nouveau code.");
      if (/rate|limit/i.test(error.message))
        return toast.error("Trop de tentatives. Attends quelques instants.");
      return toast.error("Vérification impossible. Réessaie.");
    }
    sessionStorage.removeItem(PENDING_EMAIL_KEY);
    toast.success("Adresse vérifiée. Bienvenue sur GlobeLink !");
    router.navigate({ to: "/", replace: true });
  }

  async function resend() {
    if (!email || resendBusy || cooldown > 0) return;
    setResendBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setResendBusy(false);
    if (error) {
      if (/rate|limit|security purposes/i.test(error.message)) {
        setCooldown(60);
        return toast.error("Un code vient déjà d'être envoyé. Attends une minute.");
      }
      return toast.error("Impossible de renvoyer le code pour le moment.");
    }
    setCooldown(60);
    toast.success("Nouveau code envoyé.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    sessionStorage.removeItem(PENDING_EMAIL_KEY);
    router.navigate({ to: "/auth", replace: true });
  }

  if (!email && !loading) {
    return (
      <div className="auth-screen relative min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-elevated">
          <BrandLogo className="mx-auto h-20 w-20" priority />
          <h1 className="mt-4 font-display text-2xl font-semibold">Inscription introuvable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reviens à la création de compte pour recevoir un nouveau code.
          </p>
          <Button asChild className="mt-6 w-full rounded-2xl">
            <Link to="/auth">Créer mon compte</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen relative min-h-screen overflow-hidden bg-background">
      <div className="auth-ambient absolute inset-0" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-[max(2rem,env(safe-area-inset-top))]">
        <div className="w-full rounded-[1.75rem] border border-border/80 bg-card p-5 text-center shadow-elevated sm:p-7">
          <div className="mx-auto h-20 w-20 overflow-hidden rounded-3xl shadow-soft">
            <BrandLogo className="h-full w-full" priority />
          </div>
          <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-4 w-4" /> Vérification du compte
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold sm:text-3xl">
            Entre le code reçu
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Un code de vérification a été envoyé à{" "}
            <strong className="break-all text-foreground">{email}</strong>.
          </p>

          <form onSubmit={verify} className="mt-6">
            <InputOTP
              value={code}
              onChange={(value) => setCode(value.replace(/\D/g, ""))}
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              containerClassName="justify-center"
              aria-label="Code de vérification"
            >
              <InputOTPGroup className="gap-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="h-12 w-10 rounded-xl border border-border bg-background text-lg font-bold sm:h-14 sm:w-12"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>

            <Button
              type="submit"
              disabled={busy || code.length !== 6}
              className="mt-6 h-12 w-full rounded-2xl"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MailCheck className="h-4 w-4" />
              )}
              {busy ? "Vérification…" : "Valider mon code"}
            </Button>
          </form>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button
              onClick={resend}
              disabled={resendBusy || cooldown > 0}
              variant="outline"
              className="rounded-2xl"
            >
              <RefreshCw className={`h-4 w-4 ${resendBusy ? "animate-spin" : ""}`} />
              {cooldown > 0 ? `Renvoyer dans ${cooldown}s` : "Renvoyer le code"}
            </Button>
            <Button onClick={signOut} variant="outline" className="rounded-2xl">
              <LogOut className="h-4 w-4" /> Changer de compte
            </Button>
          </div>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Vérifie aussi les courriers indésirables. Ne communique jamais ce code à une autre
            personne.
          </p>
        </div>
      </div>
    </div>
  );
}
