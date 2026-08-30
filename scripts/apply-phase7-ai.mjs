import fs from "node:fs";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`[Phase 7] ${label} introuvable`);
  return source.replace(before, after);
}

// Server IA+
{
  const path = "src/lib/ai-pro.functions.ts";
  let source = fs.readFileSync(path, "utf8");
  if (!source.includes('from "@/features/ai/phase7-actions"')) {
    source = replaceOnce(
      source,
      'import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";\n',
      'import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";\nimport {\n  buildAiPlusApplicationPreview,\n  parseAiPlusBudgetForecasts,\n  splitAiPlusProgramByDay,\n} from "@/features/ai/phase7-actions";\n',
      "import actions",
    );
  }

  source = source.replace(
    'N’utilise JAMAIS de tableau Markdown avec des caractères |. Pour une comparaison, fais une sous-section courte par option avec des puces. Pour un budget, fais une sous-section par journée, puis une ligne par dépense et termine par un résumé avec total, marge et budget conseillé.',
    'N’utilise pas de tableau Markdown sauf pour la section Budget quand le voyage est daté. Pour une comparaison, fais une sous-section courte par option avec des puces. Pour un budget, détaille chaque journée puis termine par un résumé avec total, marge et budget conseillé.',
  );

  if (!source.includes("applicationPreview:")) {
    source = replaceOnce(
      source,
      '      updatedAt: now.toISOString(),\n',
      '      updatedAt: now.toISOString(),\n      applicationPreview: buildAiPlusApplicationPreview(text, connectedTrip.summary?.startsOn, connectedTrip.summary?.endsOn),\n',
      "preview réponse",
    );
  }

  source = source.replace(
    'const itineraryDays = splitAiItineraryByDay(data.content, trip.starts_on, trip.ends_on);',
    'const itineraryDays = splitAiPlusProgramByDay(data.content, trip.starts_on, trip.ends_on);',
  );

  if (!source.includes("const budgetForecasts = parseAiPlusBudgetForecasts")) {
    const needle = '    return { saved: true, tripId: String(trip.id) };';
    const replacement = `    const budgetForecasts = parseAiPlusBudgetForecasts(data.content, trip.starts_on, trip.ends_on);\n    if (budgetForecasts.length > 0) {\n      const { error: deleteForecastError } = await db\n        .from("trip_expenses")\n        .delete()\n        .eq("trip_id", trip.id)\n        .eq("user_id", context.userId)\n        .eq("category", "Prévision IA+")\n        .like("label", "IA+ · Budget prévu%");\n      if (deleteForecastError) throw new Error("Impossible de remplacer les prévisions IA+ du carnet.");\n\n      const { error: insertForecastError } = await db.from("trip_expenses").insert(\n        budgetForecasts.map((forecast) => ({\n          trip_id: trip.id,\n          user_id: context.userId,\n          label: \`IA+ · Budget prévu · \${forecast.day}\`,\n          amount: forecast.total,\n          category: "Prévision IA+",\n          spent_on: forecast.day,\n        })),\n      );\n      if (insertForecastError) throw new Error("Impossible d'appliquer le budget IA+ au carnet.");\n    }\n\n    return {\n      saved: true,\n      tripId: String(trip.id),\n      appliedDays: itineraryDays.length,\n      appliedBudgetDays: budgetForecasts.length,\n      totalForecast: budgetForecasts.reduce((sum, forecast) => sum + forecast.total, 0),\n    };`;
    source = replaceOnce(source, needle, replacement, "retour application");
  }

  fs.writeFileSync(path, source);
}

