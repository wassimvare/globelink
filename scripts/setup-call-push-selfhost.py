#!/usr/bin/env python3
"""Install and verify GlobeLink's incoming-call push function on self-hosted Supabase.

Run on the Raspberry:
  sudo python3 scripts/setup-call-push-selfhost.py --public-url https://...

The script never generates or prints a new VAPID private key. It preserves the
existing key from the Edge Functions environment or from the previous local
runtime config.
"""
import argparse
import base64
import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
NAME = "send-call-push"
PUBLIC_VAPID_KEY = "BC6OrM_FUL8gW0vucXb_K4DujyNCFj-IzN-SJVcNVP74hcbTcInfe5CUsBOL2177teLxwWIt_C_8Xooti3WZhHc"


def run(args, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"Échec de {args[0]} {args[1]} ; arrêt sans afficher de secrets.")
    return result.stdout.strip()


def select_container(containers, image, explicit):
    matches = [
        c for c in containers
        if (c["Name"].lstrip("/") == explicit if explicit else image in c["Config"]["Image"])
    ]
    if len(matches) != 1:
        names = ", ".join(c["Name"].lstrip("/") for c in matches) or "aucun"
        raise RuntimeError(
            f"Conteneur {image} non unique : {names}. "
            "Préciser --db-container ou --functions-container."
        )
    return matches[0]


def env(container):
    return dict(value.split("=", 1) for value in container["Config"]["Env"] if "=" in value)


def vapid_public_key_from_json(serialized):
    try:
        payload = json.loads(serialized)
        public = payload["publicKey"]
        x = str(public["x"])
        y = str(public["y"])

        def decode(value):
            padding = "=" * ((4 - len(value) % 4) % 4)
            return base64.urlsafe_b64decode(value + padding)

        raw = b"\x04" + decode(x) + decode(y)
        if len(raw) != 65:
            raise ValueError
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise RuntimeError(
            "Fichier VAPID invalide ; aucune modification effectuée."
        ) from None


def public_origin(value):
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise argparse.ArgumentTypeError(
            "Fournir l'origine HTTPS publique du Raspberry, sans chemin ni identifiants."
        )
    return value.rstrip("/")


