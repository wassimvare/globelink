import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

export type TravelAiConfigurationStatus =
  | { configured: true; providerName: "Gemini" | "AI Gateway"; modelId: string }
  | { configured: false; reason: string };

const GEMINI_PRIMARY_TIMEOUT_MS = 55_000;
const GEMINI_RETRY_TIMEOUT_MS = 25_000;
const GEMINI_MAX_ATTEMPTS = 2;
const GEMINI_RETRY_DELAY_MS = 700;
const GEMINI_MAX_OUTPUT_TOKENS = 4_096;
const RETRYABLE_GEMINI_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

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

function getGeminiModelId() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(error: unknown) {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  const value = `${error.name} ${error.message}`.toLowerCase();
  return ["econnreset", "etimedout", "fetch failed", "network", "socket"].some((token) =>
    value.includes(token),
  );
}

function friendlyGeminiFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/429|resource_exhausted|rate.?limit/i.test(message)) {
    return new Error(
      "IA+ est temporairement très sollicitée. Une nouvelle tentative a été faite automatiquement ; réessaie dans quelques instants.",
    );
  }
  if (/délai|timeout|abort/i.test(message)) {
    return new Error(
      "L’analyse IA+ prend plus de temps que prévu. Une nouvelle tentative automatique a déjà été effectuée ; réessaie dans un instant.",
    );
  }
  if (/401|403|permission|unauthenticated/i.test(message)) {
    return new Error("Le moteur IA+ est momentanément indisponible. Réessaie un peu plus tard.");
  }
  return error instanceof Error ? error : new Error("IA+ n'a pas pu répondre pour le moment.");
}

async function generateWithAiGateway(options: {
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}) {
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
  const { text } = await generateText({
    model: provider(modelId),
    system: options.system,
    prompt: options.prompt,
    temperature: options.temperature,
    maxOutputTokens: Math.min(options.maxOutputTokens ?? 2_048, GEMINI_MAX_OUTPUT_TOKENS),
  });

  return { text, providerName: "AI Gateway" as const, modelId };
}

export async function generateTravelAiText(options: {
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
}) {
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    if (!looksLikeApiKey(geminiKey)) {
      throw new Error(
        "GEMINI_API_KEY est présente, mais elle ne ressemble pas à une clé API exploitable. Copie uniquement la valeur de la clé, sans espace ni guillemets.",
      );
    }

    const modelId = getGeminiModelId();
    const modelName = modelId.replace(/^models\//, "");
    const isGemini3 = /^gemini-3(?:[.-]|$)/i.test(modelName);
    const generationConfig = {
      maxOutputTokens: Math.min(options.maxOutputTokens ?? 2_048, GEMINI_MAX_OUTPUT_TOKENS),
      ...(isGemini3
        ? {
            thinkingConfig: {
              thinkingLevel: options.thinkingLevel ?? "low",
            },
          }
        : { temperature: options.temperature ?? 0.3 }),
    };

    let lastPrimaryError: unknown = null;

    for (let attempt = 0; attempt < GEMINI_MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeoutMs = attempt === 0 ? GEMINI_PRIMARY_TIMEOUT_MS : GEMINI_RETRY_TIMEOUT_MS;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiKey,
            },
            body: JSON.stringify({
              ...(options.system
                ? { system_instruction: { parts: [{ text: options.system }] } }
                : {}),
              contents: [{ role: "user", parts: [{ text: options.prompt }] }],
              generationConfig,
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
          const detail =
            typeof parsed === "string" ? parsed : extractGeminiErrorMessage(parsed) || raw;
          const geminiError = new Error(
            redactSecret(
              `Gemini API ${response.status}: ${detail || response.statusText}`.slice(0, 700),
              geminiKey,
            ),
          );
          lastPrimaryError = geminiError;

          if (
            RETRYABLE_GEMINI_STATUSES.has(response.status) &&
            attempt < GEMINI_MAX_ATTEMPTS - 1
          ) {
            await wait(GEMINI_RETRY_DELAY_MS);
            continue;
          }

          break;
        }

        return {
          text: extractGeminiText(parsed),
          providerName: "Gemini" as const,
          modelId,
        };
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "AbortError";
        lastPrimaryError = timedOut
          ? new Error(`Gemini API: délai d'attente dépassé après ${Math.round(timeoutMs / 1_000)} secondes.`)
          : error;

        if (
          (timedOut || isTransientNetworkError(error)) &&
          attempt < GEMINI_MAX_ATTEMPTS - 1
        ) {
          await wait(GEMINI_RETRY_DELAY_MS);
          continue;
        }

        break;
      } finally {
        clearTimeout(timeout);
      }
    }

    try {
      const fallback = await generateWithAiGateway(options);
      if (fallback) return fallback;
    } catch {
      // Le détail du fallback n'est pas exposé à l'utilisateur : on conserve
      // l'erreur primaire pour un message stable et compréhensible.
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
