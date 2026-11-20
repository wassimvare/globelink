import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TripBudgetTravelersFields } from "@/components/trips/TripBudgetTravelersFields";
import type { TripFormState } from "@/features/travel/trip-domain";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: TripFormState;
  setForm: (form: TripFormState) => void;
  isCreating: boolean;
  onCreate: () => void;
};

export function CreateTripDialog({
  open,
  onOpenChange,
  form,
  setForm,
  isCreating,
  onCreate,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="h-12 rounded-2xl px-5 shadow-soft">
          <Plus className="mr-2 h-4 w-4" /> Nouveau voyage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer un voyage</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            data-testid="trip-create-title"
            aria-label="Titre du voyage"
            placeholder="Titre (ex : Été indonésien)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              data-testid="trip-create-country"
              aria-label="Pays du voyage"
              placeholder="Pays *"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
            <Input
              data-testid="trip-create-city"
              aria-label="Ville du voyage"
              placeholder="Ville / région"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Départ
              <Input
                data-testid="trip-create-start"
                aria-label="Date de départ"
                type="date"
                value={form.startsOn}
                onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Retour
              <Input
                data-testid="trip-create-end"
                aria-label="Date de retour"
                type="date"
                min={form.startsOn || undefined}
                value={form.endsOn}
                onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
              />
            </label>
          </div>
          <TripBudgetTravelersFields
            budget={form.budget}
            travelers={form.travelers}
            onBudgetChange={(budget) => setForm({ ...form, budget })}
            onTravelersChange={(travelers) => setForm({ ...form, travelers })}
            budgetTestId="trip-create-budget"
            travelersTestId="trip-create-travelers"
          />
          <Textarea
            aria-label="Notes du voyage"
            placeholder="Notes, plans, envies…"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button
            data-testid="trip-create-submit"
            disabled={!form.country.trim() || isCreating}
            onClick={onCreate}
            className="rounded-full"
          >
            {isCreating ? "Création…" : "Créer mon voyage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