def probe(url):
    req = urllib.request.Request(url, method="OPTIONS")
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            if response.status != 200:
                raise RuntimeError(f"Fonction chargée mais contrôle HTTP inattendu : {response.status}.")
    except urllib.error.HTTPError as error:
        raise RuntimeError(
            f"Fonction inaccessible : HTTP {error.code}. Vérifier les journaux Edge Functions."
        ) from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError(
            "Fonction injoignable ; vérifier le tunnel HTTPS et les journaux Edge Functions."
        ) from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-url", required=True, type=public_origin)
    parser.add_argument("--db-container")
    parser.add_argument("--functions-container")
    parser.add_argument(
        "--vapid-keys-file",
        help="Fichier JSON VAPID local à importer sans afficher la clé privée.",
    )
    parser.add_argument("--check-only", action="store_true")
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

    mounts = [
        mount for mount in edge["Mounts"]
        if mount["Destination"].rstrip("/") in ("/home/deno/functions", "/app/edge-functions")
    ]
    if len(mounts) != 1:
        raise RuntimeError("Volume persistant des fonctions introuvable ; vérifier Coolify.")
    target = Path(mounts[0]["Source"])
    if not (target / "main" / "index.ts").exists():
        raise RuntimeError("Point d'entrée main/index.ts absent ; installation Edge Functions non reconnue.")

    settings = env(edge)
    db_name = env(db).get("POSTGRES_DB", "postgres")

    def sql(statement):
        return run(
            [
                "docker", "exec", "-i", "-u", "postgres", db["Id"],
                "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
                "-d", db_name, "-At",
            ],
            statement,
        )

    readiness = sql(
        "select "
        "(to_regclass('public.push_subscriptions') is not null)::int || ',' || "
        "(to_regclass('public.conversation_participants') is not null)::int || ',' || "
        "(to_regclass('public.messages') is not null)::int || ',' || "
        "(to_regprocedure('public.register_push_subscription(text,text,text,bigint,text)') is not null)::int;"
    )
    if readiness != "1,1,1,1":
        raise RuntimeError(
            "Schéma push incomplet. Les migrations GlobeLink d'août 2026 doivent être présentes avant l'installation."
        )

    source = ROOT / "supabase" / "functions" / NAME
    if not (source / "index.ts").exists():
        raise RuntimeError("Source send-call-push absente du dépôt local ; faire d'abord git pull origin main.")

    shared = target / "_shared"
    config_path = shared / "call-push-runtime.json"
    previous = {}
    if config_path.exists():
        try:
            previous = json.loads(config_path.read_text())
        except ValueError:
            raise RuntimeError("Configuration VAPID locale illisible ; aucune modification effectuée.") from None

    file_keys_json = ""
    if args.vapid_keys_file:
        vapid_file = Path(args.vapid_keys_file).expanduser()
        if not vapid_file.is_file():
            raise RuntimeError("Fichier VAPID indiqué introuvable ; aucune modification effectuée.")
        file_keys_json = vapid_file.read_text().strip()

    private_key = (
        settings.get("GLOBELINK_VAPID_PRIVATE_KEY")
        or settings.get("VAPID_PRIVATE_KEY")
        or settings.get("WEB_PUSH_VAPID_PRIVATE_KEY")
        or os.environ.get("GLOBELINK_VAPID_PRIVATE_KEY")
        or os.environ.get("VAPID_PRIVATE_KEY")
        or previous.get("privateKey")
        or ""
    )
    keys_json = (
        settings.get("GLOBELINK_VAPID_KEYS_JSON")
        or settings.get("VAPID_KEYS_JSON")
        or os.environ.get("GLOBELINK_VAPID_KEYS_JSON")
        or os.environ.get("VAPID_KEYS_JSON")
        or file_keys_json
        or previous.get("vapidKeysJson")
        or ""
    )
    if not private_key and not keys_json:
        raise RuntimeError(
            "Clé VAPID privée existante introuvable. Aucune nouvelle clé n'a été générée pour ne pas casser les abonnements déjà enregistrés."
        )
    if keys_json and vapid_public_key_from_json(keys_json) != PUBLIC_VAPID_KEY:
        raise RuntimeError(
            "La clé VAPID publique du fichier ne correspond pas à celle publiée par GlobeLink ; aucune modification effectuée."
        )
    if private_key and len(private_key.strip()) < 20:
        raise RuntimeError("Clé VAPID privée existante invalide ; aucune modification effectuée.")

    subject = (
        settings.get("VAPID_SUBJECT")
        or settings.get("GLOBELINK_VAPID_SUBJECT")
        or os.environ.get("VAPID_SUBJECT")
        or previous.get("subject")
        or settings.get("PUBLIC_APP_URL")
        or args.public_url
    )

    print(
        f"Base : {db['Name'].lstrip('/')} ; fonctions : {edge['Name'].lstrip('/')}",
        flush=True,
    )
    print("Schéma push, volume persistant et clé VAPID existante détectés.", flush=True)

    if args.check_only:
        print("Inspection terminée, aucune modification.")
        return

    backup = (
        Path("/var/backups/globelink-call-push")
        / datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S")
    )
    backup.mkdir(parents=True, mode=0o700)
    if (target / NAME).exists():
        shutil.copytree(target / NAME, backup / NAME)
    if config_path.exists():
        shutil.copy2(config_path, backup / "call-push-runtime.json")

    shutil.copytree(source, target / NAME, dirs_exist_ok=True)
    shared.mkdir(exist_ok=True)

    runtime = {"subject": subject, "publicKey": PUBLIC_VAPID_KEY}
    if keys_json:
        runtime["vapidKeysJson"] = keys_json
    else:
        runtime["privateKey"] = private_key
    config_path.write_text(json.dumps(runtime))
    config_path.chmod(0o600)

    run(["docker", "restart", edge["Id"]])
    time.sleep(3)
    probe(args.public_url + "/functions/v1/" + NAME)

    print(f"Fonction {NAME} installée ; sauvegarde : {backup}", flush=True)
    print("Contrôle HTTP réussi. Les appels entrants peuvent maintenant déclencher le push hors application.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError) as error:
        print("ARRÊT : " + str(error), file=sys.stderr)
        sys.exit(1)
