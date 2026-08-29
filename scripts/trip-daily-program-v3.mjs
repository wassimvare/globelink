import fs from "node:fs";

function update(path, transform) {
  const file = new URL(`../${path}`, import.meta.url);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`[Trip daily program V3] ${path}: amélioré`);
  } else {
    console.log(`[Trip daily program V3] ${path}: déjà conforme`);
  }
}

function mustReplace(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) {
    throw new Error(`[Trip daily program V3] Bloc introuvable: ${label}`);
  }
  return source.replace(search, replacement);
}

update("src/components/TripDaySectionPremium.tsx", (source) => {
  if (source.includes("TRIP_DAILY_PROGRAM_V3")) return source;
  if (!source.includes("TRIP_JOURNAL_DAYS_V2")) {
    throw new Error("[Trip daily program V3] Le patch carnet V2 doit être appliqué avant V3.");
  }

  source = source.replace(
    "// TRIP_JOURNAL_DAYS_V2",
    "// TRIP_JOURNAL_DAYS_V2\n// TRIP_DAILY_PROGRAM_V3",
  );

  source = mustReplace(
    source,
    '  key: "morning" | "afternoon" | "evening" | "other";',
    '  key: "morning" | "lunch" | "afternoon" | "dinner" | "hotel" | "evening" | "other";',
    "program section keys",
  );

  const oldNormalize = `function normalizeProgramTitle(value: string): ProgramSection["key"] {\n  const text = value\n    .normalize("NFD")\n    .replace(/[\\u0300-\\u036f]/g, "")\n    .toLowerCase();\n  if (text.includes("matin")) return "morning";\n  if (text.includes("apres-midi") || text.includes("midi")) return "afternoon";\n  if (text.includes("soir") || text.includes("fin d'apres-midi")) return "evening";\n  return "other";\n}`;
  const newNormalize = `function normalizeProgramTitle(value: string): ProgramSection["key"] {\n  const text = value\n    .normalize("NFD")\n    .replace(/[\\u0300-\\u036f]/g, "")\n    .toLowerCase();\n  if (text.includes("apres-midi") || text.includes("fin d'apres-midi")) return "afternoon";\n  if (text.includes("petit-dejeuner") || text.includes("petit dejeuner") || text === "matin") return "morning";\n  if (text.includes("dejeuner") || text === "midi") return "lunch";\n  if (text.includes("diner") || text.includes("repas du soir")) return "dinner";\n  if (text.includes("hotel") || text.includes("hebergement") || text.includes("nuit")) return "hotel";\n  if (text.includes("soir")) return "evening";\n  if (text.includes("matin")) return "morning";\n  return "other";\n}`;
  source = mustReplace(source, oldNormalize, newNormalize, "program title normalization");

  const parseMarker = "function parseProgram(raw: string | null | undefined): ProgramSection[] {";
  const helpers = String.raw`
function prettyProgramTitle(value: string) {
  const text = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (text.includes("petit-dejeuner") || text.includes("petit dejeuner")) return "Petit-déjeuner";
  if (text.includes("dejeuner") || text === "midi") return "Déjeuner";
  if (text.includes("apres-midi") || text.includes("fin d'apres-midi")) return "Après-midi";
  if (text.includes("diner") || text.includes("repas du soir")) return "Dîner";
  if (text.includes("hotel") || text.includes("hebergement") || text.includes("nuit")) return "Hôtel / Nuit";
  if (text.includes("soir")) return "Soir";
  if (text.includes("matin")) return "Matin";
  return value.trim();
}

function isProgramNoise(value: string) {
  const text = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return (
    !text ||
    /^recommandation ia\+\s*:?$/.test(text) ||
    /^note\s*:\s*la recherche web/.test(text) ||
    /^la recherche web en direct n['’]a pas retourne de source/.test(text) ||
    /^les informations ci-dessous sont basees sur des donnees generales/.test(text) ||
    /^programme\s*:?$/.test(text) ||
    /^plan d['’]action\s*:?$/.test(text) ||
    /^impact sur ton carnet\s*:?$/.test(text) ||
    /^a verifier avant d['’]agir\s*:?$/.test(text)
  );
}

function programSignature(program: ProgramSection[]) {
  return program
    .flatMap((section) => section.items)
    .map((item) => item.normalize("NFKC").toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, " ").trim())
    .filter(Boolean)
    .join("|");
}

`;
  if (!source.includes("function prettyProgramTitle")) {
    if (!source.includes(parseMarker)) {
      throw new Error("[Trip daily program V3] parseProgram introuvable.");
    }
    source = source.replace(parseMarker, `${helpers}${parseMarker}`);
  }

  const oldHeading = `      /^(Matin|Après-midi|Apres-midi|Midi|Soir|Fin d['’]après-midi|Fin d['’]apres-midi)(?:\\s*[\\/·–—-]\\s*([^:]+))?(?:\\s*:\\s*(.*))?$/i,`;
  const newHeading = `      /^(Matin|Petit-déjeuner|Petit dejeuner|Déjeuner|Dejeuner|Midi|Après-midi|Apres-midi|Fin d['’]après-midi|Fin d['’]apres-midi|Dîner|Diner|Repas du soir|Soir|Hôtel|Hotel|Hébergement|Hebergement|Nuit)(?:\\s*[\\/·–—-]\\s*([^:]+))?(?:\\s*:\\s*(.*))?$/i,`;
  source = mustReplace(source, oldHeading, newHeading, "daily slot headings");

  const oldTitle = `      const title = heading[1]\n        .replace(/Apres/i, "Après")\n        .replace(/apres/i, "après");`;
  source = mustReplace(
    source,
    oldTitle,
    "      const title = prettyProgramTitle(heading[1]);",
    "pretty program title",
  );

  source = mustReplace(
    source,
    '  for (const original of relevant.split("\\n")) {\n    const line = cleanMarkdownLine(original);',
    '  for (const original of relevant.split("\\n")) {\n    if (/^\\s*#{1,6}\\s+(Budget|Impact sur ton carnet|Alternatives|À vérifier|A vérifier|Sources|Comparaison)/i.test(original)) break;\n    const line = cleanMarkdownLine(original);',
    "stop before non-program sections",
  );

  const oldUnstructured = `    if (!current) {\n      current = { key: "other", title: "Programme", items: [] };\n      sections.push(current);\n    }\n    current.items.push(line);`;
  const newUnstructured = `    if (!current) {\n      const timed = line.match(/^(\\d{1,2}(?::|h)\\d{0,2})\\s*[·:–—-]\\s*(.+)$/i);\n      if (!timed || isProgramNoise(line)) continue;\n      current = { key: "other", title: "À faire", items: [] };\n      sections.push(current);\n      current.items.push(\`\${timed[1]} · \${timed[2]}\`);\n      continue;\n    }\n    if (!isProgramNoise(line)) current.items.push(line);`;
  source = mustReplace(source, oldUnstructured, newUnstructured, "ignore generic AI prose");

  source = mustReplace(
    source,
    "  return sections\n    .map((section) => ({",
    "  const seenItems = new Set<string>();\n  return sections\n    .map((section) => ({",
    "program item dedupe set",
  );

  const oldItems = `      items: section.items\n        .map((item) => item.replace(/^[:;,.\\-–—]+\\s*/, "").trim())\n        .filter(Boolean),`;
  const newItems = `      items: section.items\n        .map((item) => item.replace(/^[:;,.\\-–—]+\\s*/, "").trim())\n        .filter((item) => {\n          if (!item || isProgramNoise(item)) return false;\n          const signature = item\n            .normalize("NFKC")\n            .toLowerCase()\n            .replace(/[^a-z0-9à-ÿ]+/gi, " ")\n            .trim();\n          if (!signature || seenItems.has(signature)) return false;\n          seenItems.add(signature);\n          return true;\n        }),`;
  source = mustReplace(source, oldItems, newItems, "dedupe program items");

  const oldProgramMemo = `  const program = useMemo(\n    () => parseProgram(extractProgramForDay(programSource, day)),\n    [programSource, day],\n  );`;
  const newProgramMemo = `  const program = useMemo(() => {\n    const parsed = parseProgram(extractProgramForDay(programSource, day));\n    const signature = programSignature(parsed);\n    if (!signature) return parsed;\n\n    const duplicateEarlierDay = allEntries.some((entry) => {\n      if (!isAiProgramNote(entry) || !entry?.notes || !entry?.visited_on || entry.visited_on >= day) return false;\n      const previous = parseProgram(extractProgramForDay(String(entry.notes), String(entry.visited_on)));\n      return programSignature(previous) === signature;\n    });\n\n    return duplicateEarlierDay ? [] : parsed;\n  }, [programSource, day, allEntries]);`;
  source = mustReplace(source, oldProgramMemo, newProgramMemo, "hide duplicated daily programs");

  source = mustReplace(
    source,
    '<p className="text-xs text-muted-foreground">Ton itinéraire, simplement.</p>',
    '<p className="text-xs text-muted-foreground">Un planning clair, uniquement pour cette journée.</p>',
    "program subtitle",
  );

  const oldIcon = '              const Icon = section.key === "morning" ? Sunrise : section.key === "afternoon" ? Sun : section.key === "evening" ? MoonStar : CalendarDays;';
  const newIcon = `              const Icon =\n                section.key === "morning"\n                  ? Sunrise\n                  : section.key === "lunch" || section.key === "dinner"\n                    ? UtensilsCrossed\n                    : section.key === "hotel"\n                      ? Bed\n                      : section.key === "afternoon"\n                        ? Sun\n                        : section.key === "evening"\n                          ? MoonStar\n                          : CalendarDays;`;
  source = mustReplace(source, oldIcon, newIcon, "program section icons");

  const oldItemRender = `                      {section.items.map((item, itemIndex) => (\n                        <li key={\`\${section.title}-\${itemIndex}\`} className="rounded-xl bg-background/55 px-3 py-2.5">\n                          <span>{item}</span>\n                        </li>\n                      ))}`;
  const newItemRender = `                      {section.items.map((item, itemIndex) => {\n                        const option = item.match(/^(Option\\s+[A-C]|Choix\\s+\\d+)\\s*(?:[·:–—-]\\s*)?(.*)$/i);\n                        return (\n                          <li\n                            key={\`\${section.title}-\${itemIndex}\`}\n                            className="rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"\n                          >\n                            {option ? (\n                              <div className="flex items-start gap-2.5">\n                                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">\n                                  {option[1]}\n                                </span>\n                                <span className="min-w-0">{option[2] || item}</span>\n                              </div>\n                            ) : (\n                              <span>{item}</span>\n                            )}\n                          </li>\n                        );\n                      })}`;
  source = mustReplace(source, oldItemRender, newItemRender, "comparison option cards");

  return source;
});

