import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MOCK_PRODUCTS, PRODUCT_TYPES, formatPrice, type MockProduct } from "@/lib/mock-products";
import { Heart, Star, ArrowLeft, ShoppingBag, MessageCircle, Share2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/marketplace/$id")({
  head: () => ({ meta: [{ title: "Produit — Marketplace GlobeLink" }] }),
  component: ProductPage,
});

type Review = { id: string; user_id: string; rating: number; content: string | null; created_at: string;
  user?: { username: string; display_name: string | null; avatar_url: string | null } | null };

function ProductPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isMock = id.startsWith("mp");
  const mock: MockProduct | undefined = useMemo(() => MOCK_PRODUCTS.find((m) => m.id === id), [id]);

  const { data: dbProduct } = useQuery({
    queryKey: ["product", id],
    enabled: !isMock,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("*, seller:seller_id ( username, display_name, avatar_url )")
        .eq("id", id).maybeSingle();
      return data;
    },
  });

  const p = !isMock && dbProduct
    ? {
        id: dbProduct.id, type: dbProduct.type, title: dbProduct.title,
        description: dbProduct.description ?? "", price_cents: dbProduct.price_cents,
        currency: dbProduct.currency,
        cover_url: dbProduct.cover_url ?? "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=1200",
        tags: dbProduct.tags as string[], rating_avg: Number(dbProduct.rating_avg),
        rating_count: dbProduct.rating_count, favorites_count: dbProduct.favorites_count,
        seller_id: dbProduct.seller_id as string,
        seller: {
          name: (dbProduct as any).seller?.display_name ?? (dbProduct as any).seller?.username ?? "Créateur",
          username: (dbProduct as any).seller?.username ?? "",
          avatar: (dbProduct as any).seller?.avatar_url ?? "https://i.pravatar.cc/160?img=1",
        },
      }
    : mock ? { ...mock, seller_id: null as string | null } : null;

  const typeMeta = p ? PRODUCT_TYPES.find((t) => t.value === p.type) : null;

  const { data: reviews = [] } = useQuery({
    queryKey: ["product-reviews", id],
    enabled: !isMock,
    queryFn: async () => {
      const { data } = await supabase.from("product_reviews")
        .select("*, user:user_id ( username, display_name, avatar_url )")
        .eq("product_id", id).order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as unknown as Review[];
    },
  });

  const { data: isFav } = useQuery({
    queryKey: ["product-fav", id, user?.id],
    enabled: !!user && !isMock,
    queryFn: async () => {
      const { data } = await supabase.from("product_favorites")
        .select("id").eq("product_id", id).eq("user_id", user!.id).maybeSingle();
      return !!data;
    },
  });

  const toggleFav = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Connecte-toi pour enregistrer.");
      if (isMock) throw new Error("Ce produit est un exemple.");
      if (isFav) {
        await supabase.from("product_favorites").delete().eq("product_id", id).eq("user_id", user.id);
      } else {
        await supabase.from("product_favorites").insert({ product_id: id, user_id: user.id });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-fav", id] });
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.invalidateQueries({ queryKey: ["marketplace-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [myRating, setMyRating] = useState(5);
  const [myReview, setMyReview] = useState("");
  const submitReview = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Connecte-toi pour laisser un avis.");
      if (isMock) throw new Error("Ce produit est un exemple.");
      const { error } = await supabase.from("product_reviews").upsert({
        product_id: id, user_id: user.id, rating: myRating, content: myReview.trim() || null,
      }, { onConflict: "product_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Avis publié ✨");
      setMyReview("");
      qc.invalidateQueries({ queryKey: ["product-reviews", id] });
      qc.invalidateQueries({ queryKey: ["product", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title: p?.title, url });
      else { await navigator.clipboard.writeText(url); toast.success("Lien copié"); }
    } catch { /* cancelled */ }
  };

  if (!p) {
    return (
      <div className="app-page">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-muted-foreground">Produit introuvable.</p>
          <Button asChild className="mt-4"><Link to="/marketplace">Retour à la marketplace</Link></Button>
        </main>
      </div>
    );
  }

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-4">
        <Link to="/marketplace" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Marketplace
        </Link>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="overflow-hidden rounded-3xl border border-border shadow-soft">
            <img src={p.cover_url} alt={p.title} className="h-full w-full object-cover" />
          </div>
          <div className="space-y-4">
            <div>
              <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-medium">
                {typeMeta?.emoji} {typeMeta?.label}
              </span>
              <h1 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">{p.title}</h1>
              <div className="mt-1 flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-amber-500"><Star className="h-4 w-4 fill-current" /> {p.rating_avg.toFixed(1)}</span>
                <span className="text-muted-foreground">({p.rating_count} avis)</span>
                <span className="ml-auto text-2xl font-bold">{formatPrice(p.price_cents, p.currency)}</span>
              </div>
            </div>

            <Link
              to={p.seller.username ? "/profile/$username" : "/marketplace"}
              params={p.seller.username ? { username: p.seller.username } : undefined as any}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
            >
              <img src={p.seller.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{p.seller.name}</p>
                <p className="text-xs text-muted-foreground">Créateur GlobeLink</p>
              </div>
            </Link>

            <p className="text-sm leading-relaxed text-foreground/90">{p.description}</p>

            <div className="flex flex-wrap gap-1">
              {p.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button className="flex-1 rounded-full gradient-hero text-primary-foreground shadow-soft"
                onClick={() => toast.message("Paiement bientôt disponible", { description: "Le paiement sera activé prochainement. Ton favori est enregistré." })}>
                <ShoppingBag className="mr-2 h-4 w-4" /> Acheter
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => toggleFav.mutate()} disabled={toggleFav.isPending}>
                <Heart className={`h-4 w-4 ${isFav ? "fill-red-500 text-red-500" : ""}`} />
              </Button>
              <Button variant="outline" className="rounded-full" onClick={share}>
                <Share2 className="h-4 w-4" />
              </Button>
              {user && p.seller_id && (
                <Button variant="outline" className="rounded-full" onClick={() => navigate({ to: "/messages" })}>
                  <MessageCircle className="mr-1 h-4 w-4" /> Contacter
                </Button>
              )}
            </div>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold">Avis</h2>

          {user && !isMock && (
            <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="mb-2 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setMyRating(n)} aria-label={`${n} étoiles`}>
                    <Star className={`h-5 w-5 ${n <= myRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                  </button>
                ))}
                <span className="ml-2 text-xs text-muted-foreground">{myRating}/5</span>
              </div>
              <Textarea value={myReview} onChange={(e) => setMyReview(e.target.value)} placeholder="Partage ton retour…" rows={3} />
              <div className="mt-2 flex justify-end">
                <Button onClick={() => submitReview.mutate()} disabled={submitReview.isPending} className="rounded-full">
                  Publier mon avis
                </Button>
              </div>
            </div>
          )}

          {isMock && (
            <p className="mb-4 rounded-2xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              Produit d'exemple : les avis et favoris seront actifs sur les produits publiés par la communauté.
            </p>
          )}

          {reviews.length === 0 && !isMock && (
            <p className="text-sm text-muted-foreground">Aucun avis pour le moment. Sois le premier.</p>
          )}

          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
                <div className="flex items-center gap-3">
                  {r.user?.avatar_url ? (
                    <img src={r.user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : <div className="h-8 w-8 rounded-full bg-secondary" />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{r.user?.display_name ?? r.user?.username ?? "Voyageur"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: fr })}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-4 w-4 ${n <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                    ))}
                  </div>
                </div>
                {r.content && <p className="mt-2 text-sm">{r.content}</p>}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
