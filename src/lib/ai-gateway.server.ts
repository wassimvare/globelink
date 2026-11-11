import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

export type TravelAiConfigurationStatus =
  | { configured: true; providerName: "Gemini" | "AI Gateway"; modelId: string }
  | { configured: false; reason: string };

const GEMINI_PRIMARY_TIMEOUT_MS = 28_000;
const GEMINI_FAST_FALLBACK_TIMEOUT_MS = 45_000;
const AI_GATEWAY_TIMEOUT_MS = 30_000;
const LONG_GENERATION_PRIMARY_TIMEOUT_MS = 60_000;
const LONG_GENERATION_FALLBACK_TIMEOUT_MS = 90_000;
const LONG_GENERATION_GATEWAY_TIMEOUT_MS = 60_000;
const AI_GENERATION_TIMEOUT_MS = 180_000;
const GEMINI_MAX_OUTPUT_TOKENS = 8_192;
const GEMINI_PRIMARY_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_DELAYS_MS = [400, 1_200] as const;
const RETRYABLE_GEMINI_STATUSES = new Set([400, 404, 408, 429, 500, 502, 503, 504]);
const SAME_MODEL_RETRYABLE_GEMINI_STATUSES = new Set([500, 502, 503, 504]);
const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash";
const DEFAULT_GEMINI_FAST_FALLBACK_MODEL = "gemini-3.5-flash-lite";
const RESPONSIVE_FALLBACK_DELAY_MS = 10_000;

type TravelAiRequestContext = {
  deadlineAt: number;
  quotaLimitedModels: Set<string>;
  unavailableModels: Set<string>;
  preferredModelId?: string;
  latencyMode: "standard" | "responsive";
};

/** Shared only by the generations belonging to one authenticated request. */
export function createTravelAiRequestContext(
  timeoutMs = 240_000,
  options: { latencyMode?: TravelAiRequestContext["latencyMode"] } = {},
): TravelAiRequestContext {
  return {
    deadlineAt: Date.now() + timeoutMs,
    quotaLimitedModels: new Set<string>(),
    unavailableModels: new Set<string>(),
    latencyMode: options.latencyMode ?? "standard",
  };
}

function generationTimeoutError(timeoutMs?: number) {
  return Object.assign(
    new Error(
      timeoutMs == null
        ? "GlobeLink IA: délai total de préparation dépassé."
        : `Gemini API: délai d'attente dépassé après ${Math.round(timeoutMs / 1_000)} secondes.`,
    ),
    { status: 408 },
  );
}

function remainingTimeout(timeoutMs: number, deadlineAt: number) {
  const remaining = Math.min(timeoutMs, deadlineAt - Date.now());
  if (remaining <= 0) throw generationTimeoutError();
  return remaining;
}

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
  return String(value ?? "")
    .trim()
    .replace(/^models\//, "");
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
  return ["econnreset", "etimedout", "fetch failed", "network", "socket", "abort"].some((token) =>
    value.includes(token),
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
    /délai|timeout|abort|réponse sans texte/i.test(
      error instanceof Error ? error.message : String(error ?? ""),
    )
  );
}

function shouldRetrySameGeminiModel(error: unknown) {
  const status = geminiStatus(error);
  if (status != null) return SAME_MODEL_RETRYABLE_GEMINI_STATUSES.has(status);
  return isTransientNetworkError(error);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function friendlyGeminiFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/429|resource_exhausted|rate.?limit/i.test(message)) {
    return new Error(
      "GlobeLink IA est temporairement très sollicitée. Le moteur de secours a aussi été essayé automatiquement ; réessaie dans quelques instants.",
    );
  }
  if (/500|502|503|504|unavailable|high demand|overload/i.test(message)) {
    return new Error(
      "GlobeLink IA est temporairement très sollicitée. Plusieurs tentatives automatiques ont été faites ; réessaie dans quelques instants.",
    );
  }
  if (/délai|timeout|abort/i.test(message)) {
    return new Error(
      "GlobeLink IA a dépassé le délai prévu malgré le moteur de secours. Réessaie dans un instant.",
    );
  }
  if (/401|403|permission|unauthenticated/i.test(message)) {
    return new Error(
      "Le moteur GlobeLink IA est momentanément indisponible. Réessaie un peu plus tard.",
    );
  }
  if (/400|404|invalid_argument|not_found/i.test(message)) {
    return new Error(
      "GlobeLink IA n’a pas pu traiter cette demande avec sa configuration actuelle. Un moteur de secours a été essayé automatiquement.",
    );
  }
  return new Error(
    "GlobeLink IA n'a pas pu répondre pour le moment. Réessaie dans quelques instants.",
  );
}

