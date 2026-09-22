import { Link } from "@tanstack/react-router";
import { MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { LocatedTraveler } from "@/lib/real-travelers";

export function TravelerSheet({
  traveler,
  onOpenChange,
}: {
  traveler: LocatedTraveler | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={!!traveler} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
        {traveler && (
          <div>
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-pink-500 to-purple-600">
              {traveler.avatar && (
                <img
                  src={traveler.avatar}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-40 blur-xl"
                />
              )}
              <div className="absolute inset-0 flex items-end p-5">
                <div className="flex items-end gap-4">
                  {traveler.avatar ? (
                    <img
                      src={traveler.avatar}
                      alt={traveler.name}
                      className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-elevated"
                    />
                  ) : (
                    <span className="grid h-24 w-24 place-items-center rounded-full border-4 border-white bg-primary text-3xl font-semibold text-primary-foreground shadow-elevated">
                      {(traveler.name || traveler.username).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="pb-1 text-white">
                    <div className="text-xs uppercase tracking-widest opacity-80">
                      {traveler.source === "trip" ? "Sur place actuellement" : "Localisé ici"}
                    </div>
                    <div className="font-display text-2xl">{traveler.name}</div>
                    <div className="mt-1 flex items-center gap-1 text-sm opacity-90">
                      <MapPin className="h-3.5 w-3.5" />{" "}
                      {[traveler.city, traveler.country].filter(Boolean).join(", ")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm">{traveler.bio}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Sur place</div>
                  <div className="text-sm font-semibold">
                    {traveler.starts_on && traveler.ends_on
                      ? `${traveler.starts_on} → ${traveler.ends_on}`
                      : "Voyageur basé ici"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Budget</div>
                  <div className="text-sm font-semibold">
                    {traveler.budget_eur ? `${traveler.budget_eur} €` : "Non renseigné"}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Langues
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {traveler.languages.map((language) => (
                    <Badge key={language} variant="secondary" className="rounded-full">
                      {language}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Centres d'intérêt
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {traveler.interests.map((interest) => (
                    <Badge key={interest} className="rounded-full">
                      {interest}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button asChild className="rounded-full gradient-hero text-primary-foreground">
                  <Link to="/profile/$username" params={{ username: traveler.username }}>
                    Voir le profil
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/match">
                    <Sparkles className="mr-1 h-4 w-4" /> Travel Match
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
