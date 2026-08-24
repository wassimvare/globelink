import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PRODUCT_TYPES, formatPrice } from "@/lib/product-catalog";
import { Heart, Star, ArrowLeft, MessageCircle, Share2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/marketplace/$id")({
  head: () => ({ meta: [{ title: "Produit — Marketplace GlobeLink" }] }),
  component: ProductPage,
});

type Review = {
  id: string;
  user_id: string;
  rating: number;
  content: string | null;
  created_at: string;
  user?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

function ProductPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [myRating, setMyRating] = useState(5);
  const [myReview, setMyReview] = useState("");

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, seller:seller_id ( username, display_name, avatar_url )")
        .eq("id", id)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["product-reviews", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("*, user:user_id ( username, display_name, avatar_url )")
        .eq("product_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Review[];
    },
  });

  const { data: isFav = false } = useQuery({
    queryKey: ["product-fav", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_favorites")
        .select("id")
        .eq("product_id", id)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const requireAccount = () => {
    navigate({ to: "/auth", search: { redirect: `/marketplace/${id}` } as any });
  };

  const toggleFav = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("ACCOUNT_REQUIRED");
      const query = isFav
        ? supabase.from("product_favorites").delete().eq("product_id", id).eq("user_id", user.id)
        : supabase.from("product_favorites").insert({ product_id: id, user_id: user.id });
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-fav", id] });
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.invalidateQueries({ queryKey: ["marketplace-products"] });
    },
    onError: (e: Error) =>
      e.message === "ACCOUNT_REQUIRED" ? requireAccount() : toast.error(e.message),
  });

  const submitReview = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("ACCOUNT_REQUIRED");
      const { error } = await supabase.from("product_reviews").upsert(
        {
          product_id: id,
          user_id: user.id,
          rating: myRating,
          content: myReview.trim() || null,
        },
        { onConflict: "product_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Avis publié");
      setMyReview("");
      qc.invalidateQueries({ queryKey: ["product-reviews", id] });
      qc.invalidateQueries({ queryKey: ["product", id] });
    },
    onError: (e: Error) =>
      e.message === "ACCOUNT_REQUIRED" ? requireAccount() : toast.error(e.message),
  });

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title: product?.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copié");
      }
    } catch {
      /* partage annulé */
    }
  };

  if (isLoading)
    return (
      <div className="app-page">
        <AppHeader />
        <main className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-muted-foreground">
          Chargement…
        </main>
      </div>
    );

  if (!product) {
    return (
      <div className="app-page">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-muted-foreground">Produit introuvable.</p>
          <Button asChild className="mt-4">
            <Link to="/marketplace">Retour à la marketplace</Link>
          </Button>
        </main>
      </div>
    );
  }

  const seller = product.seller as {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  const sellerName = seller?.display_name ?? seller?.username ?? "Créateur";
  const typeMeta = PRODUCT_TYPES.find((t) => t.value === product.type);

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
        <Link
          to="/marketplace"
          className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Marketplace
        </Link>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-7">
          <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-secondary sm:rounded-3xl">
            {product.cover_url ? (
              <img
                src={product.cover_url}
                alt={product.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-6xl">
                {typeMeta?.emoji ?? "🧭"}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium">
                {typeMeta?.emoji} {typeMeta?.label}
              </span>
              <h1 className="mt-3 font-display text-2xl font-semibold leading-tight sm:text-3xl">
                {product.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-amber-500">
                  <Star className="h-4 w-4 fill-current" />{" "}
                  {Number(product.rating_avg ?? 0).toFixed(1)}
                </span>
                <span className="text-muted-foreground">({product.rating_count ?? 0} avis)</span>
                <span className="ml-auto text-xl font-bold sm:text-2xl">
                  {formatPrice(product.price_cents, product.currency)}
                </span>
              </div>
            </div>

            {seller?.username ? (
              <Link
                to="/profile/$username"
                params={{ username: seller.username }}
                className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card p-3"
              >
                {seller.avatar_url ? (
                  <img
                    src={seller.avatar_url}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary font-semibold">
                    {sellerName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{sellerName}</p>
                  <p className="text-xs text-muted-foreground">Créateur GlobeLink</p>
                </div>
              </Link>
            ) : null}

            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {product.description}
            </p>
            <div className="flex flex-wrap gap-1">
              {(product.tags ?? []).map((t: string) => (
                <Badge key={t} variant="secondary" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <Button
                className="rounded-full"
                onClick={() => (user ? navigate({ to: "/messages" }) : requireAccount())}
              >
                <MessageCircle className="mr-2 h-4 w-4" /> Contacter
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => toggleFav.mutate()}
                disabled={toggleFav.isPending}
                aria-label="Enregistrer"
              >
                <Heart className={`h-4 w-4 ${isFav ? "fill-red-500 text-red-500" : ""}`} />
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={share}
                aria-label="Partager"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold">Avis</h2>
          {user ? (
            <div className="mb-4 rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className="grid h-11 w-9 place-items-center"
                    onClick={() => setMyRating(n)}
                    aria-label={`${n} étoiles`}
                  >
                    <Star
                      className={`h-5 w-5 ${n <= myRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                    />
                  </button>
                ))}
              </div>
              <Textarea
                value={myReview}
                onChange={(e) => setMyReview(e.target.value)}
                placeholder="Partage ton retour…"
                rows={3}
                maxLength={1500}
              />
              <div className="mt-2 flex justify-end">
                <Button
                  onClick={() => submitReview.mutate()}
                  disabled={submitReview.isPending}
                  className="rounded-full"
                >
                  Publier mon avis
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={requireAccount}
              className="mb-4 w-full rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground hover:bg-secondary/40"
            >
              Crée un compte pour laisser un avis.
            </button>
          )}

          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun avis pour le moment.</p>
          ) : null}
          <ul className="space-y-3">
            {reviews.map((r) => {
              const name = r.user?.display_name ?? r.user?.username ?? "Voyageur";
              return (
                <li key={r.id} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex items-center gap-3">
                    {r.user?.avatar_url ? (
                      <img
                        src={r.user.avatar_url}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-xs font-bold">
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(r.created_at), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </p>
                    </div>
                    <div className="ml-auto flex">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`h-3.5 w-3.5 ${n <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                        />
                      ))}
                    </div>
                  </div>
                  {r.content ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm">{r.content}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
