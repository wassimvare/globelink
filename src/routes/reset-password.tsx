import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MailCheck,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe — GlobeLink" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPassword,
});

type RecoveryState = "verify" | "checking" | "ready" | "invalid" | "success";

function ResetPassword() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [state, setState] = useState<RecoveryState>("verify");
  const [reason, setReason] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const savedEmail = sessionStorage.getItem("globelink-recovery-email") ?? "";
    setEmail(savedEmail);

    let active = true;
    const ready = () => {
      if (active) setState("ready");
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) ready();
    });

    async function supportLegacyRecoveryLinks() {
      const url = new URL(window.location.href);
      const codeParam = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (!codeParam && !tokenHash && !(accessToken && refreshToken)) return;

      setState("checking");
      try {
        if (codeParam) {
          const { error } = await supabase.auth.exchangeCodeForSession(codeParam);
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        }
        window.history.replaceState({}, document.title, "/reset-password");
        ready();
      } catch (error) {
        if (!active) return;
        setReason(
          error instanceof Error ? error.message : "La récupération est invalide ou expirée.",
        );
        setState("invalid");
      }
    }

    supportLegacyRecoveryLinks();
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const checks = useMemo(
    () => [
      { label: "10 caractères minimum", ok: password.length >= 10 },
      { label: "Minuscule et majuscule", ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
      { label: "Au moins un chiffre", ok: /\d/.test(password) },
      { label: "Un caractère spécial", ok: /[^A-Za-z0-9]/.test(password) },
    ],
    [password],
  );
  const validPassword = checks.every((check) => check.ok);

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.replace(/\D/g, "").slice(0, 6);
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail))
      return toast.error("Entre l'adresse e-mail utilisée pour la demande.");
    if (normalizedCode.length !== 6) return toast.error("Le code doit contenir 6 chiffres.");

    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedCode,
      type: "recovery",
    });
    setBusy(false);
    if (error) {
      setReason("Le code est incorrect, expiré ou a déjà été utilisé.");
      toast.error("Code incorrect ou expiré.");
      return;
    }
    sessionStorage.removeItem("globelink-recovery-email");
    setState("ready");
    toast.success("Code vérifié. Choisis maintenant ton nouveau mot de passe.");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || state !== "ready") return;
    if (!validPassword) return toast.error("Renforce ton mot de passe avant de continuer.");
    if (password !== confirm) return toast.error("Les mots de passe ne correspondent pas.");

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      toast.error(
        /session|expired|invalid/i.test(error.message)
          ? "La session a expiré. Demande un nouveau code."
          : "Le mot de passe n'a pas pu être modifié.",
      );
      return;
    }

    await supabase.auth.signOut();
    setBusy(false);
    setState("success");
    toast.success("Ton mot de passe est actif immédiatement.");
    window.setTimeout(() => navigate({ to: "/auth", replace: true }), 1500);
  }

  return (
    <main className="auth-screen grid min-h-screen place-items-center px-4 py-8">
      <section className="auth-card w-full max-w-md rounded-[2rem] border border-border/70 bg-card/92 p-6 shadow-elevated backdrop-blur-2xl sm:p-8">
        {state === "checking" && (
          <Status
            icon={<Loader2 className="h-6 w-6 animate-spin" />}
            title="Vérification…"
            text="GlobeLink sécurise la récupération de ton compte."
          />
        )}

        {state === "invalid" && (
          <Status
            icon={<ShieldAlert className="h-6 w-6" />}
            title="Récupération impossible"
            text={reason || "Demande un nouveau code."}
            destructive
            action={
              <Button asChild className="mt-5 w-full rounded-xl">
                <Link to="/forgot-password">Recevoir un nouveau code</Link>
              </Button>
            }
          />
        )}

        {state === "success" && (
          <Status
            icon={<ShieldCheck className="h-6 w-6" />}
            title="Mot de passe mis à jour"
            text="La modification est déjà active. Redirection vers la connexion…"
            success
          />
        )}

        {state === "verify" && (
          <>
            <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <MailCheck className="h-5 w-5" />
            </div>
            <div className="eyebrow">
              <ShieldCheck className="h-3.5 w-3.5" /> Vérification sécurisée
            </div>
            <h1 className="mt-2 font-display text-3xl font-semibold">Entre le code reçu</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Saisis l'adresse e-mail du compte et le code à 6 chiffres envoyé par GlobeLink.
            </p>
            <form onSubmit={verifyCode} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="recovery-email">Adresse e-mail</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value.slice(0, 254))}
                  className="mt-1.5 h-12 rounded-xl"
                />
              </div>
              <div>
                <Label htmlFor="recovery-code">Code de sécurité</Label>
                <Input
                  id="recovery-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="mt-1.5 h-14 rounded-xl text-center font-mono text-2xl font-bold tracking-[0.35em]"
                />
              </div>
              <Button disabled={busy || code.length !== 6} className="h-12 w-full rounded-xl">
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Vérification…
                  </>
                ) : (
                  "Vérifier le code"
                )}
              </Button>
            </form>
            <div className="mt-5 flex items-center justify-between gap-3 text-sm">
              <Link to="/forgot-password" className="font-semibold text-primary hover:underline">
                Renvoyer un code
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Connexion
              </Link>
            </div>
          </>
        )}

        {state === "ready" && (
          <>
            <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="eyebrow">
              <ShieldCheck className="h-3.5 w-3.5" /> Code vérifié
            </div>
            <h1 className="mt-2 font-display text-3xl font-semibold">Nouveau mot de passe</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              La modification sera appliquée immédiatement à ton compte.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="new-password">Nouveau mot de passe</Label>
                <div className="relative mt-1.5">
                  <Input
                    id="new-password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={10}
                    maxLength={128}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-12 rounded-xl pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((value) => !value)}
                    aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary/55 p-3">
                {checks.map((check) => (
                  <div
                    key={check.label}
                    className={`flex items-center gap-1.5 text-[11px] ${check.ok ? "text-emerald-600" : "text-muted-foreground"}`}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {check.label}
                  </div>
                ))}
              </div>
              <div>
                <Label htmlFor="confirm-password">Confirmer</Label>
                <Input
                  id="confirm-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={10}
                  maxLength={128}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className="mt-1.5 h-12 rounded-xl"
                />
              </div>
              <Button
                disabled={busy || !validPassword || password !== confirm}
                className="h-12 w-full rounded-xl"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Modification…
                  </>
                ) : (
                  "Modifier mon mot de passe"
                )}
              </Button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

function Status({
  icon,
  title,
  text,
  action,
  destructive,
  success,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
  destructive?: boolean;
  success?: boolean;
}) {
  const tone = destructive
    ? "bg-destructive/10 text-destructive"
    : success
      ? "bg-emerald-500/10 text-emerald-600"
      : "bg-primary/10 text-primary";
  return (
    <div className="py-8 text-center">
      <div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${tone}`}>{icon}</div>
      <h1 className="mt-5 font-display text-3xl font-semibold">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}