// UI IA+
{
  const path = "src/routes/ai-pro.tsx";
  let source = fs.readFileSync(path, "utf8");

  if (!source.includes("applicationPreview?:")) {
    source = replaceOnce(
      source,
      '  remaining?: number;\n};',
      '  remaining?: number;\n  applicationPreview?: { dayCount: number; budgetDayCount: number; days: string[]; totalForecast: number; actionable: boolean };\n};',
      "type preview",
    );
  }

  if (!source.includes("applicationPreview: data.applicationPreview")) {
    source = replaceOnce(
      source,
      '            remaining: data.remaining,\n',
      '            remaining: data.remaining,\n            applicationPreview: data.applicationPreview,\n',
      "preview turn",
    );
  }

  source = source.replace(
    '    onSuccess: () => toast.success("Conseil IA+ enregistré dans ton carnet ✨"),',
    '    onSuccess: (result) => {\n      const details = [\n        result.appliedDays ? `${result.appliedDays} journée${result.appliedDays > 1 ? "s" : ""}` : null,\n        result.appliedBudgetDays ? `${result.appliedBudgetDays} budget${result.appliedBudgetDays > 1 ? "s" : ""}` : null,\n      ].filter(Boolean).join(" + ");\n      toast.success(details ? `IA+ a appliqué ${details} au carnet ✨` : "Conseil IA+ enregistré dans ton carnet ✨");\n    },',
  );

  const buttonNeedle = `                        {trip?.id && (\n                          <Button type="button" variant="outline" size="sm" disabled={savePending} onClick={() => saveTurn(turn)} className="rounded-xl">\n                            {savePending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="mr-2 h-3.5 w-3.5" />}\n                            Enregistrer dans mon carnet\n                          </Button>\n                        )}`;
  const buttonReplacement = `                        {trip?.id && (\n                          <div className="flex flex-wrap items-center justify-end gap-2">\n                            {turn.applicationPreview?.actionable && (\n                              <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold text-violet-400">\n                                {turn.applicationPreview.dayCount > 0 ? turn.applicationPreview.dayCount + " jour" + (turn.applicationPreview.dayCount > 1 ? "s" : "") : ""}\n                                {turn.applicationPreview.dayCount > 0 && turn.applicationPreview.budgetDayCount > 0 ? " · " : ""}\n                                {turn.applicationPreview.budgetDayCount > 0 ? "budget " + turn.applicationPreview.totalForecast.toFixed(2) + " €" : ""}\n                              </span>\n                            )}\n                            <Button type="button" variant={turn.applicationPreview?.actionable ? "default" : "outline"} size="sm" disabled={savePending} onClick={() => saveTurn(turn)} className="rounded-xl">\n                              {savePending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="mr-2 h-3.5 w-3.5" />}\n                              {turn.applicationPreview?.actionable ? "Appliquer au carnet" : "Enregistrer le conseil"}\n                            </Button>\n                          </div>\n                        )}`;
  source = replaceOnce(source, buttonNeedle, buttonReplacement, "bouton appliquer");

  source = source.replace(
    '• te permet d’enregistrer ses recommandations dans le carnet.',
    '• peut appliquer son programme et ses budgets directement dans les bonnes journées du carnet.',
  );

  fs.writeFileSync(path, source);
}

// UI gratuite : CTA contextualisé après une demande premium
{
  const path = "src/routes/ai-trip.tsx";
  let source = fs.readFileSync(path, "utf8");
  if (!source.includes("upgradeRecommended?: boolean")) {
    source = replaceOnce(
      source,
      '  content: string;\n};',
      '  content: string;\n  upgradeRecommended?: boolean;\n};',
      "type gratuit",
    );
  }
  source = replaceOnce(
    source,
    '{ id: `a-${stamp}`, role: "assistant", content: data.answer } satisfies ChatTurn,',
    '{ id: `a-${stamp}`, role: "assistant", content: data.answer, upgradeRecommended: data.upgradeRecommended } satisfies ChatTurn,',
    "metadata gratuit",
  );
  const markdownNeedle = `                      <div className="md-body">\n                        <ReactMarkdown>{turn.content}</ReactMarkdown>\n                      </div>`;
  const markdownReplacement = `                      <div className="md-body">\n                        <ReactMarkdown>{turn.content}</ReactMarkdown>\n                      </div>\n                      {turn.upgradeRecommended && (\n                        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between">\n                          <p className="text-xs text-muted-foreground">Cette demande peut être exécutée plus loin avec le carnet connecté, des comparaisons réelles ou un programme complet.</p>\n                          <Button asChild size="sm" variant="outline" className="shrink-0 rounded-xl border-violet-400/30">\n                            <Link to="/ai-pro"><Crown className="mr-2 h-3.5 w-3.5" /> Continuer avec IA+</Link>\n                          </Button>\n                        </div>\n                      )}`;
  source = replaceOnce(source, markdownNeedle, markdownReplacement, "CTA gratuit");
  fs.writeFileSync(path, source);
}

console.log("[Phase 7] IA gratuite et IA+ branchées sur le contrat produit.");