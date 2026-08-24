import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const moderationSource = readFileSync(
  new URL("./place-moderation.functions.ts", import.meta.url),
  "utf8",
);
const userStatusRoute = readFileSync(
  new URL("../routes/_authenticated.place-status.$id.tsx", import.meta.url),
  "utf8",
);
const mapRoute = readFileSync(new URL("../routes/map.tsx", import.meta.url), "utf8");
const privacyMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260814120249_v10_8_private_place_ai_analysis.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("confidentialité de la modération IA des lieux", () => {
  it("ne renvoie aucun détail IA dans la page de statut utilisateur", () => {
    expect(userStatusRoute).not.toContain("moderation_ai_");
    expect(userStatusRoute).not.toContain("Résumé de vérification automatique");

    const safeSelect = moderationSource.match(
      /const PLACE_STATUS_SELECT\s*=\s*\n?\s*"([^"]+)"/,
    )?.[1];
    expect(safeSelect).toBeTruthy();
    expect(safeSelect).not.toContain("moderation_ai_");
    expect(moderationSource).not.toContain("storedAiReview");
  });

  it("protège aussi les colonnes IA et les événements Realtime dans Supabase", () => {
    expect(privacyMigration).toMatch(
      /revoke select on table public\.places from public, anon, authenticated/i,
    );
    expect(privacyMigration).toMatch(
      /grant select \([\s\S]*moderation_rejection_reason[\s\S]*\) on table public\.places to anon, authenticated/i,
    );
    const publicGrant = privacyMigration.match(
      /grant select \(([\s\S]*?)\) on table public\.places to anon, authenticated/i,
    )?.[1];
    expect(publicGrant).not.toContain("user_id");
    expect(privacyMigration).not.toMatch(/grant select \([\s\S]*moderation_ai_/i);
    expect(privacyMigration).toMatch(
      /alter publication supabase_realtime drop table public\.places/i,
    );
    expect(mapRoute).not.toContain('.select("*")');
  });

  it("demande à Gemini une recommandation de décision explicite", () => {
    expect(moderationSource).toContain('"recommendation":"approve|manual_review|reject"');
    expect(moderationSource).toContain("recommandation_accepter");
    expect(moderationSource).toContain("recommandation_verifier");
    expect(moderationSource).toContain("recommandation_refuser");
  });
});
