import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, MapPin, Calendar, Wallet, Notebook } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { destinationCover } from "@/lib/destination-cover";

export const Route = createFileRoute("/_authenticated/trips/")({
  head: () => ({ meta: [{ title: "Mon carnet de voyage — GlobeLink" }] }),
  component: TripsPage,
});

function TripsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", country: "", city: "", budget: "", notes: "" });

  const { data: trips, isLoading } = useQuery({
    queryKey: ["trips", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("trips").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("trips").insert({
        user_id: user!.id,
        title: form.title || `${form.country} voyage`,
        country: form.country,
        city: form.city || null,
        budget: form.budget ? Number(form.budget) : null,
        notes: form.notes || null,
        cover_url: destinationCover(form.country, form.city),
        status: "planned",
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Voyage créé");
      setOpen(false);
      setForm({ title: "", country: "", city: "", budget: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  return (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              <Notebook className="h-3 w-3" /> Mon carnet
            </div>
            <h1 className="mt-2 font-display text-4xl">Mes voyages</h1>
            <p className="mt-1 text-muted-foreground">Tes carnets de route : cartes, photos, dépenses et souvenirs.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full gradient-hero text-primary-foreground shadow-soft">
                <Plus className="mr-2 h-4 w-4" /> Nouveau voyage
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nouveau voyage</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Titre (ex : Été indonésien)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <Input placeholder="Pays *" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                <Input placeholder="Ville / région" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <Input placeholder="Budget prévu (€)" type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
                <Textarea placeholder="Notes, plans, envies…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} />
              </div>
              <DialogFooter>
                <Button disabled={!form.country || create.isPending} onClick={() => create.mutate()} className="rounded-full gradient-hero text-primary-foreground">Créer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-8">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-56 rounded-3xl" />)}
            </div>
          ) : trips && trips.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {trips.map((t) => (
                <Link key={t.id} to="/trips/$id" params={{ id: t.id }} className="group animate-rise overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition hover:-translate-y-1 hover:shadow-elevated">
                  <div className="relative aspect-[4/3] bg-muted">
                    <img
                      src={t.cover_url || destinationCover(t.country, t.city)}
                      alt={`Couverture ${[t.city, t.country].filter(Boolean).join(", ") || t.title}`}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    />
                    <span className="absolute right-3 top-3 rounded-full bg-background/80 px-2 py-1 text-xs font-medium backdrop-blur">{t.status ?? "planned"}</span>
                  </div>
                  <div className="p-4">
                    <h3 className="truncate font-display text-lg">{t.title}</h3>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {[t.city, t.country].filter(Boolean).join(", ")}</p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                      {t.budget && <span className="flex items-center gap-1"><Wallet className="h-3 w-3" /> {t.budget}€</span>}
                      {t.starts_on && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {t.starts_on}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border p-12 text-center text-muted-foreground">
              <div className="mb-4 text-4xl">🧳</div>
              Ton carnet est vide. Crée ton premier voyage ou <Link to="/ai-trip" className="text-accent underline">génère-en un avec l'IA</Link>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
