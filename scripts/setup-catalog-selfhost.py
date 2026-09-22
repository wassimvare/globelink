#!/usr/bin/env python3
"""Install and verify GlobeLink's two catalog jobs on an existing Supabase Docker stack.

Run on the Raspberry: sudo python3 scripts/setup-catalog-selfhost.py --public-url https://...
No package installation, Compose rewrite, user-data deletion, or cloud access.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import quote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
NAMES = ("sync-travel-catalog", "cache-catalog-media")


def run(args, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True)
    if result.returncode:
        # Commands may consume credentials on stdin. Never print commands or raw errors.
        raise RuntimeError(f"Échec de {args[0]} {args[1]} ; arrêt sans afficher de secrets.")
    return result.stdout.strip()


def select_container(containers, image, explicit):
    matches = [c for c in containers if (c["Name"].lstrip("/") == explicit if explicit else image in c["Config"]["Image"])]
    if len(matches) != 1:
        names = ", ".join(c["Name"].lstrip("/") for c in matches) or "aucun"
        raise RuntimeError(f"Conteneur {image} non unique : {names}. Préciser --db-container ou --functions-container.")
    return matches[0]


def env(container):
    return dict(value.split("=", 1) for value in container["Config"]["Env"] if "=" in value)


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def public_origin(value):
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise argparse.ArgumentTypeError("Fournir l'origine HTTPS publique du Raspberry, sans chemin ni identifiants.")
    return value.rstrip("/")


def request(url, headers, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=150) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Fonction inaccessible : HTTP {error.code}. Vérifier le routage et les journaux Edge Functions dans Coolify.") from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("Fonction injoignable ou délai dépassé ; vérifier le tunnel et les journaux Coolify.") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-url", required=True, type=public_origin)
    parser.add_argument("--db-container")
    parser.add_argument("--functions-container")
    parser.add_argument("--check-only", action="store_true", help="Inspection locale, aucune modification")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError("Relancer avec sudo pour accéder aux volumes Docker.")
    ids = run(["docker", "ps", "-q"]).split()
    if not ids:
        raise RuntimeError("Aucun conteneur Docker actif.")
    containers = json.loads(run(["docker", "inspect", *ids]))
    db = select_container(containers, "supabase/postgres", args.db_container)
    edge = select_container(containers, "supabase/edge-runtime", args.functions_container)
    if not set(db["NetworkSettings"]["Networks"]) & set(edge["NetworkSettings"]["Networks"]):
        raise RuntimeError("La base et les fonctions n'appartiennent pas au même réseau Docker.")
    mounts = [m for m in edge["Mounts"] if m["Destination"].rstrip("/") in ("/home/deno/functions", "/app/edge-functions")]
    if len(mounts) != 1:
        raise RuntimeError("Volume persistant des fonctions introuvable ; vérifier le montage dans Coolify.")
    target = Path(mounts[0]["Source"])
    if not (target / "main" / "index.ts").exists():
        raise RuntimeError("Point d'entrée main/index.ts absent ; installation non reconnue.")
    settings = env(edge)
    key = settings.get("SUPABASE_ANON_KEY") or settings.get("SUPABASE_PUBLISHABLE_KEY")
    if not key:
        key = json.loads(settings.get("SUPABASE_PUBLISHABLE_KEYS", "{}" )).get("default")
    internal = settings.get("SUPABASE_URL", "").rstrip("/")
    if not key or not re.fullmatch(r"https?://[a-zA-Z0-9][a-zA-Z0-9.-]*(?::[0-9]{1,5})?", internal):
        raise RuntimeError("SUPABASE_URL ou clé publique absente des fonctions.")
    db_name = env(db).get("POSTGRES_DB", "postgres")
    def sql(statement):
        return run(["docker", "exec", "-i", "-u", "postgres", db["Id"], "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db_name, "-At"], statement)
    check = sql("select to_regclass('public.external_catalog_items') is not null and to_regclass('public.catalog_sync_runs') is not null;")
    if check != "t":
        raise RuntimeError("Tables du catalogue absentes : terminer d'abord la migration de GlobeLink.")
    print(f"Base : {db['Name'].lstrip('/')} ; fonctions : {edge['Name'].lstrip('/')}", flush=True)
    print("Catalogue existant et volume persistant détectés.", flush=True)
    if args.check_only:
        print("Inspection terminée, aucune modification.")
        return

    backup = Path("/var/backups/globelink-catalog") / datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup.mkdir(parents=True, mode=0o700)
    # Preserve the exact deployed functions before replacing only the two jobs.
    for name in (*NAMES, "_shared"):
        if (target / name).exists():
            shutil.copytree(target / name, backup / name)
    schema = run(["docker", "exec", "-u", "postgres", db["Id"], "pg_dump", "-U", "postgres", "-d", db_name, "--schema-only", "--schema=public"])
    (backup / "public-schema.sql").write_text(schema)
    config_path = target / "_shared" / "catalog-runtime.json"
    previous = json.loads(config_path.read_text()) if config_path.exists() else {}
    secret = settings.get("CATALOG_SYNC_SECRET") or previous.get("syncSecret") or secrets.token_urlsafe(40)
    if len(secret) < 24:
        raise RuntimeError("CATALOG_SYNC_SECRET existant trop court ; le corriger dans Coolify.")
    for name in NAMES:
        shutil.copytree(ROOT / "supabase/functions" / name, target / name, dirs_exist_ok=True)
    (target / "_shared").mkdir(exist_ok=True)
    shutil.copy2(ROOT / "supabase/functions/_shared/catalog-runtime.ts", target / "_shared/catalog-runtime.ts")
    # The worker shares the service-role environment already; keep runtime config out of Git.
    config_path.write_text(json.dumps({"syncSecret": secret, "publicUrl": args.public_url}))
    config_path.chmod(0o640)

    sql("create extension if not exists pg_cron with schema pg_catalog; create extension if not exists pg_net with schema extensions; create extension if not exists supabase_vault with schema vault;")
    migrations = ROOT / "supabase/migrations"
    statements = (migrations / "20260905081916_catalog_local_first_media_cache.sql").read_text()
    statements += "\n" + (migrations / "20260922164514_catalog_self_hosted_runtime.sql").read_text()
    statements += "\nselect public.configure_catalog_daily_cron(" + ",".join(map(sql_literal, [internal, key, secret])) + ");"
    statements += "\nselect public.configure_catalog_media_daily_cron();"
    statements += "\nnotify pgrst, 'reload schema';"
    sql("begin;\n" + statements + "\ncommit;")
    run(["docker", "restart", edge["Id"]])
    print(f"Fonctions installées ; sauvegarde : {backup}", flush=True)
    headers = {"Content-Type": "application/json", "apikey": key, "x-catalog-sync-secret": secret}
    if key.startswith("eyJ"):
        headers["Authorization"] = "Bearer " + key
    # A small photo batch verifies the actual worker/database/storage path before the long sync.
    time.sleep(3)
    photo = request(args.public_url + "/functions/v1/cache-catalog-media", headers, {"limit": 5})
    print("Premier lot photos : " + json.dumps({k: photo.get(k) for k in ("processed", "cached", "skipped", "failed")}), flush=True)
    print("Remplissage du catalogue en cours…", flush=True)
    sync = request(args.public_url + "/functions/v1/sync-travel-catalog", headers, {"triggerSource": "self-hosted-setup"})
    if sync.get("ok") is not True:
        raise RuntimeError("La synchronisation n'a pas confirmé son succès ; consulter catalog_sync_runs.")
    photo = request(args.public_url + "/functions/v1/cache-catalog-media", headers, {"limit": 20})
    if photo.get("ok") is not True:
        raise RuntimeError("Le remplissage photo n'a pas confirmé son succès ; consulter les journaux.")
    print("Photos : " + json.dumps({k: photo.get(k) for k in ("processed", "cached", "skipped", "failed")}), flush=True)
    print(sql("select jobname || ' : ' || schedule || ' ; actif=' || active from cron.job where jobname in ('globelink-daily-catalog','globelink-daily-catalog-media') order by jobname;"))
    print(sql("select 'Lieux OSM : ' || count(*) || ' ; photos stockées : ' || count(*) filter (where tags->>'catalog_image_status'='cached') from public.external_catalog_items where provider='openstreetmap';"))
    sample_path = sql("select tags->>'catalog_image_storage_path' from public.external_catalog_items where provider='openstreetmap' and tags->>'catalog_image_status'='cached' and coalesce(tags->>'catalog_image_storage_path','') <> '' limit 1;")
    if sample_path:
        sample_url = args.public_url + "/storage/v1/object/public/catalog-media/" + quote(sample_path, safe="/")
        try:
            with urllib.request.urlopen(urllib.request.Request(sample_url, method="HEAD"), timeout=20) as response:
                if not response.headers.get("Content-Type", "").startswith("image/"):
                    raise RuntimeError("Le stockage ne renvoie pas une image pour la photo de contrôle.")
            print("Photo de contrôle accessible depuis l'URL publique.")
        except urllib.error.URLError:
            raise RuntimeError("Photo de contrôle inaccessible : vérifier la copie du stockage et le tunnel.") from None
    else:
        print("Aucune photo réutilisable stockée pour l'instant ; vérifier les compteurs et les sources des lieux.")
    print("Installation terminée. Les prochaines exécutions utiliseront le Raspberry.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError) as error:
        print("ARRÊT : " + str(error), file=sys.stderr)
        sys.exit(1)
