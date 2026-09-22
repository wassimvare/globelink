export type CatalogMediaFallbackKind = "activity" | "restaurant" | "hotel" | "deal";

export function shouldTryOpenKnowledgeFallback(input: {
  kind: CatalogMediaFallbackKind;
  skipOpenKnowledge?: boolean;
}) {
  return input.skipOpenKnowledge !== true && input.kind !== "deal";
}
