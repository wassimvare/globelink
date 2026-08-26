import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateTravelAiText } from "./ai-gateway.server";

type ChatTurn = { role: "user" | "assistant"; content: string };
type FreeAiInput = { query: string; history?: ChatTurn[] };

function cleanText(value: unknown, max: number) {
  return String(value ?? "")
    .normalize("NFKC")
    // eslint-disable-next-line no-control-regex -- non-printable user input is intentionally removed
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export const askGlobeLinkFree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown): FreeAiInput => {
    const raw = input as Partial<FreeAiInput>;
    const query = cleanText(raw.query, 1_200);
    if (query.length < 3) throw new Error("Décris un peu plus ta demande.");

    const history = Array.isArray(raw.history)
      ? raw.history.slice(-6).flatMap((turn) => {
          if (!turn || (turn.role !== "user" && turn.role !== "assistant")) return [];
          const content = cleanText(turn.content, turn.role === "assistant" ? 2_000 : 1_000);
          return content ? [{ role: turn.role, content } as ChatTurn] : [];
        })
      : [];

    const totalHistory = history.reduce((total, turn) => total + turn.content.length, 0);
    if (totalHistory > 7_000) throw new Error("La conversation est trop longue. Recommence une nouvelle demande.");

    return { query, history };
  })
  .handler(async ({ data, context }) => {
    const meteredChars = Math.min(
      28_000,
      data.query.length + (data.history ?? []).reduce((total, turn) => total + turn.content.length, 0),
    );

    const { data: remaining, error: usageError } = await context.supabase.rpc(
      "reserve_free_ai_usage",
      {
        p_feature: "chat",
        p_mode: "globelink_free",
        p_query_chars: meteredChars,
      },
    );

    if (usageError?.message.includes("AI_DAILY_LIMIT"))
      throw new Error("Limite quotidienne atteinte. Réessaie demain ou découvre IA+.");
    if (usageError) throw new Error("Le contrôle du quota IA est momentanément indisponible.");

    const historyText = (data.history ?? [])
      .map((turn) => `${turn.role === "user" ? "UTILISATEUR" : "GLOBELINK IA"}: ${turn.content}`)
      .join("\n\n");

    const { text } = await generateTravelAiText({
      temperature: 0.5,
      maxOutputTokens: 1_500,
      system: `Tu es GlobeLink IA, l'assistant voyage gratuit de GlobeLink. Tu réponds exclusivement en français. Ton rôle gratuit est d'inspirer et de préparer les grandes lignes d'un voyage : questions et conseils rapides, idées de destinations, exemple de journée, conseils généraux de budget et d'organisation. Tu ne consultes pas le carnet GlobeLink de l'utilisateur et tu n'effectues pas de recherche web approfondie ou en temps réel. Tu ne dois jamais présenter un prix, une disponibilité, une météo, une formalité ou un établissement précis comme vérifié, actuel ou réservé. Si tu cites un hôtel, restaurant ou activité à titre d'exemple, indique clairement que c'est une piste à vérifier et évite de donner l'impression d'une comparaison réelle. Tu peux proposer un exemple de journée ou de petites pistes d'itinéraire, mais pas prétendre avoir construit ou optimisé un voyage complet à partir de données réelles. Ne demande jamais de mot de passe, numéro de carte, document d'identité complet, clé API ou position exacte. Pour rechercher de vrais établissements, comparer des options et des prix, exploiter le carnet ou construire un itinéraire complet jour par jour, indique brièvement que GlobeLink IA+ est adapté, sans rendre la réponse gratuite inutile.`,
      prompt: `${historyText ? `CONTEXTE DE CONVERSATION\n${historyText}\n\n` : ""}NOUVELLE DEMANDE\n${data.query}\n\nRéponds directement à la demande en Markdown, sans préambule technique.`,
    });

    const answer = text.trim().slice(0, 18_000);
    if (!answer) throw new Error("GlobeLink IA n'a pas pu répondre pour le moment.");

    return {
      answer,
      remaining: Math.max(0, Number(remaining ?? 0)),
    };
  });