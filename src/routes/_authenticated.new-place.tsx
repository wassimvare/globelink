import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { geocodePlaceLocation } from "@/lib/place-geocoding.functions";
import { submitPlaceForReview } from "@/lib/place-moderation.functions";
import { uploadMedia } from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES, PLACE_CATEGORIES } from "@/lib/countries";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/new-place")({
  component: NewPlacePage,
});

function NewPlacePage() {
  const { user } = useAuth();
  const router = useRouter();
  const submitPlace = useServerFn(submitPlaceForReview);
  const geocodePlace = useServerFn(geocodePlaceLocation);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [lastGeocodeKey, setLastGeocodeKey] = useState("");
  const [manualCoordinates, setManualCoordinates] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  function clearCoordinates() {
    setLat("");
    setLng("");
    setLocationLabel("");
    setLastGeocodeKey("");
  }

  function resetAutoCoordinates() {
    if (manualCoordinates) return;
    clearCoordinates();
  }

  async function detectCityCoordinates(showSuccess = true) {
    const cityValue = city.trim();
    if (!country) throw new Error("Choisis d'abord le pays.");
    if (cityValue.length < 2) throw new Error("Entre une ville valide.");

    const key = `${cityValue.toLocaleLowerCase("fr-FR")}|${country.toLocaleLowerCase("fr-FR")}`;
    if (key === lastGeocodeKey && lat && lng) {
      return { lat: Number(lat), lng: Number(lng), label: locationLabel };
    }

    const result = await geocodePlace({ data: { city: cityValue, country } });
    setLat(String(result.lat));
    setLng(String(result.lng));
    setLocationLabel(result.label);
    setLastGeocodeKey(key);
    if (showSuccess) toast.success("Position détectée automatiquement");
    return result;
  }

  function useMyLocation() {
    if (!navigator.geolocation) return toast.error("Géolocalisation indisponible");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
        setLocationLabel("Position actuelle de ton appareil");
        setLastGeocodeKey("");
        setManualCoordinates(false);
        toast.success("Position récupérée");
      },
      () => toast.error("Impossible d'obtenir la position"),
    );
  }

  const geocode = useMutation({
    mutationFn: () => detectCityCoordinates(true),
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non connecté");
      if (!name || !category || !country || !city) throw new Error("Champs requis manquants");
      let finalLat = Number(lat);
      let finalLng = Number(lng);
      let finalLocationLabel = locationLabel || null;
      if (!manualCoordinates) {
        const detected = await detectCityCoordinates(false);
        finalLat = detected.lat;
        finalLng = detected.lng;
        finalLocationLabel = detected.label;
        setLocationLabel(detected.label);
      } else if (!Number.isFinite(finalLat) || !Number.isFinite(finalLng)) {
        throw new Error("Coordonnées manuelles invalides.");
      }
      let image_url: string | null = null;
      if (file) image_url = await uploadMedia(user.id, "places", file);
      const result = await submitPlace({
        data: {
          name,
          category,
          country,
          city: city || null,
          description: description || null,
          lat: finalLat,
          lng: finalLng,
          locationLabel: finalLocationLabel,
          imageUrl: image_url,
        },
      });
      return result;
    },
    onSuccess: (result) => {
      toast.success("Lieu envoyé en vérification. Il apparaîtra sur la carte après validation.");
      router.navigate({ to: "/place-status/$id", params: { id: result.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="font-display text-3xl">Ajouter un lieu</h1>
        <p className="mt-1 text-muted-foreground">
          Partage tes bonnes adresses avec la communauté. Elles passent par une vérification IA puis
          une validation admin avant d'apparaître sur la carte.
        </p>

        <div className="mt-6 space-y-5 rounded-3xl border border-border bg-card p-6 shadow-soft">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nom</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Rooftop Sakura"
              />
            </div>
            <div>
              <Label>Catégorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {PLACE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.emoji} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pays</Label>
              <Select
                value={country}
                onValueChange={(value) => {
                  setCountry(value);
                  if (!manualCoordinates) clearCoordinates();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Ville</Label>
              <Input
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  resetAutoCoordinates();
                }}
                placeholder="Ex. Tokyo"
              />
            </div>

            {manualCoordinates ? (
              <>
                <div>
                  <Label>Latitude</Label>
                  <Input
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="35.6812"
                  />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="139.7671"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setManualCoordinates(false);
                    clearCoordinates();
                  }}
                  className="col-span-2 rounded-xl"
                >
                  Revenir à la détection automatique par ville
                </Button>
              </>
            ) : (
              <div className="col-span-2 rounded-2xl border border-border bg-secondary/35 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Coordonnées automatiques</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {geocode.isPending
                        ? "Détection de la position…"
                        : lat && lng
                          ? `Position détectée : ${locationLabel || `${lat}, ${lng}`}`
                          : "Renseigne la ville et le pays : la position sera détectée au moment de l'envoi, ou avec le bouton Détecter."}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Géocodage fourni par OpenStreetMap/Nominatim avec fallback Open-Meteo.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => geocode.mutate()}
                      disabled={!city.trim() || !country || geocode.isPending}
                      className="rounded-xl"
                    >
                      {geocode.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MapPin className="h-4 w-4" />
                      )}
                      Détecter
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setManualCoordinates(true)}
                      className="rounded-xl"
                    >
                      Manuel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={useMyLocation}
              className="col-span-2 rounded-xl"
            >
              <MapPin className="h-4 w-4" /> Utiliser ma position
            </Button>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="col-span-2">
              <Label>Photo (optionnel)</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <Button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending || geocode.isPending}
            className="w-full rounded-xl gradient-hero text-primary-foreground shadow-soft"
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Envoyer en vérification"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
