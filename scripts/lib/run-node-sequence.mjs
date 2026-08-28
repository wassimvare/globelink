import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function runNodeSequence(label, scripts) {
  console.log(`[${label}] ${scripts.length} étape(s) à exécuter.`);

  for (const script of scripts) {
    const absolute = resolve(process.cwd(), script);
    if (!existsSync(absolute)) {
      console.error(`[${label}] Script introuvable: ${script}`);
      process.exit(1);
    }

    console.log(`[${label}] → ${script}`);
    const result = spawnSync(process.execPath, [absolute], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });

    if (result.error) {
      console.error(`[${label}] Impossible d’exécuter ${script}:`, result.error);
      process.exit(1);
    }

    if ((result.status ?? 1) !== 0) {
      console.error(`[${label}] Échec de ${script} (code ${result.status ?? "inconnu"}).`);
      process.exit(result.status || 1);
    }
  }

  console.log(`[${label}] Pipeline terminé.`);
}
