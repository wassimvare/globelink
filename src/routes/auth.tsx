import { createFileRoute, Link, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  MapPin,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { authRedirect, safeInternalPath } from "@/lib/auth-redirects";
import { BrandLogo } from "@/components/BrandLogo";

const search = z.object({ redirect: z.string().optional() });
const emailSchema = z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(254);
const usernameSchema = z
  .string()
  .trim()
  .min(3, "Le pseudo doit contenir au moins 3 caractères")
  .max(24, "Le pseudo est trop long")
  .regex(/^[a-zA-Z0-9_]+$/, "Utilise uniquement des lettres, chiffres ou underscores")
  .refine(
    (v) => !["admin", "support", "globelink", "moderator", "modérateur"].includes(v.toLowerCase()),
    "Ce pseudo est réservé",
  );
const passwordSchema = z
  .string()
  .min(10, "Utilise au moins 10 caractères")
  .regex(/[A-Za-z]/, "Ajoute au moins une lettre")
  .regex(/[0-9]/, "Ajoute au moins un chiffre");
const PENDING_EMAIL_KEY = "globelink.pending-signup-email";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Connexion — GlobeLink" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  validateSearch: search,
  component: AuthPage,
});

function AuthPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { redirect } = useSearch({ from: "/auth" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<"signin" | "signup" | "google" | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const googleEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH !== "false";

  useEffect(() => {
    if (!user) return;
    if (!user.email_confirmed_at && !user.phone_confirmed_at) {
      router.navigate({
        to: "/verify-email",
        search: { email: user.email ?? undefined },
        replace: true,
      });
      return;
    }
    router.navigate({ to: safeInternalPath(redirect), replace: true });
  }, [user, redirect, router]);

  const strength = useMemo(() => {
    let score = 0;
    if (password.length >= 10) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const validEmail = emailSchema.safeParse(email);
    if (!validEmail.success) return toast.error(validEmail.error.issues[0]?.message);
    if (!password) return toast.error("Entre ton mot de passe.");
    setBusy("signin");
    const { error } = await supabase.auth.signInWithPassword({ email: validEmail.data, password });
    setBusy(null);
    if (error) {
      if (/confirm|verified|verification/i.test(error.message)) {
        sessionStorage.setItem(PENDING_EMAIL_KEY, validEmail.data);
        toast.error("Confirme d'abord le code reçu par e-mail.");
        router.navigate({ to: "/verify-email", search: { email: validEmail.data } });
        return;
      }
      return toast.error("Connexion impossible. Vérifie tes identifiants.");
    }
    toast.success("Content de te revoir !");
  }

  async function signUp(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const validUsername = usernameSchema.safeParse(username.toLowerCase());
    if (!validUsername.success) return toast.error(validUsername.error.issues[0]?.message);
    const validPassword = passwordSchema.safeParse(password);
    if (!validPassword.success) return toast.error(validPassword.error.issues[0]?.message);
    if (password !== confirmPassword) return toast.error("Les mots de passe ne correspondent pas.");
    const validEmail = emailSchema.safeParse(email);
    if (!validEmail.success) return toast.error(validEmail.error.issues[0]?.message);

    setBusy("signup");
    // Les profils non vérifiés sont volontairement masqués par RLS. Une lecture
    // anonyme directe de `profiles` ne peut donc pas servir à vérifier un pseudo.
    // L'RPC SECURITY DEFINER ne renvoie qu'un booléen et ne révèle aucun profil.
    const { data: usernameAvailable, error: usernameError } = await (supabase as any).rpc(
      "is_username_available",
      { _username: validUsername.data },
    );
    if (!usernameError && usernameAvailable === false) {
      setBusy(null);
      return toast.error("Ce pseudo est déjà utilisé.");
    }
    if (usernameError) {
      // Ne bloque jamais toute l'inscription pour une vérification de disponibilité.
      // Le trigger handle_new_user garde l'unicité atomique côté base.
      console.warn("[GlobeLink auth] Vérification du pseudo indisponible", usernameError.message);
    }

    const { data, error } = await supabase.auth.signUp({
      email: validEmail.data,
      password,
      options: {
        data: { username: validUsername.data, full_name: validUsername.data },
        emailRedirectTo: authRedirect("/"),
      },
    });
    setBusy(null);
    if (error) {
      const message = error.message || "";
      if (/rate|limit|security purposes/i.test(message))
        return toast.error("Trop de tentatives. Attends une minute puis réessaie.");
      if (/sending confirmation|smtp|email.*send|failed to send/i.test(message)) {
        return toast.error(
          "Le compte n’a pas pu recevoir son code. Configure le SMTP Supabase avec le programme CONFIGURER_AUTH_GOOGLE_EMAIL_ADMIN.bat.",
          { duration: 9000 },
        );
      }
      if (/signup.*disabled|signups not allowed/i.test(message))
        return toast.error("Les inscriptions par e-mail sont désactivées dans Supabase.");
      return toast.error(
        message || "La création du compte a échoué. Vérifie l’adresse puis réessaie.",
      );
    }

    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return toast.info(
        "Un compte existe déjà avec cette adresse. Utilise l’onglet Connexion ou Mot de passe oublié.",
      );
    }

    sessionStorage.setItem(PENDING_EMAIL_KEY, validEmail.data);
    if (data.session && data.user?.email_confirmed_at) {
      toast.success("Compte créé, bienvenue !");
      return;
    }
    toast.success("Code envoyé. Entre-le pour activer ton compte.");
    router.navigate({ to: "/verify-email", search: { email: validEmail.data } });
  }

  async function google() {
    if (busy || !googleEnabled) return;
    setBusy("google");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirect(safeInternalPath(redirect)),
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setBusy(null);
      const message = error.message || "";
      if (/provider.*disabled|unsupported provider/i.test(message)) {
        toast.error(
          "Google n’est pas encore activé dans Supabase. Lance CONFIGURER_AUTH_GOOGLE_EMAIL_ADMIN.bat.",
          { duration: 9000 },
        );
      } else if (/redirect|not allowed/i.test(message)) {
        toast.error("L’adresse de retour Google n’est pas autorisée dans Supabase.", {
          duration: 8000,
        });
      } else {
        toast.error(message || "Connexion Google impossible pour le moment.");
      }
    }
  }

  return (
    <div className="auth-screen relative min-h-screen overflow-x-hidden bg-background">
      <div className="auth-ambient absolute inset-0" aria-hidden />
      <div className="auth-mobile-shell relative mx-auto grid min-h-screen max-w-7xl items-start gap-10 px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-4 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-8 lg:py-8">
        <section className="hidden max-w-xl lg:block">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden rounded-2xl shadow-soft">
              <BrandLogo className="h-full w-full" priority />
            </div>
            <div>
              <div className="font-display text-2xl font-semibold">GlobeLink</div>
              <div className="text-[10px] font-bold uppercase tracking-[.24em] text-muted-foreground">
                Voyager ensemble
              </div>
            </div>
          </Link>
          <div className="mt-12 eyebrow">Une communauté de voyageurs</div>
          <h1 className="mt-4 font-display text-6xl font-semibold leading-[1.02]">
            Les bons voyages commencent par les bonnes personnes.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Découvre des lieux utiles, échange avec de vrais voyageurs et organise tes projets dans
            un seul espace.
          </p>
          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            <Feature icon={MapPin} title="Découvrir" text="Adresses et conseils" />
            <Feature icon={MessageCircle} title="Échanger" text="Messages et communauté" />
            <Feature icon={ShieldCheck} title="Voyager serein" text="Comptes vérifiés par e-mail" />
          </div>
          <div className="mt-10 flex items-center gap-3 text-sm text-muted-foreground">
            <LockKeyhole className="h-4 w-4 text-emerald-600" /> Tes identifiants sont transmis via
            une connexion sécurisée.
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-4 flex items-center justify-center gap-2 lg:hidden">
            <div className="h-12 w-12 overflow-hidden rounded-2xl shadow-soft">
              <BrandLogo className="h-full w-full" priority />
            </div>
            <span className="font-display text-2xl font-semibold">GlobeLink</span>
          </Link>

          <div className="auth-card surface-card rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-7">
            <div>
              <div className="eyebrow">Espace membre</div>
              <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
                Bienvenue sur GlobeLink
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Connecte-toi ou crée ton profil de voyageur.
              </p>
            </div>

            {googleEnabled && (
              <>
                <Button
                  onClick={google}
                  disabled={!!busy}
                  variant="outline"
                  className="mt-5 h-12 w-full rounded-2xl border-border/80 bg-background/70 font-semibold hover:bg-card sm:mt-6"
                >
                  {busy === "google" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  {busy === "google" ? "Ouverture de Google…" : "Continuer avec Google"}
                </Button>
                <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground sm:my-5">
                  <div className="h-px flex-1 bg-border" /> ou par e-mail{" "}
                  <div className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            <Tabs defaultValue="signin" className={googleEnabled ? "w-full" : "mt-5 w-full"}>
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-2xl bg-secondary/70 p-1">
                <TabsTrigger value="signin" className="rounded-xl">
                  Connexion
                </TabsTrigger>
                <TabsTrigger value="signup" className="rounded-xl">
                  Inscription
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-4 sm:mt-5">
                <form onSubmit={signIn} className="space-y-3.5 sm:space-y-4">
                  <AuthField id="signin-email" label="Adresse e-mail">
                    <Input
                      id="signin-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="toi@email.com"
                    />
                  </AuthField>
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    show={showPassword}
                    setShow={setShowPassword}
                    autoComplete="current-password"
                  />
                  <div className="flex justify-end">
                    <Link
                      to="/forgot-password"
                      className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      Mot de passe oublié ?
                    </Link>
                  </div>
                  <Button
                    type="submit"
                    disabled={!!busy}
                    className="h-12 w-full rounded-2xl bg-primary text-primary-foreground shadow-soft"
                  >
                    {busy === "signin" && <Loader2 className="h-4 w-4 animate-spin" />}
                    {busy === "signin" ? "Connexion…" : "Se connecter"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-4 sm:mt-5">
                <form onSubmit={signUp} className="space-y-3.5 sm:space-y-4">
                  <AuthField
                    id="signup-username"
                    label="Pseudo"
                    hint="3 à 24 caractères, sans espace."
                  >
                    <Input
                      id="signup-username"
                      required
                      minLength={3}
                      maxLength={24}
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").slice(0, 24))}
                      placeholder="voyageur42"
                      autoComplete="username"
                    />
                  </AuthField>
                  <AuthField id="signup-email" label="Adresse e-mail">
                    <Input
                      id="signup-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="toi@email.com"
                    />
                  </AuthField>
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    show={showPassword}
                    setShow={setShowPassword}
                    autoComplete="new-password"
                  />
                  <AuthField id="password-confirm" label="Confirmer le mot de passe">
                    <Input
                      id="password-confirm"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={10}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      aria-invalid={!!confirmPassword && confirmPassword !== password}
                    />
                  </AuthField>
                  <PasswordStrength strength={strength} />
                  <Button
                    type="submit"
                    disabled={!!busy}
                    className="h-12 w-full rounded-2xl bg-primary text-primary-foreground shadow-soft"
                  >
                    {busy === "signup" && <Loader2 className="h-4 w-4 animate-spin" />}
                    {busy === "signup" ? "Création…" : "Créer mon compte"}
                  </Button>
                  <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                    Un code de vérification sera envoyé par e-mail. Le compte reste bloqué tant que
                    le code n'est pas validé.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </div>

          <Link
            to="/"
            className="mt-4 flex items-center justify-center text-sm font-medium text-muted-foreground hover:text-foreground sm:mt-6"
          >
            Découvrir le fil public →
          </Link>
        </section>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof MapPin;
  title: string;
  text: string;
}) {
  return (
    <div className="surface-subtle rounded-2xl p-4">
      <Icon className="h-5 w-5 text-accent" />
      <div className="mt-3 font-semibold">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{text}</div>
    </div>
  );
}

function AuthField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </Label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  show,
  setShow,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  setShow: (value: boolean) => void;
  autoComplete: string;
}) {
  const id = `password-${autoComplete}`;
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        Mot de passe
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          required
          minLength={10}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function PasswordStrength({ strength }: { strength: number }) {
  const labels = ["Très faible", "Correct", "Bon", "Fort"];
  return (
    <div>
      <div
        className="flex gap-1.5"
        aria-label={`Solidité du mot de passe : ${labels[Math.max(0, strength - 1)] ?? "non renseignée"}`}
      >
        {[1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className={`h-1.5 flex-1 rounded-full transition ${strength >= level ? (strength >= 4 ? "bg-emerald-500" : "bg-primary") : "bg-muted"}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> 10 caractères
        </span>
        <span>Lettre + chiffre</span>
        <span>Symbole conseillé</span>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.3 1.5 7.7 2.8l5.7-5.7C33.9 3.5 29.4 1.5 24 1.5 14.9 1.5 7.2 6.9 3.7 14.6l6.7 5.2C12 14 17.4 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-2.8-.4-4H24v7.6h12.7c-.3 2-1.8 5-5.1 7l7.8 6c4.7-4.3 7.1-10.7 7.1-16.6z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-6.7-5.2C2 17.5 1 20.6 1 24s1 6.5 2.7 9.8l6.7-5.2z"
      />
      <path
        fill="#34A853"
        d="M24 46.5c6.4 0 11.8-2.1 15.7-5.7l-7.8-6c-2.1 1.5-4.9 2.4-7.9 2.4-6.6 0-12-4.5-13.6-10.5l-6.7 5.2C7.2 41.1 14.9 46.5 24 46.5z"
      />
    </svg>
  );
}
