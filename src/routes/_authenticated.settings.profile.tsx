import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getSignedMediaUrl, uploadMedia } from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { Camera, ImagePlus, Loader2, Save, UserRound } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  head: () => ({
    meta: [
      { title: "Votre compte — GlobeLink" },
      {
        name: "description",
        content: "Modifie ton profil et tes informations personnelles GlobeLink.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EditProfilePage,
});

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "3 caractères minimum")
    .max(30, "30 caractères maximum")
    .regex(/^[a-z0-9_.]+$/, "Lettres minuscules, chiffres, _ et . uniquement"),
  display_name: z.string().trim().max(60, "60 caractères maximum").optional().or(z.literal("")),
  bio: z.string().trim().max(500, "500 caractères maximum").optional().or(z.literal("")),
  country: z.string().trim().max(60).optional().or(z.literal("")),
  city: z.string().trim().max(60).optional().or(z.literal("")),
  birth_date: z.string().optional().or(z.literal("")),
  travel_style: z.string().trim().max(60).optional().or(z.literal("")),
  website_url: z.string().trim().max(200).url("URL invalide").optional().or(z.literal("")),
  instagram: z.string().trim().max(40).optional().or(z.literal("")),
  tiktok: z.string().trim().max(40).optional().or(z.literal("")),
  youtube: z.string().trim().max(60).optional().or(z.literal("")),
  x_handle: z.string().trim().max(40).optional().or(z.literal("")),
});

const clean = (v: string) => v.trim().replace(/^@/, "");
const toList = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