update("src/lib/ai-pro.functions.ts", (source) => {
  if (source.includes("AI_DAILY_PROGRAM_V3")) return source;
  if (!source.includes("AI_DAY_SPLIT_V2")) {
    throw new Error("[Trip daily program V3] Le patch IA V2 doit être appliqué avant V3.");
  }

  source = source.replace("// AI_DAY_SPLIT_V2", "// AI_DAY_SPLIT_V2\n// AI_DAILY_PROGRAM_V3");

  const oldCompare = `      compare:\n        "Compare réellement les options sous forme de sous-sections courtes, une option par bloc. Donne avantages, limites, budget estimatif, emplacement/logistique et un verdict selon au moins deux profils de voyageurs. N’utilise jamais de tableau Markdown avec des barres verticales.",`;
  const newCompare = `      compare:\n        "Compare réellement les options avec des critères utiles et un verdict clair. Si la demande concerne un voyage daté, des restaurants ou des hôtels, organise aussi la recommandation par date avec un titre ### YYYY-MM-DD · titre court. Dans chaque date pertinente, utilise ### Déjeuner pour 2 à 3 restaurants du midi, ### Dîner pour 2 à 3 restaurants différents du midi, et ### Hôtel pour les hébergements du soir. Écris chaque alternative sur une ligne commençant par - Option A ·, - Option B ·, etc. Ne répète pas les mêmes restaurants entre midi et soir ni d'un jour à l'autre. L'hôtel peut rester le même plusieurs nuits si c'est cohérent.",`;
  source = mustReplace(source, oldCompare, newCompare, "compare prompt");

  const oldPlan = `      plan:\n        "Agis comme un travel planner. Construis ou réorganise un plan concret et réaliste, strictement séparé par journée. Pour chaque date du séjour, commence obligatoirement par un titre de forme ### YYYY-MM-DD · titre court, puis utilise les sous-titres ### Matin, ### Après-midi et ### Soir si pertinents. Ne mélange jamais le contenu de deux dates dans le même bloc. Tiens compte du carnet connecté, du budget restant et des déplacements.",`;
  const newPlan = `      plan:\n        "Agis comme un travel planner. Construis un programme concret, réaliste et strictement séparé par journée. Pour chaque date du séjour, commence obligatoirement par ### YYYY-MM-DD · titre court. À l'intérieur, utilise uniquement les créneaux pertinents parmi ### Matin, ### Déjeuner, ### Après-midi, ### Dîner, ### Hôtel et ### Soir. Chaque ligne doit être une action courte et exploitable, avec une heure indicative quand elle apporte quelque chose. Ne mélange jamais deux dates et ne recopie jamais le même programme d'un jour à l'autre. Le déjeuner et le dîner doivent proposer des restaurants différents. Si l'utilisateur demande de comparer, mets 2 à 3 options sous Déjeuner, 2 à 3 autres options sous Dîner et, le soir, 1 à 3 options sous Hôtel / Nuit, chaque option commençant par - Option A ·, - Option B ·, etc. L'hôtel peut se répéter sur plusieurs nuits si le séjour l'exige, mais pas les activités ou restaurants sauf demande explicite. Garde les étapes géographiquement cohérentes pour éviter les allers-retours inutiles. N'écris jamais de note générale sur l'absence de source web à l'intérieur d'un bloc journée : place-la uniquement dans ## À vérifier avant d'agir après le programme. Tiens compte du carnet connecté, du budget restant et des déplacements.",`;
  source = mustReplace(source, oldPlan, newPlan, "structured daily plan prompt");

  return source;
});
