from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise RuntimeError(f"Missing patch target: {label}")
    return source.replace(old, new, 1)

path = Path("src/components/TripDaySectionPremium.tsx")
source = path.read_text()

source = replace_once(
    source,
    '''type ForecastBreakdownItem = {
  label: string;
  amount: number;
};''',
    '''type ForecastBreakdownItem = {
  label: string;
  amount: number;
  detail?: string;
};''',
    "forecast detail type",
)

source = replace_once(
    source,
    '''        .map((item: any) => ({
          label: normalizeBudgetCategory(String(item?.category ?? item?.label ?? "Autres")),
          amount: Math.max(0, Number(item?.amount || 0)),
        }))''',
    '''        .map((item: any) => ({
          label: normalizeBudgetCategory(String(item?.category ?? item?.label ?? "Autres")),
          amount: Math.max(0, Number(item?.amount || 0)),
          detail: String(item?.detail ?? "").trim() || undefined,
        }))''',
    "stored forecast detail mapping",
)

source = replace_once(
    source,
    '''                        <span className="min-w-0 flex-1 text-sm font-medium sm:text-base">
                          {item.label}
                        </span>
                        <span className="tabular-nums text-sm font-bold sm:text-base">
                          {item.amount.toFixed(2)} €
                        </span>''',
    '''                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold sm:text-base">{item.label}</p>
                          {item.detail && (
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {item.detail}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 tabular-nums text-sm font-bold sm:text-base">
                          {item.amount.toFixed(2)} €
                        </span>''',
    "forecast detail rendering",
)

path.write_text(source)
print("Detailed IA+ budget display patch applied.")
