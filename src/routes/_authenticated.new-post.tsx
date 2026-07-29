import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { uploadMedia } from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRIES } from "@/lib/countries";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/new-post")({
  component: NewPostPage,
});

function NewPostPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [country, setCountry] = useState<string>("");
  const [city, setCity] = useState("");

  function onFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  const publish = useMutation({
    mutationFn: async () => {
      if (!user || !file) throw new Error("Ajoute une photo");
      const path = await uploadMedia(user.id, "posts", file);
      const { error } = await supabase.from("posts").insert({
        user_id: user.id,
        image_url: path,
        caption: caption || null,
        country: country || null,
        city: city || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Publication ajoutée !");
      router.navigate({ to: "/" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="font-display text-3xl">Nouvelle publication</h1>
        <p className="mt-1 text-muted-foreground">Partage un moment de voyage avec la communauté.</p>

        <div className="mt-6 space-y-5 rounded-3xl border border-border bg-card p-6 shadow-soft">
          <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-secondary transition hover:bg-accent/10">
            {preview ? (
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="text-center text-muted-foreground">
                <ImagePlus className="mx-auto h-10 w-10" />
                <p className="mt-2 text-sm">Choisir une photo</p>
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </label>

          <div>
            <Label>Légende</Label>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Raconte ton voyage…" rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Pays</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ville</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex. Kyoto" />
            </div>
          </div>

          <Button onClick={() => publish.mutate()} disabled={publish.isPending || !file} className="w-full rounded-xl gradient-hero text-primary-foreground shadow-soft">
            {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publier"}
          </Button>
        </div>
      </div>
    </div>
  );
}
