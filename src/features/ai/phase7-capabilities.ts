export type AiTier = "free" | "plus";

export const FREE_AI_CAPABILITIES = [
  "quick_advice",
  "destination_inspiration",
  "sample_day",
  "general_budget_guidance",
] as const;

export const PLUS_AI_CAPABILITIES = [
  "connected_trip_context",
  "live_research",
  "real_option_comparison",
  "full_daily_itinerary",
  "budget_optimization",
  "journal_apply",
] as const;

export type PremiumIntentReason =
  | "connected_journal"
  | "real_comparison"
  | "live_data"
  | "full_itinerary"
  | "apply_changes";

export type PremiumIntent = {
  recommended: boolean;
  reasons: PremiumIntentReason[];
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function detectPremiumIntent(query: string): PremiumIntent {
  const text = normalize(query);
  const reasons = new Set<PremiumIntentReason>();

  if (/\b(mon|mes|le|ce)\s+(carnet|voyage|itineraire)\b/.test(text) && /(analyse|lis|utilise|modifie|change|reorganise|optimise)/.test(text)) {
    reasons.add("connected_journal");
  }
  if (/(compare|comparaison|meilleur hotel|meilleur restaurant|quelle option|prix entre)/.test(text)) {
    reasons.add("real_comparison");
  }
  if (/(disponibilite|disponible aujourd|prix actuel|horaire actuel|meteo actuelle|en temps reel|source recente)/.test(text)) {
    reasons.add("live_data");
  }
  if (/(itineraire complet|programme complet|jour par jour|chaque jour|planifie mon voyage|organise mon voyage)/.test(text)) {
    reasons.add("full_itinerary");
  }
  if (/(ajoute|applique|enregistre|mets).*(carnet|voyage|journee)|modifie.*(jour|carnet|voyage)/.test(text)) {
    reasons.add("apply_changes");
  }

  return { recommended: reasons.size > 0, reasons: Array.from(reasons) };
}

export function premiumIntentLabel(reason: PremiumIntentReason) {
  const labels: Record<PremiumIntentReason, string> = {
    connected_journal: "utiliser ton carnet connecté",
    real_comparison: "comparer de vraies options",
    live_data: "vérifier des données récentes",
    full_itinerary: "construire un voyage complet jour par jour",
    apply_changes: "appliquer des changements dans ton voyage",
  };
  return labels[reason];
}
