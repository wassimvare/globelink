import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFiles = [".env", ".env.local", ".env.production", ".env.development"];
const errors = [];
const warnings = [];

function parseEnv(text) {
  const values = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    values.set(key, value);
  }
  return values;
}

function decodeRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))?.role ?? null;
  } catch {
    return null;
  }
}

for (const name of envFiles) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) continue;
  const env = parseEnv(readFileSync(path, "utf8"));

  for (const [key, value] of env) {
    if (!key.startsWith("VITE_")) continue;
    if (value.startsWith("sb_secret_") || decodeRole(value) === "service_role") {
      errors.push(`${name}: ${key} expose une clé Supabase privilégiée au navigateur.`);
    }
    if (/SECRET|SERVICE_ROLE|PRIVATE_KEY/i.test(key)) {
      errors.push(`${name}: ${key} ressemble à un secret serveur mais utilise le préfixe VITE_.`);
    }
    if (/^VITE_GOOGLE_(PLACES|MAPS)_API_KEY$/i.test(key) && value) {
      errors.push(
        `${name}: ${key} exposerait la clé Google Places/Maps dans le navigateur. Utilise GOOGLE_PLACES_API_KEY côté serveur.`,
      );
    }
  }

  if (env.get("VITE_TURN_CREDENTIAL")) {
    warnings.push(
      `${name}: VITE_TURN_CREDENTIAL est visible côté client. Utilise de préférence des identifiants TURN temporaires générés côté serveur avant une mise en production publique.`,
    );
  }
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`✖ ${error}`);
  process.exit(1);
}
console.log("✓ Contrôle de sécurité des variables d'environnement terminé.");
