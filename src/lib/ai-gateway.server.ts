import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Primary AI provider for GlobeLink.
 *
 * GEMINI_API_KEY is preferred because Google offers a developer free tier for
 * supported Gemini models. The API key is read server-side only and is never
 * exposed to the browser. A legacy gateway can remain configured as a fallback
 * during migration.
 */
export function createTravelAiProvider() {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const provider = createOpenAICompatible({
      name: "gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      headers: {
        Authorization: `Bearer ${geminiKey}`,
      },
    });
    return {
      provider,
      modelId: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      providerName: "Gemini",
    } as const;
  }

  const fallbackKey = process.env.LOVABLE_API_KEY?.trim();
  if (fallbackKey) {
    const provider = createOpenAICompatible({
      name: "travel-ai-fallback",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Lovable-API-Key": fallbackKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });
    return {
      provider,
      modelId: "google/gemini-3-flash-preview",
      providerName: "AI Gateway",
    } as const;
  }

  throw new Error("Le moteur IA n'est pas configuré. Ajoute GEMINI_API_KEY côté serveur.");
}

/** Kept for backward compatibility with existing imports. */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "travel-ai-fallback",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}
