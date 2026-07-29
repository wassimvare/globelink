import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MOCK_PRODUCTS, PRODUCT_TYPES, formatPrice, type MockProduct, type ProductType } from "@/lib/mock-products";
import { Search, Star, Heart, Plus, ShoppingBag, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace créateurs — GlobeLink" },
      { name: "description", content: "Guides PDF, itinéraires, presets Lightroom, ebooks et accompagnements créés par les voyageurs de GlobeLink." },
    ],
  }),
  component: MarketplacePage,
});

type DbProduct = {
  id: string; seller_id: string; type: ProductType; title: string; description: string | null;
  price_cents: number; currency: string; cover_url: string | null; tags: string[];
  rating_avg: number; rating_count: number; favorites_count: number; created_at: string;
  seller?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

function MarketplacePage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [type, setType] = useState<ProductType | "all">("all");

  const { data: dbProducts = [] } = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, seller:seller_id ( username, display_name, avatar_url )")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as DbProduct[];
    },
  });

  const items = useMemo(() => {
    const real = dbProducts.map((p) => ({
      kind: "db" as const, id: p.id, type: p.type, title: p.title,
      description: p.description ?? "", price_cents: p.price_cents, currency: p.currency,
      cover_url: p.cover_url ?? "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=900",
      tags: p.tags, rating_avg: Number(p.rating_avg), rating_count: p.rating_count,
      favorites_count: p.favorites_count,
      seller: {
        name: p.seller?.display_name ?? p.seller?.username ?? "Créateur",
        username: p.seller?.username ?? "",
        avatar: p.seller?.avatar_url ?? "https://i.pravatar.cc/160?img=1",
      },
    }));
    const mocks: MockProduct[] = MOCK_PRODUCTS.map((p) => ({ ...p }));
    const combined = [...real, ...mocks.map((m) => ({ kind: "mock" as const, ...m }))];
    const ql = q.trim().toLowerCase();
    return combined.filter((p) => {
      if (type !== "all" && p.type !== type) return false;
      if (!ql) return true;
      return p.title.toLowerCase().includes(ql) || p.tags.some((t) => t.toLowerCase().includes(ql));
    });
  }, [dbProducts, q, type]);

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-xl gradient-hero text-primary-foreground shadow-soft">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <h1 className="font-display text-3xl font-semibold">Marketplace</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Guides, itinéraires, presets, ebooks et coaching par la communauté.
            </p>
          </div>
          {user && (
            <Button asChild className="rounded-full gradient-hero text-primary-foreground shadow-soft">
              <Link to="/marketplace/new"><Plus className="mr-1 h-4 w-4" /> Vendre un produit</Link>
            </Button>
          )}
        </header>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche par destination, tag, mot-clé…" className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setType("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${type === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
              Tout
            </button>
            {PRODUCT_TYPES.map((t) => (
              <button key={t.value} onClick={() => setType(t.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${type === t.value ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                <span className="mr-1">{t.emoji}</span>{t.label}
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-12 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-accent" />
            <p className="mt-2 text-sm text-muted-foreground">Aucun produit ne correspond à ta recherche.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => {
              const typeMeta = PRODUCT_TYPES.find((t) => t.value === p.type);
              const to = p.kind === "db" ? `/marketplace/${p.id}` : `/marketplace/${p.id}`;
              return (
                <Link key={p.id} to={to as any} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:shadow-glow">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img src={p.cover_url} alt={p.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                    <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
                      {typeMeta?.emoji} {typeMeta?.label}
                    </span>
                    <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs font-bold text-foreground shadow">
                      {formatPrice(p.price_cents, p.currency)}
                    </span>
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-2 font-semibold">{p.title}</h3>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <img src={p.seller.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                      <span className="truncate">{p.seller.name}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-amber-500"><Star className="h-3 w-3 fill-current" /> {p.rating_avg.toFixed(1)}</span>
                      <span className="text-muted-foreground">({p.rating_count})</span>
                      <span className="ml-auto flex items-center gap-1 text-muted-foreground"><Heart className="h-3 w-3" /> {p.favorites_count}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.tags.slice(0, 3).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
