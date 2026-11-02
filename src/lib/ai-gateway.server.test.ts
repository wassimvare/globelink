import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { createTravelAiRequestContext, generateTravelAiText } from "./ai-gateway.server";

vi.mock("ai", () => ({ generateText: vi.fn() }));

function geminiResponse(text = "Programme complet pour deux voyageurs") {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
    }),
    { status: 200 },
  );
}

function apiError(status: number) {
  return new Response(
    JSON.stringify({
      error: { code: status, status: status === 429 ? "RESOURCE_EXHAUSTED" : "UNAVAILABLE" },
    }),
    { status },
  );
}

function delayedResponse(ms: number, init: RequestInit | undefined, response: () => Response) {
  return new Promise<Response>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      init?.signal?.removeEventListener("abort", abort);
      resolve(response());
    }, ms);
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener("abort", abort, { once: true });
  });
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "cle-fictive-globelink-1234567890");
  vi.stubEnv("GEMINI_MODEL", "gemini-3.7-flash");
  vi.stubEnv("GEMINI_FALLBACK_MODEL", "");
  vi.stubEnv("LOVABLE_API_KEY", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("generateTravelAiText", () => {
  it("migre l'ancien modèle et utilise le niveau low compatible sans temperature", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-3.6-flash");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => geminiResponse("OK"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateTravelAiText({ prompt: "Test", temperature: 0 })).resolves.toMatchObject({
      text: "OK",
      modelId: "gemini-3.7-flash",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("gemini-3.7-flash:generateContent");
    expect(JSON.parse(String(init?.body)).generationConfig).toEqual({
      maxOutputTokens: 2_048,
      thinkingConfig: { thinkingLevel: "low" },
    });
  });

  it("retente les 503 temporaires sans changer de modèle si celui-ci répond", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiError(503))
      .mockResolvedValueOnce(apiError(503))
      .mockResolvedValueOnce(geminiResponse("Reprise"));
    vi.stubGlobal("fetch", fetchMock);
    const request = generateTravelAiText({ prompt: "Test surcharge" });
    await vi.runAllTimersAsync();
    await expect(request).resolves.toMatchObject({ text: "Reprise", modelId: "gemini-3.7-flash" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("termine un long voyage lorsque le quota principal est atteint et le secours dépasse 16 s", async () => {
    vi.useFakeTimers();
    const prompt = "Organise 10 jours pour 2 voyageurs, budget total du groupe 2500 euros.";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("gemini-3.7-flash:")) return apiError(429);
      return delayedResponse(45_000, init, geminiResponse);
    });
    vi.stubGlobal("fetch", fetchMock);
    let completed = false;
    const request = generateTravelAiText({
      prompt,
      maxOutputTokens: 8_000,
      thinkingLevel: "low",
    }).then((result) => {
      completed = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(16_001);
    expect(completed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(28_999);
    await expect(request).resolves.toMatchObject({
      modelId: "gemini-3.5-flash-lite",
      text: expect.stringContaining("deux voyageurs"),
    });
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body.contents[0].parts[0].text).toBe(prompt);
    expect(body.generationConfig).toEqual({
      maxOutputTokens: 8_000,
      thinkingConfig: { thinkingLevel: "minimal" },
    });
  });

  it("réserve encore du temps au secours après le délai du moteur principal", async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      delayedResponse(url.includes("gemini-3.7-flash:") ? 120_000 : 45_000, init, geminiResponse),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = generateTravelAiText({ prompt: "Voyage complet", maxOutputTokens: 8_000 });
    await vi.runAllTimersAsync();
    await expect(request).resolves.toMatchObject({ modelId: "gemini-3.5-flash-lite" });
    expect(Date.now() - startedAt).toBe(105_000);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ne recommence pas un délai complet à chaque 503 tardif", async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      url.includes("gemini-3.7-flash:")
        ? delayedResponse(25_000, init, () => apiError(503))
        : Promise.resolve(geminiResponse()),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = generateTravelAiText({ prompt: "Voyage complet", maxOutputTokens: 8_000 });
    await vi.runAllTimersAsync();
    await expect(request).resolves.toMatchObject({ modelId: "gemini-3.5-flash-lite" });
    expect(Date.now() - startedAt).toBe(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("ne rappelle pas un modèle au quota épuisé pour compléter le même voyage", async () => {
    const requestContext = createTravelAiRequestContext();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiError(429))
      .mockImplementation(async () => geminiResponse());
    vi.stubGlobal("fetch", fetchMock);
    await generateTravelAiText({ prompt: "Programme initial", requestContext });
    await generateTravelAiText({ prompt: "Compléter les jours manquants", requestContext });
    // A separate request must not inherit another user's model exclusions.
    await generateTravelAiText({ prompt: "Autre voyage" });
    expect(fetchMock.mock.calls.map(([url]) => String(url).match(/models\/([^:]+)/)?.[1])).toEqual([
      "gemini-3.7-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash-lite",
      "gemini-3.7-flash",
    ]);
  });

  it("respecte le délai partagé sans lancer de secours après expiration", async () => {
    vi.useFakeTimers();
    const requestContext = createTravelAiRequestContext(20_000);
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      delayedResponse(100_000, init, geminiResponse),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = generateTravelAiText({
      prompt: "Voyage",
      maxOutputTokens: 8_000,
      requestContext,
    }).catch((error: Error) => error);
    await vi.runAllTimersAsync();
    expect(await result).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(generateTravelAiText({ prompt: "Suite", requestContext })).rejects.toThrow(
      /délai total/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("garde low pour un secours personnalisé qui ne supporte pas minimal", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    vi.stubEnv("GEMINI_FALLBACK_MODEL", "gemini-3.7-flash");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiError(429))
      .mockResolvedValueOnce(geminiResponse());
    vi.stubGlobal("fetch", fetchMock);
    await generateTravelAiText({ prompt: "Voyage", thinkingLevel: "high" });
    expect(
      JSON.parse(String(fetchMock.mock.calls[1][1].body)).generationConfig.thinkingConfig,
    ).toEqual({ thinkingLevel: "low" });
  });

  it("n'affiche ni raisonnement interne ni diagnostic fournisseur lors d'une réponse vide", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "raisonnement privé", thought: true }] },
                finishReason: "MAX_TOKENS",
              },
            ],
            usageMetadata: { thoughtsTokenCount: 16, totalTokenCount: 23 },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateTravelAiText({ prompt: "Test" })).rejects.toThrow(
      "GlobeLink IA n'a pas pu répondre pour le moment",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        reason: expect.stringMatching(/MAX_TOKENS.*réflexion=16.*total=23/),
      }),
    );
  });

  it("borne aussi la passerelle quand Gemini n'est pas configuré", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("LOVABLE_API_KEY", "cle-fictive-passerelle-1234567890");
    vi.mocked(generateText).mockImplementation(
      ({ abortSignal }: any) =>
        new Promise((_resolve, reject) => {
          abortSignal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const startedAt = Date.now();
    const request = generateTravelAiText({ prompt: "Voyage" }).catch((error: Error) => error);
    await vi.runAllTimersAsync();
    expect(await request).toBeInstanceOf(Error);
    expect(Date.now() - startedAt).toBe(30_000);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0, abortSignal: expect.any(AbortSignal) }),
    );
  });
});
