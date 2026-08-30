import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

export type TravelAiConfigurationStatus =
  | { configured: true; providerName: "Gemini" | "AI Gateway"; modelId: string }
  | { configured: false; reason: string };

const GEMINI_PRIMARY_TIMEOUT_MS = 28_000;
const GEMINI_FAST_FALLBACK_TIMEOUT_MS = 16_000;
const AI_GATEWAY_TIMEOUT_MS = 10_000;
const GEMINI_MAX_OUTPUT_TOKENS = 4_096;
const RETRYABLE_GEMINI_STATUSES = new Set([400, 404, 408, 429, 500, 502, 503, 504]);
const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash";
const DEFAULT_GEMINI_FAST_FALLBACK_MODEL = "gemini-3.5-flash-lite";

function cleanServerSecret(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getGeminiKey() {
  return cleanServerSecret(process.env.GEMINI_API_KEY);
}

function getLovableKey() {
  return cleanServerSecret(process.env.LOVABLE_API_KEY);
}

function looksLikeApiKey(value: string) {
  return value.length >= 20 && !/[\s"']/.test(value);
}

function normalizeModelId(value: string | undefined) {
  return String(value ?? "").trim().replace(/^models\//, "");
}

function getGeminiModelId() {
  const configured = normalizeModelId(process.env.GEMINI_MODEL);
  // Gemini 3.7 Flash is Google's current production migration target for 3.6 Flash.
  // Keep existing custom model choices, but transparently move the old GlobeLink default.
  if (!configured || configured === "gemini-3.6-flash") return DEFAULT_GEMINI_MODEL;
  return configured;
}

function getGeminiFastFallbackModelId(primaryModelId: string) {
  const configured = normalizeModelId(process.env.GEMINI_FALLBACK_MODEL);
  if (configured && configured !== primaryModelId) return configured;
  if (primaryModelId !== DEFAULT_GEMINI_FAST_FALLBACK_MODEL) {
    return DEFAULT_GEMINI_FAST_FALLBACK_MODEL;
  }
  return "gemini-2.5-flash-lite";
}

function redactSecret(value: string, secret: string) {
  return secret ? value.replaceAll(secret, "[clé masquée]") : value;
}

function extractGeminiErrorMessage(payload: unknown) {
  const data = payload as { error?: { message?: unknown; status?: unknown; code?: unknown } };
  const message = typeof data?.error?.message === "string" ? data.error.message : "";
  const status = typeof data?.error?.status === "string" ? data.error.status : "";
  const code = data?.error?.code != null ? String(data.error.code) : "";
  return [code, status, message].filter(Boolean).join(" ");
}

function extractGeminiText(payload: unknown) {
  const data = payload as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: unknown; thought?: unknown }> };
      finishReason?: unknown;
    }>;
    promptFeedback?: { blockReason?: unknown };
    usageMetadata?: {
      candidatesTokenCount?: unknown;
      thoughtsTokenCount?: unknown;
      totalTokenCount?: unknown;
    };
  };
  const text =
    data.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .filter((part) => part.thought !== true)
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim() ?? "";
  if (text) return text;

  const finishReason = data.candidates?.[0]?.finishReason;
  const blockReason = data.promptFeedback?.blockReason;
  const usage = data.usageMetadata;
  const tokenDetails = [
    usage?.candidatesTokenCount != null ? `sortie=${String(usage.candidatesTokenCount)}` : "",
    usage?.thoughtsTokenCount != null ? `réflexion=${String(usage.thoughtsTokenCount)}` : "",
    usage?.totalTokenCount != null ? `total=${String(usage.totalTokenCount)}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const reason = [finishReason, blockReason, tokenDetails].filter(Boolean).join(" / ");
  throw new Error(
    reason
      ? `Gemini API: réponse sans texte (${reason}).`
      : "Gemini API: réponse sans texte exploitable.",
  );
}

function isTransientNetworkError(error: unknown) {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  const value = `${error.name} ${error.message}`.toLowerCase();
  return ["econnreset", "etimedout", "fetch failed", "network", "socket", "abort"].some(
    (token) => value.includes(token),
  );
}

function geminiStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : null;
}

function shouldTryFastFallback(error: unknown) {
  const status = geminiStatus(error);
  return (
    (status != null && RETRYABLE_GEMINI_STATUSES.has(status)) ||
    isTransientNetworkError(error) ||
    /délai|timeout|abort|réponse sans texte/i.test(error instanceof Error ? error.message : String(error ?? ""))
  );
}

function friendlyGeminiFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/429|resource_exhausted|rate.?limit/i.test(message)) {
    return new Error(
      "IA+ est temporairement très sollicitée. Le moteur de secours a aussi été essayé automatiquement ; réessaie dans quelques instants.",
    );
  }
  if (/délai|timeout|abort/i.test(message)) {
    return new Error(
      "L’analyse IA+ a dépassé le délai prévu malgré le moteur de secours. Réessaie dans un instant.",
    );
  }
  if (/401|403|permission|unauthenticated/i.test(message)) {
    return new Error("Le moteur IA+ est momentanément indisponible. Réessaie un peu plus tard.");
  }
  if (/400|404|invalid_argument|not_found/i.test(message)) {
    return new Error(
      "Le moteur IA+ n’a pas pu traiter cette demande avec sa configuration actuelle. Un moteur de secours a été essayé automatiquement.",
    );
  }
  return error instanceof Error ? error : new Error("IA+ n'a pas pu répondre pour le moment.");
}

type GenerateOptions = {
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
};

function generationConfigForModel(modelName: string, options: GenerateOptions) {
  const isGemini3 = /^gemini-3(?:[.-]|$)/i.test(modelName);
  const requestedThinking = options.thinkingLevel ?? "low";
  // Gemini 3.7 does not accept `minimal`; low is the latency-oriented supported level.
  const thinkingLevel = /^gemini-3\.7(?:[.-]|$)/i.test(modelName) && requestedThinking === "minimal"
    ? "low"
    : requestedThinking;

  return {
    maxOutputTokens: Math.min(options.maxOutputTokens ?? 2_048, GEMINI_MAX_OUTPUT_TOKENS),
    ...(isGemini3
      ? {
          thinkingConfig: {
            thinkingLevel,
          },
        }
      : { temperature: options.temperature ?? 0.3 }),
  };
}

async function generateWithGeminiModel(args: {
  geminiKey: string;
  modelId: string;
  timeoutMs: number;
  options: GenerateOptions;
}) {
  const modelName = normalizeModelId(args.modelId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": args.geminiKey,
        },
        body: JSON.stringify({
          ...(args.options.system
            ? { system_instruction: { parts: [{ text: args.options.system }] } }
            : {}),
          contents: [{ role: "user", parts: [{ text: args.options.prompt }] }],
          generationConfig: generationConfigForModel(modelName, args.options),
        }),
        signal: controller.signal,
      },
    );

    const raw = await response.text();
    const parsed = raw
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        })()
      : null;

    if (!response.ok) {
      const detail = typeof parsed === "string" ? parsed : extractGeminiErrorMessage(parsed) || raw;
      const error = new Error(
        redactSecret(
          `Gemini API ${response.status}: ${detail || response.statusText}`.slice(0, 700),
          args.geminiKey,
        ),
      ) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    return {
      text: extractGeminiText(parsed),
      providerName: "Gemini" as const,
      modelId: modelName,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error(
        `Gemini API: délai d'attente dépassé après ${Math.round(args.timeoutMs / 1_000)} secondes.`,
      ) as Error & { status?: number };
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithAiGateway(options: GenerateOptions) {
  const fallbackKey = getLovableKey();
  if (!fallbackKey) return null;

  const provider = createOpenAICompatible({
    name: "travel-ai-fallback",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": fallbackKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
  const modelId = "google/gemini-3-flash-preview";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_GATEWAY_TIMEOUT_MS);
  try {
    const { text } = await generateText({
      model: provider(modelId),
      system: options.system,
      prompt: options.prompt,
      temperature: options.temperature,
      maxOutputTokens: Math.min(options.maxOutputTokens ?? 2_048, GEMINI_MAX_OUTPUT_TOKENS),
      abortSignal: controller.signal,
    });
    return { text, providerName: "AI Gateway" as const, modelId };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateTravelAiText(options: GenerateOptions) {
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    if (!looksLikeApiKey(geminiKey)) {
      throw new Error(
        "GEMINI_API_KEY est présente, mais elle ne ressemble pas à une clé API exploitable. Copie uniquement la valeur de la clé, sans espace ni guillemets.",
      );
    }

    const primaryModelId = getGeminiModelId();
    let lastPrimaryError: unknown = null;

    try {
      return await generateWithGeminiModel({
        geminiKey,
        modelId: primaryModelId,
        timeoutMs: GEMINI_PRIMARY_TIMEOUT_MS,
        options,
      });
    } catch (error) {
      lastPrimaryError = error;
      console.warn("[GlobeLink IA+] moteur principal indisponible", {
        model: primaryModelId,
        status: geminiStatus(error),
        reason: error instanceof Error ? error.message.slice(0, 240) : "unknown",
      });
    }

    if (shouldTryFastFallback(lastPrimaryError)) {
      const fallbackModelId = getGeminiFastFallbackModelId(primaryModelId);
      try {
        const fallback = await generateWithGeminiModel({
          geminiKey,
          modelId: fallbackModelId,
          timeoutMs: GEMINI_FAST_FALLBACK_TIMEOUT_MS,
          options: {
            ...options,
            thinkingLevel: options.thinkingLevel === "high" ? "low" : options.thinkingLevel,
          },
        });
        console.info("[GlobeLink IA+] moteur Gemini de secours utilisé", {
          primaryModel: primaryModelId,
          fallbackModel: fallbackModelId,
        });
        return fallback;
      } catch (fallbackError) {
        console.warn("[GlobeLink IA+] moteur Gemini de secours indisponible", {
          model: fallbackModelId,
          status: geminiStatus(fallbackError),
          reason: fallbackError instanceof Error ? fallbackError.message.slice(0, 240) : "unknown",
        });
      }
    }

    try {
      const fallback = await generateWithAiGateway(options);
      if (fallback) return fallback;
    } catch (fallbackError) {
      console.warn("[GlobeLink IA+] passerelle de secours indisponible", {
        reason: fallbackError instanceof Error ? fallbackError.message.slice(0, 240) : "unknown",
      });
    }

    throw friendlyGeminiFailure(lastPrimaryError);
  }

  const { provider, modelId, providerName } = createTravelAiProvider();
  const { text } = await generateText({
    model: provider(modelId),
    system: options.system,
    prompt: options.prompt,
    temperature: options.temperature,
    maxOutputTokens: Math.min(options.maxOutputTokens ?? 2_048, GEMINI_MAX_OUTPUT_TOKENS),
  });
  return { text, providerName, modelId };
}

export function getTravelAiConfigurationStatus(): TravelAiConfigurationStatus {
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    if (!looksLikeApiKey(geminiKey)) {
      return {
        configured: false,
        reason:
          "GEMINI_API_KEY est présente, mais elle ne ressemble pas à une clé API exploitable. Copie uniquement la valeur de la clé, sans espace ni guillemets.",
      };
    }
    return {
      configured: true,
      providerName: "Gemini",
      modelId: getGeminiModelId(),
    };
  }

  const fallbackKey = getLovableKey();
  if (fallbackKey) {
    return {
      configured: true,
      providerName: "AI Gateway",
      modelId: "google/gemini-3-flash-preview",
    };
  }

  return {
    configured: false,
    reason: "Aucune clé IA serveur configurée. Ajoute GEMINI_API_KEY dans le fichier .env.",
  };
}

/**
 * Primary AI provider for GlobeLink.
 *
 * GEMINI_API_KEY is preferred because Google offers a developer free tier for
 * supported Gemini models. The API key is read server-side only and is never
 * exposed to the browser. A legacy gateway can remain configured as a fallback
 * during migration.
 */
export function createTravelAiProvider() {
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    if (!looksLikeApiKey(geminiKey)) {
      throw new Error(
        "GEMINI_API_KEY est présente, mais elle ne ressemble pas à une clé API exploitable. Copie uniquement la valeur de la clé, sans espace ni guillemets.",
      );
    }
    const provider = createOpenAICompatible({
      name: "gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: geminiKey,
    });
    return {
      provider,
      modelId: getGeminiModelId(),
      providerName: "Gemini",
    } as const;
  }

  const fallbackKey = getLovableKey();
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
