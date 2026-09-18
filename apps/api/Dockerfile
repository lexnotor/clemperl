# Image de l'API : Socket.IO, traitements de fond et webhooks. La sortie de NestJS est
# `dist/`, et non une sortie autonome comme Next : les dépendances d'exécution doivent
# donc être installées explicitement dans l'image finale.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS dev
COPY . .
RUN pnpm install --frozen-lockfile
# `...` inclut les dépendances : les packages compilés sont surveillés en même
# temps que l'application, sinon une modification de `core` n'atteindrait jamais
# le processus en cours.
CMD ["pnpm", "turbo", "run", "dev", "--filter=@clemperl/api..."]

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo prune @clemperl/api --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# `turbo run build` construit d'abord @clemperl/core et @clemperl/db, dont l'API dépend :
# elle consomme leur `dist/`, pas leurs sources.
# Le client Prisma n'est pas versionné : il se génère pendant le build. `prisma
# generate` exige DATABASE_URL même sans ouvrir de connexion, d'où cette valeur de
# construction — elle ne sert qu'à satisfaire la configuration, jamais à se connecter.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm turbo run build --filter=@clemperl/api

FROM base AS runner
ENV NODE_ENV=production
COPY --from=pruner /app/out/json/ .
# `--prod` n'installe que les dépendances d'exécution : ni Jest, ni la CLI NestJS,
# ni supertest n'entrent dans l'image finale.
RUN pnpm install --frozen-lockfile --prod
COPY --from=installer /app/apps/api/dist ./apps/api/dist
COPY --from=installer /app/packages/core/dist ./packages/core/dist
COPY --from=installer /app/packages/db/dist ./packages/db/dist
USER node
EXPOSE 3003
CMD ["node", "apps/api/dist/main.js"]
