# Image de la boutique publique. Deux cibles : `dev` monte le monorepo complet pour le
# rechargement à chaud ; `runner` part de `turbo prune`, qui n'extrait que le sous-graphe
# de dépendances de cette application — l'image finale ne contient donc ni le code de
# l'administration, ni celui de l'API.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# --- Développement : le monorepo entier, installé dans le conteneur ---
FROM base AS dev
COPY . .
RUN pnpm install --frozen-lockfile
# `...` inclut les dépendances : les packages compilés sont surveillés en même
# temps que l'application, sinon une modification de `core` n'atteindrait jamais
# le processus en cours.
CMD ["pnpm", "turbo", "run", "dev", "--filter=@clemperl/storefront..."]

# --- Isolation du sous-graphe ---
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo prune @clemperl/storefront --docker

# --- Installation puis build, sur le seul sous-graphe ---
FROM base AS installer
# Les manifestes d'abord : cette couche n'est invalidée que si les dépendances de CETTE
# application changent, pas à chaque modification de code.
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# Le client Prisma n'est pas versionné : il se génère pendant le build. `prisma
# generate` exige DATABASE_URL même sans ouvrir de connexion, d'où cette valeur de
# construction — elle ne sert qu'à satisfaire la configuration, jamais à se connecter.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm turbo run build --filter=@clemperl/storefront

# --- Exécution : la sortie standalone seule ---
FROM base AS runner
ENV NODE_ENV=production
USER node
COPY --from=installer --chown=node:node /app/apps/storefront/.next/standalone ./
COPY --from=installer --chown=node:node /app/apps/storefront/.next/static ./apps/storefront/.next/static
EXPOSE 3000
CMD ["node", "apps/storefront/server.js"]
