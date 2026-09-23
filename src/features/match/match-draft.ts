export function matchIntentDraftKey(targetUserId: string) {
  return `globelink:match-intent:${targetUserId}`;
}

export function conversationDraftKey(conversationId: string) {
  return `globelink:conversation-draft:${conversationId}`;
}

export function resolvePreparedMatchMessage(input: {
  routeDraft?: string | null;
  conversationDraft?: string | null;
  pendingIntentDraft?: string | null;
}) {
  const routeDraft = input.routeDraft?.trim();
  if (routeDraft) return { text: routeDraft, source: "route" as const };

  const conversationDraft = input.conversationDraft?.trim();
  if (conversationDraft) return { text: conversationDraft, source: "conversation" as const };

  const pendingIntentDraft = input.pendingIntentDraft?.trim();
  if (pendingIntentDraft) return { text: pendingIntentDraft, source: "intent" as const };

  return { text: "", source: null };
}
