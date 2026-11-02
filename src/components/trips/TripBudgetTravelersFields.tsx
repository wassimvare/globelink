import { Input } from "@/components/ui/input";

type TripBudgetTravelersFieldsProps = {
  budget: string;
  travelers: string;
  onBudgetChange: (value: string) => void;
  onTravelersChange: (value: string) => void;
  budgetTestId?: string;
  travelersTestId?: string;
};

export function TripBudgetTravelersFields({
  budget,
  travelers,
  onBudgetChange,
  onTravelersChange,
  budgetTestId,
  travelersTestId,
}: TripBudgetTravelersFieldsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
        Budget total du groupe (€)
        <Input
          data-testid={budgetTestId}
          aria-label="Budget total du voyage"
          placeholder="Budget total (€)"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={budget}
          onChange={(event) => onBudgetChange(event.target.value)}
        />
      </label>
      <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
        Nombre de voyageurs
        <Input
          data-testid={travelersTestId}
          aria-label="Nombre de voyageurs"
          type="number"
          min="1"
          max="50"
          step="1"
          inputMode="numeric"
          value={travelers}
          onChange={(event) => onTravelersChange(event.target.value)}
        />
      </label>
    </div>
  );
}