type GenerateOptions = {
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  requestContext?: ReturnType<typeof createTravelAiRequestContext>;
};

function generationConfigForModel(modelName: string, options: GenerateOptions) {
  const isGemini3 = /^gemini-3(?:[.-]|$)/i.test(modelName);
  const requestedThinking = options.thinkingLevel ?? "low";
  // Gemini 3.7 does not accept `minimal`; low is the latency-oriented supported level.
  const thinkingLevel =
    /^gemini-3\.7(?:[.-]|$)/i.test(modelName) && requestedThinking === "minimal"
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
  signal?: AbortSignal;
}) {
  const modelName = normalizeModelId(args.modelId);
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (args.signal?.aborted) controller.abort();
  else args.signal?.addEventListener("abort", abortFromCaller, { once: true });
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
    if (args.signal?.aborted) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw generationTimeoutError(args.timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    args.signal?.removeEventListener("abort", abortFromCaller);
  }
}

/**
 * Give a healthy primary the first chance, but don't wait a full minute to
 * start the existing fallback. Only a successful answer wins; a fast error
 * must not discard another model's still-running generation.
 */
async function generateResponsiveGemini(args: {
  geminiKey: string;
  primaryModelId: string;
  primaryTimeoutMs: number;
  fallbackTimeoutMs: number;
  deadlineAt: number;
  options: GenerateOptions;
  requestContext: TravelAiRequestContext;
}) {
  const { requestContext } = args;
  const fallbackModelId = getGeminiFastFallbackModelId(args.primaryModelId);
  const candidates = [
    { modelId: args.primaryModelId, timeoutMs: args.primaryTimeoutMs, options: args.options },
    {
      modelId: fallbackModelId,
      timeoutMs: args.fallbackTimeoutMs,
      options: {
        ...args.options,
        thinkingLevel: /^gemini-3[.-].*flash-lite/i.test(fallbackModelId)
          ? ("minimal" as const)
          : ("low" as const),
      },
    },
  ]
    .filter(
      ({ modelId }) =>
        !requestContext.unavailableModels.has(modelId) &&
        !requestContext.quotaLimitedModels.has(modelId),
    )
    .sort(
      (left, right) =>
        Number(right.modelId === requestContext.preferredModelId) -
        Number(left.modelId === requestContext.preferredModelId),
    );

  if (!candidates.length) {
    throw Object.assign(
      new Error("Gemini API 503: moteurs indisponibles pour cette préparation."),
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  return new Promise<Awaited<ReturnType<typeof generateWithGeminiModel>>>((resolve, reject) => {
    const controllers: AbortController[] = [];
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    let started = 0;
    let failed = 0;
    let finished = false;

    const cleanup = (winner?: number) => {
      clearTimeout(hedgeTimer);
      controllers.forEach((controller, index) => {
        if (index !== winner) controller.abort();
      });
    };

    const startNext = () => {
      if (finished || started >= candidates.length) return;
      clearTimeout(hedgeTimer);
      const index = started++;
      const candidate = candidates[index];
      const controller = new AbortController();
      controllers[index] = controller;

      void (async () => {
        try {
          const result = await generateWithGeminiModel({
            ...candidate,
            geminiKey: args.geminiKey,
            timeoutMs: remainingTimeout(candidate.timeoutMs, args.deadlineAt),
            signal: controller.signal,
          });
          if (finished) return;
          finished = true;
          requestContext.preferredModelId = result.modelId;
          cleanup(index);
          console.info("[GlobeLink IA+] génération terminée", {
            model: result.modelId,
            durationMs: Date.now() - startedAt,
            attempts: started,
          });
          resolve(result);
        } catch (error) {
          // Cancellation of the losing request is expected, not a provider failure.
          if (finished) return;
          failed += 1;
          const retryable = shouldTryFastFallback(error);
          if (retryable) requestContext.unavailableModels.add(candidate.modelId);
          if (geminiStatus(error) === 429) requestContext.quotaLimitedModels.add(candidate.modelId);
          console.warn("[GlobeLink IA+] moteur indisponible, bascule rapide", {
            model: candidate.modelId,
            status: geminiStatus(error),
            durationMs: Date.now() - startedAt,
          });
          if (retryable && started < candidates.length && Date.now() < args.deadlineAt) {
            startNext();
          } else if (failed === started) {
            finished = true;
            cleanup();
            reject(error);
          }
        }
      })();
    };

    startNext();
    if (!finished && started < candidates.length) {
      hedgeTimer = setTimeout(startNext, RESPONSIVE_FALLBACK_DELAY_MS);
    }
  });
}

async function generateWithGeminiRetries(args: {
  geminiKey: string;
  modelId: string;
  timeoutMs: number;
  options: GenerateOptions;
}) {
  let lastError: unknown = null;
  // Retries share one allowance; a late 503 must not restart a full timeout.
  const deadlineAt = Date.now() + args.timeoutMs;

  for (let attempt = 1; attempt <= GEMINI_PRIMARY_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await generateWithGeminiModel({
        ...args,
        timeoutMs: remainingTimeout(args.timeoutMs, deadlineAt),
      });
    } catch (error) {
      lastError = error;
      if (attempt >= GEMINI_PRIMARY_MAX_ATTEMPTS || !shouldRetrySameGeminiModel(error)) {
        throw error;
      }

      const delayMs =
        GEMINI_RETRY_DELAYS_MS[Math.min(attempt - 1, GEMINI_RETRY_DELAYS_MS.length - 1)];
      if (Date.now() + delayMs >= deadlineAt) throw error;
      console.warn(
        "[GlobeLink IA] réponse Gemini temporairement indisponible, nouvelle tentative",
        {
          model: normalizeModelId(args.modelId),
          attempt,
          nextAttempt: attempt + 1,
          status: geminiStatus(error),
          delayMs,
        },
      );
      await wait(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini temporairement indisponible.");
}

async function generateWithAiGateway(options: GenerateOptions, timeoutMs: number) {
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
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { text } = await generateText({
      model: provider(modelId),
      system: options.system,
      prompt: options.prompt,
      temperature: options.temperature,
      maxOutputTokens: Math.min(options.maxOutputTokens ?? 2_048, GEMINI_MAX_OUTPUT_TOKENS),
      maxRetries: 0,
      abortSignal: controller.signal,
    });
    if (!text.trim()) throw new Error("La passerelle IA a renvoyé une réponse vide.");
    return { text, providerName: "AI Gateway" as const, modelId };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateTravelAiText(options: GenerateOptions) {
  const requestContext =
    options.requestContext ?? createTravelAiRequestContext(AI_GENERATION_TIMEOUT_MS);
  const deadlineAt = Math.min(requestContext.deadlineAt, Date.now() + AI_GENERATION_TIMEOUT_MS);
  remainingTimeout(AI_GENERATION_TIMEOUT_MS, deadlineAt);
  const longGeneration = (options.maxOutputTokens ?? 2_048) > 4_096;
  const primaryTimeoutMs = longGeneration
    ? LONG_GENERATION_PRIMARY_TIMEOUT_MS
    : GEMINI_PRIMARY_TIMEOUT_MS;
  const fallbackTimeoutMs = longGeneration
    ? LONG_GENERATION_FALLBACK_TIMEOUT_MS
    : GEMINI_FAST_FALLBACK_TIMEOUT_MS;
  const gatewayTimeoutMs = longGeneration
    ? LONG_GENERATION_GATEWAY_TIMEOUT_MS
    : AI_GATEWAY_TIMEOUT_MS;
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
      if (
        requestContext.latencyMode !== "responsive" &&
        requestContext.quotaLimitedModels.has(primaryModelId)
      ) {
        throw Object.assign(
          new Error("Gemini API 429: limite déjà atteinte pendant cette préparation."),
          { status: 429 },
        );
      }
      if (requestContext.latencyMode === "responsive") {
        return await generateResponsiveGemini({
          geminiKey,
          primaryModelId,
          primaryTimeoutMs,
          fallbackTimeoutMs,
          deadlineAt,
          options,
          requestContext,
        });
      }
      return await generateWithGeminiRetries({
        geminiKey,
        modelId: primaryModelId,
        timeoutMs: remainingTimeout(primaryTimeoutMs, deadlineAt),
        options,
      });
    } catch (error) {
      lastPrimaryError = error;
      if (requestContext.latencyMode !== "responsive" && geminiStatus(error) === 429) {
        requestContext.quotaLimitedModels.add(primaryModelId);
      }
      console.warn("[GlobeLink IA+] moteur principal indisponible", {
        model: primaryModelId,
        status: geminiStatus(error),
        reason: error instanceof Error ? error.message.slice(0, 240) : "unknown",
      });
    }

    if (requestContext.latencyMode !== "responsive" && shouldTryFastFallback(lastPrimaryError)) {
      const fallbackModelId = getGeminiFastFallbackModelId(primaryModelId);
      try {
        if (requestContext.quotaLimitedModels.has(fallbackModelId)) {
          throw Object.assign(
            new Error("Gemini API 429: limite déjà atteinte pendant cette préparation."),
            { status: 429 },
          );
        }
        const fallback = await generateWithGeminiModel({
          geminiKey,
          modelId: fallbackModelId,
          timeoutMs: remainingTimeout(fallbackTimeoutMs, deadlineAt),
          options: {
            ...options,
            // Flash-Lite supports minimal thinking; preserve the full output
            // allowance so a complete itinerary is not cut down to a summary.
            thinkingLevel: /^gemini-3[.-].*flash-lite/i.test(fallbackModelId) ? "minimal" : "low",
          },
        });
        console.info("[GlobeLink IA+] moteur Gemini de secours utilisé", {
          primaryModel: primaryModelId,
          fallbackModel: fallbackModelId,
        });
        return fallback;
      } catch (fallbackError) {
        if (geminiStatus(fallbackError) === 429)
          requestContext.quotaLimitedModels.add(fallbackModelId);
        console.warn("[GlobeLink IA+] moteur Gemini de secours indisponible", {
          model: fallbackModelId,
          status: geminiStatus(fallbackError),
          reason: fallbackError instanceof Error ? fallbackError.message.slice(0, 240) : "unknown",
        });
      }
    }

    try {
      const fallback = await generateWithAiGateway(
        options,
        remainingTimeout(gatewayTimeoutMs, deadlineAt),
      );
      if (fallback) return fallback;
    } catch (fallbackError) {
      console.warn("[GlobeLink IA+] passerelle de secours indisponible", {
        reason: fallbackError instanceof Error ? fallbackError.message.slice(0, 240) : "unknown",
      });
    }

    throw friendlyGeminiFailure(lastPrimaryError);
  }

  const fallback = await generateWithAiGateway(
    options,
    remainingTimeout(gatewayTimeoutMs, deadlineAt),
  );
  if (fallback) return fallback;
  throw new Error("Le moteur IA n'est pas configuré. Ajoute GEMINI_API_KEY côté serveur.");
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
