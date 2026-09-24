import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTravelAiText } from "./ai-gateway.server";

const originalGeminiKey = process.env.GEMINI_API_KEY;
const originalGeminiModel = process.env.GEMINI_MODEL;
const originalGeminiFallbackModel = process.env.GEMINI_FALLBACK_MODEL;
const originalLovableKey = process.env.LOVABLE_API_KEY;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
  if (originalGeminiModel === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = originalGeminiModel;
  if (originalGeminiFallbackModel === undefined) delete process.env.GEMINI_FALLBACK_MODEL;
  else process.env.GEMINI_FALLBACK_MODEL = originalGeminiFallbackModel;
  if (originalLovableKey === undefined) delete process.env.LOVABLE_API_KEY;
  else process.env.LOVABLE_API_KEY = originalLovableKey;
});

describe("generateTravelAiText avec Gemini natif", () => {
  it("réserve assez de jetons de sortie et n'envoie pas temperature à Gemini 3", async () => {
    process.env.GEMINI_API_KEY = "cle-fictive-globelink-1234567890";
    process.env.GEMINI_MODEL = "gemini-3.6-flash";
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        generationConfig: Record<string, unknown>;
      };
      expect(body.generationConfig).toEqual({
        maxOutputTokens: 2_048,
        thinkingConfig: { thinkingLevel: "medium" },
      });
      expect(body.generationConfig).not.toHaveProperty("temperature");
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "OK" }] }, finishReason: "STOP" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateTravelAiText({ prompt: "Test", temperature: 0 })).resolves.toMatchObject({
      text: "OK",
      modelId: "gemini-3.6-flash",
    });
  });

  it("retente automatiquement Gemini après un 503 temporaire", async () => {
    process.env.GEMINI_API_KEY = "cle-fictive-globelink-1234567890";
    process.env.GEMINI_MODEL = "gemini-3.7-flash";
    delete process.env.LOVABLE_API_KEY;
    vi.useFakeTimers();

    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return new Response(
          JSON.stringify({
            error: {
              code: 503,
              status: "UNAVAILABLE",
              message: "This model is currently experiencing high demand.",
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Réponse après reprise" }] }, finishReason: "STOP" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = generateTravelAiText({ prompt: "Test surcharge" });
    await vi.runAllTimersAsync();

    await expect(request).resolves.toMatchObject({
      text: "Réponse après reprise",
      modelId: "gemini-3.7-flash",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("explique une réponse vide causée par la limite de jetons", async () => {
    process.env.GEMINI_API_KEY = "cle-fictive-globelink-1234567890";
    process.env.GEMINI_MODEL = "gemini-3.6-flash";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: { parts: [{ text: "raisonnement", thought: true }] },
                  finishReason: "MAX_TOKENS",
                },
              ],
              usageMetadata: { thoughtsTokenCount: 16, totalTokenCount: 23 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(generateTravelAiText({ prompt: "Test" })).rejects.toThrow(
      /MAX_TOKENS.*réflexion=16.*total=23/,
    );
  });
});
