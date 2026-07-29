import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PRODUCT_TYPES, type ProductType } from "@/lib/mock-products";
import { toast } from "sonner";
import { ShoppingBag, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/marketplace/new")({
  head: () => ({ meta: [{ title: "Vendre un produit — GlobeLink" }] }),
  component: NewProductPage,
});

function NewProductPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [type, setType] = useState<ProductType>("guide_pdf");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("19");
  const [tags, setTags] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const onCover = (f: File | null) => {
    setCoverFile(f);
    setCoverPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Connexion requise");
      if (!title.trim()) throw new Error("Ajoute un titre");
      const priceCents = Math.max(0, Math.round(Number(price) * 100));

      let cover_url: string | null = null;
      if (coverFile) {
        const path = `${user.id}/products/${Date.now()}-${coverFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("media").upload(path, coverFile, { upsert: false });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("media").createSignedUrl
          ? await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 24 * 365)
          : { data: null } as any;
        cover_url = data?.signedUrl ?? null;
      }

      const { data: inserted, error } = await supabase.from("products").insert({
        seller_id: user.id, type, title: title.trim(),
        description: description.trim() || null, price_cents: priceCents,
        currency: "EUR", cover_url,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      }).select("id").single();
      if (error) throw error;
      return inserted.id as string;
    },
    onSuccess: (id) => {
      toast.success("Produit publié 🎉");
      navigate({ to: "/marketplace/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl gradient-hero text-primary-foreground shadow-soft">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl">Vendre un produit</h1>
            <p className="text-sm text-muted-foreground">Partage ton expérience avec la communauté.</p>
          </div>
        </header>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
          <div>
            <Label className="text-xs">Type</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {PRODUCT_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => setType(t.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${type === t.value ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Guide Bali secret" maxLength={120} required />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Ce que contient le produit, à qui il s'adresse…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prix (EUR)</Label>
              <Input type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <Label>Tags (séparés par virgule)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Bali, guide, plages" />
            </div>
          </div>

          <div>
            <Label>Image de couverture</Label>
            <label className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-6 text-center transition hover:bg-secondary/40">
              {coverPreview ? (
                <img src={coverPreview} alt="" className="max-h-52 rounded-xl object-cover" />
              ) : (
                <>
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">JPG ou PNG · 1200×900 recommandé</p>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onCover(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <Button type="submit" disabled={submit.isPending} className="w-full rounded-full gradient-hero text-primary-foreground shadow-soft">
            {submit.isPending ? "Publication…" : "Publier le produit"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Le paiement intégré arrive bientôt. Pour l'instant, contact et livraison se font en messagerie.
          </p>
        </form>
      </main>
    </div>
  );
}
