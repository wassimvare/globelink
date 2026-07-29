import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { uploadMedia } from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRIES, PLACE_CATEGORIES } from "@/lib/countries";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/new-place")({
  component: NewPlacePage,
});

function NewPlacePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) return toast.error("Géolocalisation indisponible");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(String(pos.coords.latitude)); setLng(String(pos.coords.longitude)); toast.success("Position récupérée"); },
      () => toast.error("Impossible d'obtenir la position"),
    );
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non connecté");
      if (!name || !category || !country || !lat || !lng) throw new Error("Champs requis manquants");
      let image_url: string | null = null;
      if (file) image_url = await uploadMedia(user.id, "places", file);
      const { error } = await supabase.from("places").insert({
        user_id: user.id,
        name, category, country,
        city: city || null,
        description: description || null,
        lat: Number(lat), lng: Number(lng),
        image_url,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lieu ajouté !"); router.navigate({ to: "/map" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="font-display text-3xl">Ajouter un lieu</h1>
        <p className="mt-1 text-muted-foreground">Partage tes bonnes adresses avec la communauté.</p>

        <div className="mt-6 space-y-5 rounded-3xl border border-border bg-card p-6 shadow-soft">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nom</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Rooftop Sakura" />
            </div>
            <div>
              <Label>Catégorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                <SelectContent>
                  {PLACE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pays</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Ville</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex. Tokyo" />
            </div>
            <div>
              <Label>Latitude</Label>
              <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="35.6812" />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="139.7671" />
            </div>
            <Button type="button" variant="outline" onClick={useMyLocation} className="col-span-2 rounded-xl">
              <MapPin className="h-4 w-4" /> Utiliser ma position
            </Button>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="col-span-2">
              <Label>Photo (optionnel)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>

          <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full rounded-xl gradient-hero text-primary-foreground shadow-soft">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ajouter le lieu"}
          </Button>
        </div>
      </div>
    </div>
  );
}
