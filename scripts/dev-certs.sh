#!/usr/bin/env bash
# Émet le certificat TLS local couvrant DEV_HOST et ses sous-domaines.
# Le certificat est lié à un nom précis : après tout changement de DEV_HOST, relancer ce
# script, sinon les quatre fronts refusent la connexion.
set -euo pipefail

if ! command -v mkcert >/dev/null 2>&1; then
    echo "mkcert est introuvable. Installer mkcert puis relancer." >&2
    exit 1
fi

if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a && source .env && set +a
fi

if [[ -z "${DEV_HOST:-}" ]]; then
    echo "DEV_HOST n'est pas défini. Le renseigner dans .env (voir .env.example)." >&2
    exit 1
fi

mkdir -p certs
mkcert -install
mkcert -cert-file certs/dev.pem -key-file certs/dev-key.pem "${DEV_HOST}" "*.${DEV_HOST}"

echo "Certificat émis pour ${DEV_HOST} et *.${DEV_HOST}"
echo "Autorité racine à installer sur le mobile : $(mkcert -CAROOT)/rootCA.pem"
