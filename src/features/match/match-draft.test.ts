import { describe, expect, it } from "vitest";
import {
  conversationDraftKey,
  matchIntentDraftKey,
  resolvePreparedMatchMessage,
} from "./match-draft";

describe("Travel Match prepared message", () => {
  it("garde des clés stables pour le profil et la conversation", () => {
    expect(matchIntentDraftKey("user-123")).toBe("globelink:match-intent:user-123");
    expect(conversationDraftKey("conv-456")).toBe("globelink:conversation-draft:conv-456");
  });

  it("préfère le brouillon explicite de la route", () => {
    expect(
      resolvePreparedMatchMessage({
        routeDraft: "Invitation depuis le match",
        conversationDraft: "Brouillon conversation",
        pendingIntentDraft: "Ancienne intention",
      }),
    ).toEqual({ text: "Invitation depuis le match", source: "route" });
  });

  it("restaure le brouillon de conversation avant l’intention en attente", () => {
    expect(
      resolvePreparedMatchMessage({
        conversationDraft: "Brouillon édité",
        pendingIntentDraft: "Invitation initiale",
      }),
    ).toEqual({ text: "Brouillon édité", source: "conversation" });
  });

  it("utilise l’intention en attente sans l’envoyer automatiquement", () => {
    expect(
      resolvePreparedMatchMessage({
        pendingIntentDraft: "Salut, on prend un café ?",
      }),
    ).toEqual({ text: "Salut, on prend un café ?", source: "intent" });
  });
});
