# Image de DÉVELOPPEMENT de l'application vendeur : Metro seul, que le téléphone joint depuis
# Expo Go. Aucune image de production : l'application ne tourne que sur le téléphone, et ne se
# construit pas encore (spec T8, section 5).
#
# Pourquoi Metro tourne dans Docker : Docker publie ses ports sur le réseau local, alors qu'un
# Metro lancé hors conteneur n'y est pas toujours joignable, selon l'environnement du poste.
# Sinon, il faudrait le tunnel d'Expo, qui exige un compte Expo depuis le SDK 58.
#
# Debian et non Alpine, contrairement aux autres images : Metro et l'outillage d'Expo s'appuient sur
# des binaires natifs construits pour la glibc.
FROM node:24-bookworm-slim AS dev
# git : Expo CLI s'en sert pour lire l'état du projet. tini : un PID 1 qui transmet Ctrl+C
# à Metro.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git tini \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# `.dockerignore` ne laisse passer de l'application que son `package.json` : ses sources sont
# montées par le compose, et le reste du dépôt sert à résoudre le workspace.
COPY . .
# L'application et ses paquets du workspace, rien d'autre : ni Next, ni Nest, ni Prisma.
RUN pnpm install --frozen-lockfile --filter "@clemperl/vendor-mobile..."

ENV EXPO_NO_TELEMETRY=1
WORKDIR /app/apps/vendor-mobile
ENTRYPOINT ["/usr/bin/tini", "--"]