const ALLOWED_PROFILE_IMAGES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Les photos iPhone HEIC/HEIF ne sont pas acceptées par le bucket Storage. */
async function prepareProfileImage(file: File): Promise<File> {
  if (ALLOWED_PROFILE_IMAGES.has(file.type)) return file;
  const isHeic = /\.(heic|heif)$/i.test(file.name) ||
    file.type === "image/heic" || file.type === "image/heif";
  if (!isHeic) {
    throw new Error("Format non pris en charge. Choisis une photo JPG, PNG, WebP ou GIF.");
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("Photo illisible.");
    }
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Conversion de la photo indisponible.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Conversion de la photo impossible.")),
        "image/jpeg",
        0.85,
      );
    });
    return new File([blob], "photo-profil.jpg", { type: "image/jpeg" });
  } catch {
    throw new Error("Impossible de lire cette photo HEIC. Exporte-la en JPG puis réessaie.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function EditProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    username: "",
    display_name: "",
    bio: "",
    country: "",
    city: "",
    birth_date: "",
    travel_style: "",
    website_url: "",
    instagram: "",
    tiktok: "",
    youtube: "",
    x_handle: "",
    languages: "",
    interests: "",
    visited_countries: "",
  });
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [bannerPath, setBannerPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!profile) return;
    setForm({
      username: profile.username ?? "",
      display_name: profile.display_name ?? "",
      bio: profile.bio ?? "",
      country: profile.country ?? "",
      city: profile.city ?? "",
      birth_date: profile.birth_date ?? "",
      travel_style: profile.travel_style ?? "",
      website_url: profile.website_url ?? "",
      instagram: profile.instagram ?? "",
      tiktok: profile.tiktok ?? "",
      youtube: profile.youtube ?? "",
      x_handle: profile.x_handle ?? "",
      languages: (profile.languages ?? []).join(", "),
      interests: (profile.interests ?? []).join(", "),
      visited_countries: (profile.visited_countries ?? []).join(", "),
    });
    setAvatarPath(profile.avatar_url ?? null);
    setBannerPath(profile.banner_url ?? null);
  }, [profile]);

  useEffect(() => {
    let active = true;
    getSignedMediaUrl(avatarPath).then((url) => {
      if (active) setAvatarUrl(url);
    });
    return () => { active = false; };
  }, [avatarPath]);
  useEffect(() => {
    let active = true;
    getSignedMediaUrl(bannerPath).then((url) => {
      if (active) setBannerUrl(url);
    });
    return () => { active = false; };
  }, [bannerPath]);

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickImage = async (kind: "avatar" | "banner", file: File | undefined) => {
    if (!file || !user || uploading || saving) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image trop lourde (8 Mo max)");
      return;
    }
    setUploading(kind);
    let uploadedPath: string | null = null;
    try {
      const prepared = await prepareProfileImage(file);
      uploadedPath = await uploadMedia(user.id, kind === "avatar" ? "avatars" : "banners", prepared);
      // Enregistrer la photo directement : les autres champs du formulaire ne doivent
      // pas empêcher la mise à jour de l'avatar ou de la bannière.
      const { data: updated, error } = await supabase
        .from("profiles")
        .update(kind === "avatar" ? { avatar_url: uploadedPath } : { banner_url: uploadedPath })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error("Profil introuvable ou modification non autorisée.");

      if (kind === "avatar") setAvatarPath(uploadedPath);
      else setBannerPath(uploadedPath);
      // Ne pas recharger les autres champs pendant une modification en cours.
      void qc.invalidateQueries({ queryKey: ["my-profile", user.id], refetchType: "none" });
      void qc.invalidateQueries({ queryKey: ["profile", user.id] });
      void qc.invalidateQueries({ queryKey: ["profile-nav", user.id] });
      if (profile?.username) {
        void qc.invalidateQueries({ queryKey: ["profile-page", profile.username] });
      }
      toast.success(kind === "avatar" ? "Photo de profil enregistrée" : "Bannière enregistrée");
    } catch (error) {
      // Ne pas laisser de média orphelin si le profil ne peut pas être mis à jour.
      if (uploadedPath) {
        void supabase.storage.from("media").remove([uploadedPath]);
      }
      toast.error(error instanceof Error ? error.message : "Impossible de modifier la photo.");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!user || uploading) return;
    const parsed = schema.safeParse({
      username: form.username.trim().toLowerCase(),
      display_name: form.display_name,
      bio: form.bio,
      country: form.country,
      city: form.city,
      birth_date: form.birth_date,
      travel_style: form.travel_style,
      website_url: form.website_url,
      instagram: clean(form.instagram),
      tiktok: clean(form.tiktok),
      youtube: clean(form.youtube),
      x_handle: clean(form.x_handle),
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
      setErrors(errs);
      toast.error("Vérifie les champs en rouge");
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const v = parsed.data;
      const { error } = await supabase
        .from("profiles")
        .update({
          username: v.username,
          display_name: v.display_name || null,
          bio: v.bio || null,
          country: v.country || null,
          city: v.city || null,
          birth_date: v.birth_date || null,
          travel_style: v.travel_style || null,
          website_url: v.website_url || null,
          instagram: v.instagram || null,
          tiktok: v.tiktok || null,
          youtube: v.youtube || null,
          x_handle: v.x_handle || null,
          avatar_url: avatarPath,
          banner_url: bannerPath,
          languages: toList(form.languages),
          interests: toList(form.interests),
          visited_countries: toList(form.visited_countries),
        })
        .eq("id", user.id);
      if (error) {
        if (error.code === "23505") {
          setErrors({ username: "Ce pseudo est déjà pris" });
          toast.error("Ce pseudo est déjà pris");
          return;
        }
        throw error;
      }
      qc.invalidateQueries({ queryKey: ["my-profile", user.id] });
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
      qc.invalidateQueries({ queryKey: ["profile-nav", user.id] });
      qc.invalidateQueries({ queryKey: ["profile-page", v.username] });
      toast.success("Profil mis à jour");
      navigate({ to: "/profile/$username", params: { username: v.username } });
    } catch (e) {
      toast.error((e as Error).message || "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="app-page">
        <AppHeader />
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">
          Chargement…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-7 sm:py-9">
        <section id="profile-editor" className="mt-6 scroll-mt-24">
          <div className="mb-4 flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-2xl">Votre compte</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Modifiez votre photo, votre identité, vos informations de voyage et vos réseaux.
              </p>
            </div>
          </div>

          <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
            <div className="relative h-36 bg-gradient-to-br from-primary via-primary/80 to-accent">
              {bannerUrl && <img src={bannerUrl} alt="" className="h-full w-full object-cover" />}
              <label
                htmlFor="profile-banner-upload"
                className={`absolute right-3 top-3 inline-flex cursor-pointer items-center gap-2 rounded-full bg-background/85 px-3 py-1.5 text-xs font-medium shadow-soft backdrop-blur ${uploading || saving ? "pointer-events-none opacity-60" : ""}`}
              >
                {uploading === "banner" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" />
                )}{" "}
                Bannière
              </label>
              <input
                id="profile-banner-upload"
                type="file"
                accept="image/*,.heic,.heif"
                className="sr-only"
                disabled={!!uploading || saving}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  void pickImage("banner", file);
                }}
              />
            </div>
            <div className="flex items-end gap-4 px-6 pb-6">
              <div className="relative -mt-12">
                <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-secondary text-3xl ring-4 ring-card">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (form.username[0]?.toUpperCase() ?? "?")
                  )}
                </div>
                <label
                  htmlFor="profile-avatar-upload"
                  aria-label="Changer la photo de profil"
                  className={`absolute -bottom-1 -right-1 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-elevated ${uploading || saving ? "pointer-events-none opacity-60" : ""}`}
                >
                  {uploading === "avatar" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </label>
                <input
                  id="profile-avatar-upload"
                  type="file"
                  accept="image/*,.heic,.heif"
                  className="sr-only"
                  disabled={!!uploading || saving}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    void pickImage("avatar", file);
                  }}
                />
              </div>
              <p className="pb-2 text-sm text-muted-foreground">JPG, PNG, WebP, GIF ou HEIC, 8 Mo max.</p>
            </div>
          </section>

          <div className="mt-6 space-y-6">
            <Block title="Identité">
              <Field label="Nom d'utilisateur" error={errors.username}>
                <Input
                  value={form.username}
                  onChange={set("username")}
                  placeholder="globetrotteur"
                  maxLength={30}
                />
              </Field>
              <Field label="Nom affiché" error={errors.display_name}>
                <Input
                  value={form.display_name}
                  onChange={set("display_name")}
                  placeholder="Camille Martin"
                  maxLength={60}
                />
              </Field>
              <Field label="Biographie" error={errors.bio}>
                <Textarea
                  value={form.bio}
                  onChange={set("bio")}
                  rows={4}
                  maxLength={500}
                  placeholder="Raconte ton style de voyage en quelques lignes…"
                />
                <span className="mt-1 block text-right text-xs text-muted-foreground">
                  {form.bio.length}/500
                </span>
              </Field>
            </Block>

            <Block title="Informations personnelles">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pays" error={errors.country}>
                  <Input value={form.country} onChange={set("country")} placeholder="France" />
                </Field>
                <Field label="Ville" error={errors.city}>
                  <Input value={form.city} onChange={set("city")} placeholder="Lyon" />
                </Field>
                <Field label="Date de naissance" error={errors.birth_date}>
                  <Input type="date" value={form.birth_date} onChange={set("birth_date")} />
                </Field>
                <Field label="Style de voyage" error={errors.travel_style}>
                  <Input
                    value={form.travel_style}
                    onChange={set("travel_style")}
                    placeholder="Backpack, slow travel…"
                  />
                </Field>
              </div>
              <Field label="Langues parlées (séparées par des virgules)">
                <Input
                  value={form.languages}
                  onChange={set("languages")}
                  placeholder="Français, Anglais, Espagnol"
                />
              </Field>
              <Field label="Centres d'intérêt (séparés par des virgules)">
                <Input
                  value={form.interests}
                  onChange={set("interests")}
                  placeholder="Randonnée, Street food, Photo"
                />
              </Field>
              <Field label="Pays visités (séparés par des virgules)">
                <Input
                  value={form.visited_countries}
                  onChange={set("visited_countries")}
                  placeholder="Japon, Pérou, Islande"
                />
              </Field>
            </Block>

            <Block title="Réseaux sociaux">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Site web" error={errors.website_url}>
                  <Input
                    value={form.website_url}
                    onChange={set("website_url")}
                    placeholder="https://monblog.com"
                  />
                </Field>
                <Field label="Instagram" error={errors.instagram}>
                  <Input value={form.instagram} onChange={set("instagram")} placeholder="@pseudo" />
                </Field>
                <Field label="TikTok" error={errors.tiktok}>
                  <Input value={form.tiktok} onChange={set("tiktok")} placeholder="@pseudo" />
                </Field>
                <Field label="YouTube" error={errors.youtube}>
                  <Input value={form.youtube} onChange={set("youtube")} placeholder="@chaine" />
                </Field>
                <Field label="X (Twitter)" error={errors.x_handle}>
                  <Input value={form.x_handle} onChange={set("x_handle")} placeholder="@pseudo" />
                </Field>
              </div>
            </Block>
          </div>

          <div className="sticky bottom-4 mt-8 flex gap-3">
            <Button
              onClick={save}
              disabled={saving || !!uploading}
              size="lg"
              className="flex-1 gap-2 shadow-elevated"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{" "}
              Enregistrer les modifications
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
      <h3 className="font-display text-lg">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}