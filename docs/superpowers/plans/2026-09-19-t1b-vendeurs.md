# T1b — Vendeurs : demande d'ouverture et validation — Plan d'implémentation

> **Pour les agents d'exécution :** SOUS-SKILL REQUIS — `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans`, tâche par tâche. Les étapes sont des
> cases à cocher (`- [ ]`).

**Objectif** : qu'un compte vérifié dépose un dossier de candidature vendeur depuis le
storefront, et que l'administration l'accepte ou le refuse avec un motif — une
acceptation faisant naître la boutique et son propriétaire.

**Architecture** : deux entités (`vendor_applications` → `vendors`), les règles pures
dans le nouveau package `@clemperl/domain`, les séquences d'écriture dans des
repositories de `@clemperl/db` pour être testables contre un vrai PostgreSQL, et les
deux parcours en server actions Next — le storefront pour le dépôt, `apps/admin` pour la
décision. Les pièces justificatives vivent dans un bucket privé servi en développement
par un conteneur `supabase/storage-api`.

**Pile** : Next 16, React 19, NestJS 12 (non modifiée ici), Prisma 7, PostgreSQL,
Better Auth 1.7.5, Zod 4, next-intl 4, Vitest 5, Jest + Testcontainers, Playwright 1.63.

**Spec** : `docs/superpowers/specs/2026-09-19-t1b-vendeurs-design.md` — le plan argumente
depuis elle ; les deux se lisent ensemble.

---

## Contraintes globales

Elles valent pour **toutes** les tâches, sans être répétées dans chacune.

- **Un commit par tâche, squash décidé en fin de chantier.**
  `docs/conventions/git.md` impose normalement un commit unique par chantier, et nomme
  les workflows de skill comme le piège à éviter. **L'utilisateur a explicitement levé
  cette contrainte pour ce chantier** (message du 2026-09-19), ce que la convention
  autorise : « Une instruction utilisateur prime sur la consigne "commits fréquents"
  d'un outil ou d'un skill. » Chaque tâche se termine donc par un commit, et la
  réduction de l'historique — squash total ou regroupement par thème — se décide à la
  fin, avant l'ouverture de la PR. Tant que rien n'est poussé, `git reset --soft` reste
  disponible.
- **Messages de commit en anglais**, style conventionnel (`feat:`, `fix:`, `chore:`,
  `docs:`, `test:`), et **jamais de trailer d'attribution** `Co-Authored-By:` ni de
  ligne « Generated with … ». Cette règle-là n'est levée par rien.
- **La spec et ce plan** restent non suivis jusqu'au commit de la tâche qui les rend
  vrais ; ils partent avec le premier commit de code.
- **Branche** : `feat/vendor-applications`, déjà sortie. Ne pas en changer.
- **Langue** : documentation et commentaires de code en **français** ; message de commit,
  nom de branche et description de PR en **anglais**.
- **Commentaires — la contrainte la plus facile à enfreindre de ce plan.** Un commentaire
  dit **pourquoi ça doit rester ainsi**, au présent et sans date, en trois secondes de
  lecture. Il est **absent quand le code se suffit**. Sont interdits : les faits datés
  (« mesuré le … », « constaté le … »), toute comparaison avec un état antérieur, et
  toute référence à une section de document. Ce matériau-là va dans le message de commit
  ou dans `docs/pieges.md`, qui existent pour ça.

  **Les extraits de code de ce plan sont plus bavards que le code final ne doit l'être**
  : ils argumentent pour l'exécutant. Au moment d'écrire, garder la contrainte, jeter
  l'explication. Un bloc de six lignes de commentaire au-dessus de trois lignes de code
  est un signe que le code devrait être plus clair, pas que le commentaire est utile.
- **Nommage** : enums `E_` + MAJUSCULE_SNAKE, type dérivé `T` + PascalCase, interfaces
  `I` + PascalCase. Un enum par fichier dans `enums/`. Fichiers en kebab-case suffixés
  (`.utils.ts`, `.interface.ts`, `.constant.ts`, `.schema.ts`, `.error.ts`), sauf les
  fichiers imposés par Next (`page.tsx`, `layout.tsx`, `route.ts`).
- **Base de données** : tables au **pluriel**, colonnes en `snake_case` par `@map`, types
  enum au **singulier**, identifiants `cuid(2)`, `createdAt`/`updatedAt` systématiques —
  à l'exception documentée de `vendor_decisions`.
- **Erreurs** : jamais de phrase en dur dans un `throw`. Clé imbriquée par domaine
  (`errors.vendor_application.*`), contrat `II18nExceptionResponse`, sortie
  `message: string[]`. **Toute nouvelle clé est ajoutée en `fr` ET en `en` dans le même
  changement** (l'admin est livrée en `fr` seul : ses clés ne vont que dans `admin/fr.json`).
- **Aucune chaîne visible par l'utilisateur écrite en dur dans un composant.**
- **Seuils de couverture** : valeur **mesurée** après la tâche, jamais souhaitée. Le
  cliquet monte, il ne descend jamais. `pnpm verify:thresholds` après toute modification
  d'un `vitest.config.ts`.
- **TDD** : le test échoue d'abord, pour la bonne raison, avant toute implémentation.

### Commandes de référence

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
pnpm docker:up
pnpm test:e2e
docker compose --env-file .env -f docker/docker-compose.dev.yml down -v   # détruit les volumes
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
pnpm --filter @clemperl/db exec prisma migrate dev --name <nom>
pnpm --filter @clemperl/domain test
```

---

## Tâche 0 — `supabase/storage-api` en standalone — ✅ FAITE le 2026-09-19

**Réécrite après exécution.** La version d'origine de cette tâche supposait les variables
de l'ère CLI — `ANON_KEY`, `SERVICE_KEY`, `PGRST_JWT_SECRET`, `FILE_SIZE_LIMIT`,
`TENANT_ID`, `GLOBAL_S3_BUCKET` — et une image `v1.32.0` inventée. **Aucune de ces
variables n'existe en 1.79.** Ce qui suit est ce qui a réellement fonctionné.

**Fichiers réellement touchés :**
- Créé : `docker/storage/Dockerfile`, `docker/postgres/init/10-storage.sql`
- Modifié : `docker/postgres/Dockerfile`, `docker/docker-compose.dev.yml`,
  `.env.example`, `turbo.json`, `docker/README.md`

**Produit :** les services `storage` (port 5010) et `storage-init`, le bucket privé
`vendor-documents`, et les variables `STORAGE_URL`, `STORAGE_BUCKET`,
`STORAGE_JWT_SECRET`, `STORAGE_SERVICE_KEY`.

- [x] **Étape 1 : trouver la vraie configuration**

La CLI Supabase n'a pas été lancée : `.env.sample` et `docker-compose.yml` du dépôt
`supabase/storage` donnent la même information pour un centième du coût.

```bash
curl -sfL https://raw.githubusercontent.com/supabase/storage/master/.env.sample
docker inspect supabase/storage-api:v1.79.4 --format '{{range .Config.Env}}{{println .}}{{end}}'
```

L'image ne porte **aucune** variable par défaut hors `VERSION` : tout se configure au
compose. Les tags réels se listent par l'API de Docker Hub — `v1.79.4` au 2026-09-18.

- [x] **Étape 2 : donner à storage-api sa propre base ET le rôle `postgres`**

`docker/postgres/init/10-storage.sql`, copié dans `/docker-entrypoint-initdb.d/` par le
`Dockerfile` de PostgreSQL :

```sql
CREATE ROLE postgres SUPERUSER LOGIN PASSWORD 'postgres';
CREATE DATABASE storage OWNER postgres;
```

**C'est le rôle qui compte, et c'est ce que le spike a trouvé.** La migration
`storage-schema` de storage-api référence `postgres` **en dur**, quel que soit
`DB_SUPER_USER`. Notre superutilisateur s'appelant `clemperl`, le conteneur bouclait sur
`role "postgres" does not exist` et n'atteignait jamais l'état sain.

Les scripts d'init ne sont joués qu'à la **création du volume** : toute modification
impose un `down -v`.

- [x] **Étape 3 : le service `storage`**

Variables réellement nécessaires, toutes vérifiées à l'exécution :

| Variable | Valeur | Pourquoi |
|---|---|---|
| `SERVER_PORT` / `SERVER_HOST` | `5000` / `0.0.0.0` | publié en 5010 sur l'hôte |
| `TENANT_ID` | `clemperl` | sinon un segment de chemin nommé `undefined` |
| `STORAGE_S3_BUCKET` | `clemperl` | racine des objets **même en backend fichier** — héritage S3 |
| `AUTH_JWT_SECRET` / `AUTH_JWT_ALGORITHM` | secret / `HS256` | l'authentification est un JWT, il n'y a plus de `SERVICE_KEY` en propre |
| `DATABASE_URL` | `postgresql://postgres:postgres@postgres:5432/storage` | l'utilisateur `postgres` créé à l'étape 2 |
| `DB_INSTALL_ROLES` / `DB_SUPER_USER` | `true` / `postgres` | il installe `anon`, `service_role`, `authenticated` |
| `STORAGE_BACKEND` / `STORAGE_FILE_BACKEND_PATH` | `file` / `/var/lib/storage` | des fichiers dans un volume |
| `UPLOAD_FILE_SIZE_LIMIT` | `5242880` | la même valeur que le domaine, sinon deux plafonds divergents |
| `IMAGE_TRANSFORMATION_ENABLED` | `false` | réclamerait imgproxy, inutile pour des justificatifs |

Sonde de santé : `node -e "fetch('http://127.0.0.1:5000/status')…"`. Ni `curl` ni `wget`
ne sont garantis dans l'image ; `node` y est par construction.

- [x] **Étape 4 : la clé de service est un JWT à fabriquer**

Il n'existe pas de « clé de service » distincte : c'est un JWT `HS256` portant
`role: service_role`, signé par `AUTH_JWT_SECRET`. Celui du dépôt est une **constante**
— `iat` et `exp` fixes — pour être reproductible à l'identique sur toute machine.
Recette dans `docker/README.md`.

- [x] **Étape 5 : `storage-init`, pour que `pnpm docker:up` suffise**

Un service à usage unique crée le bucket après que `storage` est sain. **Piège mesuré :
une création en double renvoie HTTP 400**, le 409 n'étant que dans le corps
(`code: "BucketAlreadyExists"`). Tester le code HTTP ferait échouer tout second
démarrage. Et le script ne doit contenir **aucun littéral de gabarit JavaScript** :
docker compose interpole `${...}` avant que node ne voie la ligne.

- [x] **Étape 6 : preuve à l'exécution**

```bash
docker compose --env-file .env -f docker/docker-compose.dev.yml down -v
docker compose --env-file .env -f docker/docker-compose.dev.yml up -d --build postgres storage storage-init
```

Constaté : `storage` **healthy**, `storage-init` en code de sortie **0**, bucket
`vendor-documents` créé et **privé**, téléversement puis relecture d'un objet en 200,
URL signée fonctionnelle, fichier présent sous
`/var/lib/storage/clemperl/clemperl/vendor-documents/…`, et second démarrage sans échec.

## Tâche 1 — Les tables passent au pluriel

**Pourquoi maintenant** : coût nul aujourd'hui (quatre tables, aucune donnée réelle,
aucun environnement persistant), coût croissant ensuite. Fait avant d'ajouter cinq tables
de plus.

**Fichiers :**
- Modifier : `packages/db/prisma/schema.prisma`
- Supprimer : `packages/db/prisma/migrations/20260918085917_init/`
- Supprimer : `packages/db/prisma/migrations/20260918170535_auth/`
- Créer : `packages/db/prisma/migrations/<horodatage>_init/migration.sql` (régénérée)
- Modifier : `apps/api/src/modules/auth/schema-identite.int-spec.ts:26`
- Modifier : `docs/superpowers/specs/2026-09-17-t0-fondations-monorepo-design.md`
- Modifier : `docs/pieges.md`

**Interfaces :**
- Consomme : rien.
- Produit : les tables `users`, `sessions`, `accounts`, `verifications`. Les **modèles
  Prisma ne changent pas de nom** (`User`, `Session`, `Account`, `Verification`) : Better
  Auth s'adresse aux modèles, `@@map` ne renomme que la table.

- [ ] **Étape 1 : changer les `@@map`**

Dans `packages/db/prisma/schema.prisma` : `@@map("user")` → `@@map("users")`, et de même
pour `session`, `account`, `verification`. **Ne pas toucher aux `@@map` des enums** :
`user_role` reste au singulier, un type nommant la nature d'une valeur et non une
collection.

Réécrire le commentaire d'en-tête, qui énonce aujourd'hui la règle inverse :

```prisma
// Source de vérité du modèle de données. Les noms de tables sont au pluriel et dans le
// schéma `public` ; les types enum restent au singulier, un type nommant la nature
// d'une valeur et non une collection. Cloisonner par schémas PostgreSQL se décide avant
// les premières migrations, pas après.
```

Supprimer le commentaire sur `"user"` mot réservé SQL, posé sur le modèle `User` : il
devient faux, `users` n'ayant pas à être quoté.

- [ ] **Étape 2 : régénérer les migrations sur une base neuve**

Réécrire le SQL à la main produirait `users` avec `user_pkey` — Prisma dérive les noms
d'index et de contraintes du nom de table mappé. La régénération fusionne au passage les
deux migrations en une seule, la seconde n'existant que pour défaire la table `user` de
T0.

```bash
docker compose --env-file .env -f docker/docker-compose.dev.yml down -v
rm -rf packages/db/prisma/migrations/20260918085917_init \
       packages/db/prisma/migrations/20260918170535_auth
docker compose --env-file .env -f docker/docker-compose.dev.yml up -d postgres storage storage-init

# `postgres` ne publie AUCUN port : Prisma ne peut pas l'atteindre depuis l'hôte, et
# `pnpm --filter @clemperl/db db:migrate` échoue donc malgré les apparences. La création
# d'une migration passe par un conteneur jetable sur le réseau du compose. `--user` évite
# des fichiers appartenant à root ; `bookworm-slim` et non `alpine`, les moteurs Prisma
# de l'hôte étant liés à la glibc. Voir `docs/pieges.md`.
docker run --rm --network clemperl_dev_default \
  --user "$(id -u):$(id -g)" -v "$PWD":/app -w /app/packages/db \
  -e DATABASE_URL="postgresql://clemperl:clemperl@postgres:5432/clemperl" \
  -e HOME=/tmp \
  node:24-bookworm-slim ./node_modules/.bin/prisma migrate dev --name init
```

**La même commande servira en tâche 5** pour créer la migration des tables vendeur.

- [ ] **Étape 3 : vérifier qu'aucun identifiant n'est resté au singulier**

```bash
grep -oE '"[a-zA-Z_]+"' packages/db/prisma/migrations/*/migration.sql | sed 's/.*://' | sort -u
```

Attendu : `users`, `sessions`, `accounts`, `verifications`, `users_pkey`,
`sessions_user_id_fkey`, `user_role`… Aucune occurrence de `"user"`, `"session"`,
`"account"` ou `"verification"` seuls.

- [ ] **Étape 4 : corriger la requête SQL écrite à la main**

`apps/api/src/modules/auth/schema-identite.int-spec.ts:26` fait un `INSERT INTO "user"`.
Remplacer par `INSERT INTO users` — les guillemets ne sont plus nécessaires, et les
retirer documente que le mot réservé n'est plus en cause.

- [ ] **Étape 5 : faire tourner la suite d'intégration**

```bash
pnpm docker:up
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
```

Attendu : tout passe. Un échec sur « relation "user" does not exist » signale une
occurrence oubliée.

- [ ] **Étape 6 : vérification complète**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
```

- [ ] **Étape 7 : corriger les documents qui énoncent l'ancienne règle**

Dans `docs/superpowers/specs/2026-09-17-t0-fondations-monorepo-design.md`, la section du
modèle de données affirme le singulier : ajouter une note datée renvoyant à la décision
de T1b, sans réécrire l'histoire de T0.

Dans `docs/pieges.md`, l'entrée qui mentionne la table `user` : mettre le nom à jour et
noter que le mot réservé n'est plus un piège depuis le passage au pluriel.

- [ ] **Étape 8 : commit**

```bash
git add packages/db/ apps/api/src/modules/auth/schema-identite.int-spec.ts docs/
git commit -m "refactor(db): rename tables to plural and squash migrations"
```

---

## Tâche 2 — `@clemperl/db/enums` : une sortie sans client Prisma

**Pourquoi** : le schéma Zod de dépôt sera partagé entre le formulaire (navigateur) et la
server action (serveur). `@clemperl/db` n'expose aujourd'hui qu'`index.ts`, qui réexporte
`generated/prisma/client.js` — donc le client Prisma et l'adaptateur `pg`. Un composant
client important le schéma ferait entrer Prisma dans le paquet navigateur : exactement le
piège que `apps/storefront/src/lib/auth-client.ts` documente pour `@clemperl/auth`.

**Fichiers :**
- Modifier : `packages/db/package.json`
- Modifier : `packages/db/src/index.ts`

**Interfaces :**
- Consomme : rien.
- Produit : le point d'entrée `@clemperl/db/enums`, qui exporte les objets d'énumération
  générés par Prisma (`E_USER_ROLE`, puis ceux de la tâche 5) **sans aucun runtime**.

- [ ] **Étape 1 : déclarer la sortie**

Dans `packages/db/package.json`, remplacer le bloc `exports` :

```json
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./enums": {
      "types": "./dist/generated/prisma/enums.d.ts",
      "default": "./dist/generated/prisma/enums.js"
    }
  },
```

**Le générateur `prisma-client` émet du TypeScript, pas du JavaScript** : `generated/`
contient `enums.ts`, et c'est le `build` du package qui produit
`dist/generated/prisma/enums.js`. La sortie pointe donc vers `dist/`, comme le point
d'entrée principal.

- [ ] **Étape 2 : construire et prouver que le module est inerte**

```bash
pnpm --filter @clemperl/db build
grep -cE "^\s*(import|export)\s+.*\bfrom\b" packages/db/dist/generated/prisma/enums.js
grep -cE "^\s*(import|export)\s+.*\bfrom\b" packages/db/dist/generated/prisma/enums.d.ts
```

Attendu : `0`, pour le `.js` comme pour le `.d.ts`. **Un module sans aucun import ne peut
pas entraîner le client** — preuve statique, non réfutable par un cas de test oublié.
Prisma le confirme d'ailleurs en tête du fichier généré : « 🟢 You can import this file
directly ».

Si le compte n'est pas nul, lire les imports : s'ils pointent vers `./client.js` ou
`./internal/`, la parade tombe et il faut basculer sur le repli écrit en spec — le schéma
Zod reste serveur, et le formulaire valide au retour de la server action.

- [ ] **Étape 3 : vérifier la résolution depuis un consommateur**

```bash
node --input-type=module -e "import('@clemperl/db/enums').then(m => console.log(Object.keys(m)))"
```

Attendu : la liste contient `E_USER_ROLE`. Une erreur `ERR_PACKAGE_PATH_NOT_EXPORTED`
signale un `exports` mal formé ; une erreur `ERR_MODULE_NOT_FOUND` signale que le build
n'a pas tourné.

- [ ] **Étape 4 : vérification et commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add packages/db/
git commit -m "feat(db): expose a runtime-free enums entry point"
```

---

## Tâche 3 — `@clemperl/domain` : le package et la machine à états

**Fichiers :**
- Créer : `packages/domain/package.json`, `tsconfig.json`, `tsconfig.build.json`,
  `eslint.config.js`, `vitest.config.ts`
- Créer : `packages/core/src/errors/erreur-domaine.error.ts`, `packages/core/src/errors/index.ts`
- Modifier : `packages/core/src/index.ts`
- Créer : `packages/domain/src/types/statut-dossier.type.ts`
- Créer : `packages/domain/src/constants/transitions-dossier.constant.ts`
- Créer : `packages/domain/src/errors/erreurs-dossier.error.ts`
- Créer : `packages/domain/src/utils/transitions-dossier.utils.ts`
- Test : `packages/domain/src/utils/transitions-dossier.utils.spec.ts`
- Créer : `packages/domain/src/index.ts` et les `index.ts` de chaque dossier

**Interfaces :**
- Consomme : `@clemperl/db/enums` (tâche 2), `II18nExceptionResponse` de `@clemperl/core`.
- Produit :
  - `ErreurDomaine` (core) — `new ErreurDomaine({ i18nKey, i18nArgs?, fallbackMessage? })`
  - `TStatutDossier` — `"SUBMITTED" | "ACCEPTED" | "REJECTED"`
  - `E_ACTION_DOSSIER` / `TActionDossier` — `"ACCEPTER" | "REFUSER" | "RESOUMETTRE"`
  - `peutTransitionner(depuis: TStatutDossier, action: TActionDossier): boolean`
  - `appliquerTransition(depuis: TStatutDossier, action: TActionDossier): TStatutDossier`
  - `ErreurTransitionInterdite`

- [ ] **Étape 1 : poser `ErreurDomaine` dans `@clemperl/core`**

Créer `packages/core/src/errors/erreur-domaine.error.ts` :

```typescript
import type { II18nExceptionResponse } from "../interfaces/index.js";

// Le domaine lève cette erreur et jamais une exception de framework. Importer
// `@nestjs/common` depuis un package que consomme aussi un composant Next ferait entrer
// Nest dans le paquet envoyé au navigateur ; à l'inverse, une exception Next serait
// illisible côté API. Le filtre global de Nest et le retour de server action traduisent
// chacun ce payload de leur côté.
export class ErreurDomaine extends Error implements II18nExceptionResponse {
    readonly i18nKey: string;
    readonly i18nArgs?: Record<string, unknown>;
    readonly fallbackMessage?: string;

    constructor(reponse: II18nExceptionResponse) {
        // `fallbackMessage` sert de message natif : une erreur qui remonte dans un log
        // sans passer par la traduction reste lisible par un humain.
        super(reponse.fallbackMessage ?? reponse.i18nKey);
        this.name = new.target.name;
        this.i18nKey = reponse.i18nKey;
        this.i18nArgs = reponse.i18nArgs;
        this.fallbackMessage = reponse.fallbackMessage;
    }
}
```

Créer `packages/core/src/errors/index.ts` avec `export * from "./erreur-domaine.error.js";`
et ajouter `export * from "./errors/index.js";` à `packages/core/src/index.ts`.

- [ ] **Étape 2 : échafauder le package**

`packages/domain/package.json` — calqué sur `packages/core`, qui est compilé et expose
`dist/` parce que `apps/api` l'exécute sur Node :

```json
{
  "name": "@clemperl/domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --coverage",
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsc -p tsconfig.build.json --watch --preserveWatchOutput"
  },
  "dependencies": {
    "@clemperl/core": "workspace:*",
    "@clemperl/db": "workspace:*",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@clemperl/eslint-config": "workspace:*",
    "@clemperl/tsconfig": "workspace:*",
    "@vitest/coverage-v8": "5.0.1",
    "eslint": "10.10.0",
    "typescript": "6.0.3",
    "vitest": "5.0.1"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

`tsconfig.json` :

```json
{
  "extends": "@clemperl/tsconfig/base.json",
  "include": ["src/**/*.ts"]
}
```

`tsconfig.build.json` :

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    // Comme `core`, ce package est consommé par `apps/api` qui exécute du JavaScript sur
    // Node : il doit émettre du JS et ses déclarations, et non se contenter d'être
    // transpilé par Next.
    "noEmit": false,
    "declaration": true,
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "exclude": ["**/*.spec.ts", "dist"]
}
```

`eslint.config.js` :

```javascript
import config from "@clemperl/eslint-config";
export default config;
```

`vitest.config.ts` — le seuil part à 0 et sera **relevé à la valeur mesurée** en fin de
tâche 4 ; l'inscrire haut d'emblée ferait échouer le premier run et inviterait à
l'abaisser, ce qui est exactement le geste que le cliquet interdit :

```typescript
// Seuils de couverture : plancher mesuré, jamais souhaité. Il monte, jamais il ne descend.
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            // `include` est indispensable : sans lui, le fournisseur v8 ne mesure que les
            // fichiers effectivement chargés par un test, et un fichier livré sans test
            // n'apparaît pas dans le rapport.
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["**/index.ts", "**/*.config.ts"],
            thresholds: { statements: 0, branches: 0, functions: 0, lines: 0 },
        },
    },
});
```

```bash
pnpm install
```

- [ ] **Étape 3 : écrire le test de la machine à états, qui doit échouer**

Créer `packages/domain/src/utils/transitions-dossier.utils.spec.ts` :

```typescript
import { describe, expect, it } from "vitest";
import { E_ACTION_DOSSIER } from "../constants/index.js";
import { ErreurTransitionInterdite } from "../errors/index.js";
import { appliquerTransition, peutTransitionner } from "./transitions-dossier.utils.js";

describe("transitions du dossier vendeur", () => {
    it("accepte un dossier soumis", () => {
        expect(appliquerTransition("SUBMITTED", E_ACTION_DOSSIER.ACCEPTER)).toBe("ACCEPTED");
    });

    it("refuse un dossier soumis", () => {
        expect(appliquerTransition("SUBMITTED", E_ACTION_DOSSIER.REFUSER)).toBe("REJECTED");
    });

    it("laisse resoumettre un dossier refusé", () => {
        expect(appliquerTransition("REJECTED", E_ACTION_DOSSIER.RESOUMETTRE)).toBe("SUBMITTED");
    });

    // `ACCEPTED` est terminal : la boutique existe, c'est elle qui évolue désormais.
    it("n'autorise plus rien sur un dossier accepté", () => {
        expect(peutTransitionner("ACCEPTED", E_ACTION_DOSSIER.REFUSER)).toBe(false);
        expect(() => appliquerTransition("ACCEPTED", E_ACTION_DOSSIER.RESOUMETTRE)).toThrow(
            ErreurTransitionInterdite,
        );
    });

    // Ferme la porte au double dépôt par impatience.
    it("n'autorise pas de resoumettre un dossier déjà soumis", () => {
        expect(peutTransitionner("SUBMITTED", E_ACTION_DOSSIER.RESOUMETTRE)).toBe(false);
    });

    it("n'autorise pas de décider deux fois", () => {
        expect(peutTransitionner("REJECTED", E_ACTION_DOSSIER.REFUSER)).toBe(false);
    });

    it("porte une clé de traduction et l'état refusé dans l'erreur", () => {
        try {
            appliquerTransition("ACCEPTED", E_ACTION_DOSSIER.REFUSER);
            expect.unreachable("la transition aurait dû être refusée");
        } catch (erreur) {
            expect(erreur).toBeInstanceOf(ErreurTransitionInterdite);
            expect((erreur as ErreurTransitionInterdite).i18nKey).toBe(
                "errors.vendor_application.forbidden_transition",
            );
            expect((erreur as ErreurTransitionInterdite).i18nArgs).toEqual({
                depuis: "ACCEPTED",
                action: "REFUSER",
            });
        }
    });
});
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il échoue pour la bonne raison**

```bash
pnpm --filter @clemperl/domain test
```

Attendu : ÉCHEC à la résolution — `Cannot find module './transitions-dossier.utils.js'`.
Un échec d'assertion à ce stade signalerait que les fichiers existent déjà.

- [ ] **Étape 5 : écrire le type, les constantes et les erreurs**

`packages/domain/src/types/statut-dossier.type.ts` :

```typescript
import { E_VENDOR_APPLICATION_STATUS } from "@clemperl/db/enums";

// Le type est dérivé de l'énumération générée par Prisma plutôt que réécrit : une valeur
// ajoutée au schéma se propage ici sans que personne ait à y penser, et une valeur
// retirée casse la compilation là où elle est encore attendue.
export type TStatutDossier =
    (typeof E_VENDOR_APPLICATION_STATUS)[keyof typeof E_VENDOR_APPLICATION_STATUS];
```

`packages/domain/src/constants/transitions-dossier.constant.ts` :

```typescript
import type { TStatutDossier } from "../types/statut-dossier.type.js";

export const E_ACTION_DOSSIER = {
    ACCEPTER: "ACCEPTER",
    REFUSER: "REFUSER",
    RESOUMETTRE: "RESOUMETTRE",
} as const;

export type TActionDossier = (typeof E_ACTION_DOSSIER)[keyof typeof E_ACTION_DOSSIER];

// La table est une DONNÉE, pas une cascade de `if` : la lire suffit à connaître tout le
// système, et une transition manquante se voit à l'œil plutôt que de se déduire d'un
// branchement absent. Un état sans entrée est terminal.
export const TRANSITIONS_DOSSIER: Readonly<
    Record<TStatutDossier, Partial<Record<TActionDossier, TStatutDossier>>>
> = {
    SUBMITTED: {
        [E_ACTION_DOSSIER.ACCEPTER]: "ACCEPTED",
        [E_ACTION_DOSSIER.REFUSER]: "REJECTED",
    },
    REJECTED: {
        [E_ACTION_DOSSIER.RESOUMETTRE]: "SUBMITTED",
    },
    ACCEPTED: {},
};
```

`packages/domain/src/errors/erreurs-dossier.error.ts` :

```typescript
import { ErreurDomaine } from "@clemperl/core";
import type { TActionDossier } from "../constants/index.js";
import type { TStatutDossier } from "../types/statut-dossier.type.js";

export class ErreurTransitionInterdite extends ErreurDomaine {
    constructor(depuis: TStatutDossier, action: TActionDossier) {
        super({
            i18nKey: "errors.vendor_application.forbidden_transition",
            i18nArgs: { depuis, action },
            fallbackMessage: `Transition ${action} interdite depuis l'état ${depuis}.`,
        });
    }
}
```

Créer les `index.ts` de `types/`, `constants/`, `errors/` et `utils/`, puis
`packages/domain/src/index.ts` :

```typescript
export * from "./constants/index.js";
export * from "./errors/index.js";
export * from "./types/index.js";
export * from "./utils/index.js";
```

- [ ] **Étape 6 : écrire l'implémentation minimale**

`packages/domain/src/utils/transitions-dossier.utils.ts` :

```typescript
import { TRANSITIONS_DOSSIER, type TActionDossier } from "../constants/index.js";
import { ErreurTransitionInterdite } from "../errors/index.js";
import type { TStatutDossier } from "../types/statut-dossier.type.js";

export function peutTransitionner(
    depuis: TStatutDossier,
    action: TActionDossier,
): boolean {
    return TRANSITIONS_DOSSIER[depuis][action] !== undefined;
}

export function appliquerTransition(
    depuis: TStatutDossier,
    action: TActionDossier,
): TStatutDossier {
    const vers = TRANSITIONS_DOSSIER[depuis][action];
    if (vers === undefined) {
        throw new ErreurTransitionInterdite(depuis, action);
    }
    return vers;
}
```

- [ ] **Étape 7 : lancer le test et vérifier qu'il passe**

```bash
pnpm --filter @clemperl/domain test
```

Attendu : 7 tests au vert.

- [ ] **Étape 8 : déclarer les clés de traduction**

Dans `packages/i18n/messages/storefront/fr.json` et `en.json`, ajouter sous `errors` la
clé `vendor_application.forbidden_transition`. Dans
`packages/i18n/messages/admin/fr.json`, la même clé — l'admin étant livrée en français
seul, elle n'a pas de pendant anglais.

```json
{
  "errors": {
    "vendor_application": {
      "forbidden_transition": "Ce dossier a déjà été traité."
    }
  }
}
```

Version anglaise : `"This application has already been processed."`

- [ ] **Étape 9 : vérification et commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
git add packages/domain/ packages/core/ packages/i18n/ pnpm-lock.yaml
git commit -m "feat(domain): add the package and the vendor application state machine"
```

---

## Tâche 4 — Le domaine : recevabilité, décision, permissions, slug

**Fichiers :**
- Créer : `packages/domain/src/interfaces/dossier-vendeur.interface.ts`
- Créer : `packages/domain/src/interfaces/violation-dossier.interface.ts`
- Créer : `packages/domain/src/constants/pieces-obligatoires.constant.ts`
- Créer : `packages/domain/src/schemas/depot-dossier.schema.ts`
- Créer : `packages/domain/src/utils/validation-dossier.utils.ts` (+ `.spec.ts`)
- Créer : `packages/domain/src/utils/decision-vendeur.utils.ts` (+ `.spec.ts`)
- Créer : `packages/domain/src/utils/permissions-vendeur.utils.ts` (+ `.spec.ts`)
- Créer : `packages/domain/src/utils/slug-boutique.utils.ts` (+ `.spec.ts`)
- Modifier : `packages/domain/src/errors/erreurs-dossier.error.ts`
- Modifier : `packages/domain/vitest.config.ts` (seuils mesurés)

**Interfaces :**
- Consomme : tâche 3 (`ErreurDomaine`, `TStatutDossier`).
- Produit :
  - `IPieceDeposee { kind: TNatureDocument; mimeType: string; sizeBytes: number }`
  - `IViolationDossier { i18nKey: string; i18nArgs?: Record<string, unknown> }`
  - `schemaDepotDossier` (Zod) et `TDepotDossier = z.infer<typeof schemaDepotDossier>`
  - `validerDossier(champs: TDepotDossier, pieces: IPieceDeposee[]): IViolationDossier[]`
  - `validerDecision(entree: IDecisionSoumise): void` — lève `ErreurDecisionInvalide`
  - `peutVoirDossier`, `peutDecider`, `peutResoumettre`, `estMembreDe`
  - `slugifierNomBoutique(nom: string): string`

- [ ] **Étape 1 : écrire les tests de recevabilité, qui doivent échouer**

Créer `packages/domain/src/utils/validation-dossier.utils.spec.ts` :

```typescript
import { describe, expect, it } from "vitest";
import { validerDossier } from "./validation-dossier.utils.js";
import type { IPieceDeposee } from "../interfaces/index.js";

const CHAMPS = {
    shopName: "Chez Clem",
    shopDescription: "Maroquinerie artisanale depuis 2019.",
    contactEmail: "contact@chezclem.test",
    contactPhone: "+32470000000",
    categories: ["LEATHER_GOODS"] as const,
    legalForm: "SRL",
    legalName: "Chez Clem SRL",
    registrationNumber: "0123456789",
    taxNumber: "BE0123456789",
    country: "BE",
    locale: "fr",
};

const PIECES: IPieceDeposee[] = [
    { kind: "REGISTRY", mimeType: "application/pdf", sizeBytes: 120_000 },
    { kind: "IDENTITY", mimeType: "image/jpeg", sizeBytes: 90_000 },
];

describe("recevabilité d'un dossier", () => {
    it("accepte un dossier complet", () => {
        expect(validerDossier(CHAMPS, PIECES)).toEqual([]);
    });

    it("exige le registre de commerce", () => {
        const sansRegistre = PIECES.filter((piece) => piece.kind !== "REGISTRY");
        expect(validerDossier(CHAMPS, sansRegistre)).toEqual([
            {
                i18nKey: "errors.vendor_application.missing_document",
                i18nArgs: { nature: "REGISTRY" },
            },
        ]);
    });

    // `TAX` est facultative : un dossier sans elle reste recevable.
    it("n'exige pas l'attestation fiscale", () => {
        expect(validerDossier(CHAMPS, PIECES)).toEqual([]);
    });

    it("refuse une pièce trop lourde", () => {
        const tropLourde = [...PIECES, {
            kind: "TAX" as const,
            mimeType: "application/pdf",
            sizeBytes: 6 * 1024 * 1024,
        }];
        expect(validerDossier(CHAMPS, tropLourde)).toEqual([
            {
                i18nKey: "errors.vendor_application.document_too_large",
                i18nArgs: { nature: "TAX", maximum: 5 * 1024 * 1024 },
            },
        ]);
    });

    it("refuse un type de fichier non prévu", () => {
        const mauvaisType = [
            { kind: "REGISTRY" as const, mimeType: "application/zip", sizeBytes: 1000 },
            PIECES[1]!,
        ];
        expect(validerDossier(CHAMPS, mauvaisType)).toEqual([
            {
                i18nKey: "errors.vendor_application.unsupported_media_type",
                i18nArgs: { nature: "REGISTRY", type: "application/zip" },
            },
        ]);
    });

    // Une seule pièce par nature : deux registres poseraient la question de savoir
    // lequel fait foi, et le dossier est censé être sans ambiguïté.
    it("refuse deux pièces de même nature", () => {
        const doublon = [...PIECES, PIECES[0]!];
        expect(validerDossier(CHAMPS, doublon)).toEqual([
            {
                i18nKey: "errors.vendor_application.duplicate_document",
                i18nArgs: { nature: "REGISTRY" },
            },
        ]);
    });

    it("cumule les violations plutôt que de s'arrêter à la première", () => {
        expect(validerDossier(CHAMPS, [])).toHaveLength(2);
    });
});
```

- [ ] **Étape 2 : lancer et vérifier l'échec**

```bash
pnpm --filter @clemperl/domain test
```

Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : écrire les interfaces et constantes**

`packages/domain/src/interfaces/violation-dossier.interface.ts` :

```typescript
// Une violation n'est pas une phrase : c'est une clé et ses arguments. La server action
// la rend au format `message: string[]` après traduction, et le domaine n'a jamais à
// connaître la langue de son appelant.
export interface IViolationDossier {
    i18nKey: string;
    i18nArgs?: Record<string, unknown>;
}
```

`packages/domain/src/interfaces/dossier-vendeur.interface.ts` :

```typescript
import { E_VENDOR_DOCUMENT_KIND } from "@clemperl/db/enums";

export type TNatureDocument =
    (typeof E_VENDOR_DOCUMENT_KIND)[keyof typeof E_VENDOR_DOCUMENT_KIND];

// La forme minimale que le domaine a besoin de connaître d'une pièce. Ni le chemin de
// l'objet ni son nom d'origine n'y figurent : ils n'entrent dans aucune règle, et les
// faire transiter ici obligerait à les fabriquer pour écrire un test.
export interface IPieceDeposee {
    kind: TNatureDocument;
    mimeType: string;
    sizeBytes: number;
}
```

`packages/domain/src/constants/pieces-obligatoires.constant.ts` :

```typescript
import type { TNatureDocument } from "../interfaces/index.js";

// Le registre de commerce et la pièce d'identité du représentant fondent la décision ;
// l'attestation fiscale est un complément que tous les pays n'imposent pas.
export const PIECES_OBLIGATOIRES: readonly TNatureDocument[] = ["REGISTRY", "IDENTITY"];

// 5 Mo par pièce. Ce plafond n'est pas décoratif : il est la moitié de ce que la server
// action accepte en corps de requête, et le dépasser côté domaine ferait échouer le
// téléversement avec une erreur de plateforme illisible plutôt qu'un message métier.
export const TAILLE_MAX_PIECE_OCTETS = 5 * 1024 * 1024;

// Un scan de document est un PDF ou une photo. Le ZIP est exclu volontairement : il
// masque son contenu à la validation et oblige l'administration à extraire avant de lire.
export const TYPES_MIME_ACCEPTES: readonly string[] = [
    "application/pdf",
    "image/jpeg",
    "image/png",
];
```

- [ ] **Étape 4 : écrire le schéma Zod partagé**

`packages/domain/src/schemas/depot-dossier.schema.ts` :

```typescript
import { E_VENDOR_CATEGORY } from "@clemperl/db/enums";
import { z } from "zod";

// Ce schéma est importé par le formulaire ET par la server action. C'est la raison
// d'être de `@clemperl/db/enums` : importer les énumérations depuis le point d'entrée
// principal de `@clemperl/db` ferait entrer le client Prisma dans le paquet navigateur.
export const schemaDepotDossier = z.object({
    shopName: z.string().trim().min(2).max(80),
    shopDescription: z.string().trim().min(20).max(2000),
    contactEmail: z.email(),
    contactPhone: z.string().trim().min(6).max(30),
    categories: z
        .array(z.enum(Object.values(E_VENDOR_CATEGORY) as [string, ...string[]]))
        .min(1),
    legalForm: z.string().trim().min(2).max(60),
    legalName: z.string().trim().min(2).max(160),
    registrationNumber: z.string().trim().min(4).max(40),
    taxNumber: z.string().trim().max(40).optional(),
    country: z.string().trim().length(2).toUpperCase(),
    locale: z.enum(["fr", "en"]),
});

export type TDepotDossier = z.infer<typeof schemaDepotDossier>;
```

- [ ] **Étape 5 : écrire la validation**

`packages/domain/src/utils/validation-dossier.utils.ts` :

```typescript
import {
    PIECES_OBLIGATOIRES,
    TAILLE_MAX_PIECE_OCTETS,
    TYPES_MIME_ACCEPTES,
} from "../constants/index.js";
import type { IPieceDeposee, IViolationDossier } from "../interfaces/index.js";
import type { TDepotDossier } from "../schemas/index.js";

// Les violations sont CUMULÉES et non levées une par une : un candidat qui corrige son
// dossier a besoin de la liste entière, sinon il repart pour un aller-retour par faute.
export function validerDossier(
    _champs: TDepotDossier,
    pieces: readonly IPieceDeposee[],
): IViolationDossier[] {
    const violations: IViolationDossier[] = [];
    const vues = new Set<string>();

    for (const nature of PIECES_OBLIGATOIRES) {
        if (!pieces.some((piece) => piece.kind === nature)) {
            violations.push({
                i18nKey: "errors.vendor_application.missing_document",
                i18nArgs: { nature },
            });
        }
    }

    for (const piece of pieces) {
        if (vues.has(piece.kind)) {
            violations.push({
                i18nKey: "errors.vendor_application.duplicate_document",
                i18nArgs: { nature: piece.kind },
            });
        }
        vues.add(piece.kind);

        if (!TYPES_MIME_ACCEPTES.includes(piece.mimeType)) {
            violations.push({
                i18nKey: "errors.vendor_application.unsupported_media_type",
                i18nArgs: { nature: piece.kind, type: piece.mimeType },
            });
        }

        if (piece.sizeBytes > TAILLE_MAX_PIECE_OCTETS) {
            violations.push({
                i18nKey: "errors.vendor_application.document_too_large",
                i18nArgs: { nature: piece.kind, maximum: TAILLE_MAX_PIECE_OCTETS },
            });
        }
    }

    return violations;
}
```

Les champs sont déjà validés par Zod au moment où cette fonction est appelée ; le
paramètre est conservé (préfixé `_`) parce que les règles à venir — un numéro
d'enregistrement dont le format dépend du pays, par exemple — en auront besoin, et que
changer la signature plus tard toucherait tous les appelants.

- [ ] **Étape 6 : lancer et vérifier que les 7 tests passent**

```bash
pnpm --filter @clemperl/domain test
```

- [ ] **Étape 7 : écrire les tests de décision, qui doivent échouer**

Créer `packages/domain/src/utils/decision-vendeur.utils.spec.ts` :

```typescript
import { describe, expect, it } from "vitest";
import { ErreurDecisionInvalide } from "../errors/index.js";
import { validerDecision } from "./decision-vendeur.utils.js";

const BASE = { decideurId: "adm_1", candidatId: "usr_1" };

describe("validité d'une décision", () => {
    it("accepte une acceptation sans raison", () => {
        expect(() => validerDecision({ ...BASE, decision: "ACCEPTED" })).not.toThrow();
    });

    it("refuse une acceptation porteuse d'une raison de refus", () => {
        expect(() =>
            validerDecision({ ...BASE, decision: "ACCEPTED", raison: "OTHER" }),
        ).toThrowError(
            expect.objectContaining({
                i18nKey: "errors.vendor_application.reason_forbidden_on_accept",
            }),
        );
    });

    it("exige une raison codée sur un refus", () => {
        expect(() => validerDecision({ ...BASE, decision: "REJECTED" })).toThrowError(
            expect.objectContaining({ i18nKey: "errors.vendor_application.reason_required" }),
        );
    });

    it("accepte un refus avec une raison codée", () => {
        expect(() =>
            validerDecision({ ...BASE, decision: "REJECTED", raison: "INCOMPLETE_FILE" }),
        ).not.toThrow();
    });

    // `OTHER` ne dit rien au candidat : sans commentaire, le refus est incompréhensible
    // et la resoumission est un coup de dés.
    it("exige un commentaire quand la raison est OTHER", () => {
        expect(() =>
            validerDecision({ ...BASE, decision: "REJECTED", raison: "OTHER" }),
        ).toThrowError(
            expect.objectContaining({ i18nKey: "errors.vendor_application.comment_required" }),
        );
        expect(() =>
            validerDecision({
                ...BASE,
                decision: "REJECTED",
                raison: "OTHER",
                commentaire: "   ",
            }),
        ).toThrow(ErreurDecisionInvalide);
        expect(() =>
            validerDecision({
                ...BASE,
                decision: "REJECTED",
                raison: "OTHER",
                commentaire: "Activité hors périmètre de la place de marché.",
            }),
        ).not.toThrow();
    });

    it("interdit de décider sur son propre dossier", () => {
        expect(() =>
            validerDecision({ decideurId: "usr_1", candidatId: "usr_1", decision: "ACCEPTED" }),
        ).toThrowError(
            expect.objectContaining({ i18nKey: "errors.vendor_application.self_decision" }),
        );
    });
});
```

- [ ] **Étape 8 : implémenter la décision**

Ajouter à `packages/domain/src/errors/erreurs-dossier.error.ts` :

```typescript
export class ErreurDecisionInvalide extends ErreurDomaine {
    constructor(cle: string, fallback: string) {
        super({ i18nKey: cle, fallbackMessage: fallback });
    }
}
```

Créer `packages/domain/src/utils/decision-vendeur.utils.ts` :

```typescript
import { ErreurDecisionInvalide } from "../errors/index.js";
import type { IDecisionSoumise } from "../interfaces/index.js";

export function validerDecision(entree: IDecisionSoumise): void {
    // Un administrateur qui tranche son propre dossier n'est plus un arbitre. La règle
    // est ici et non dans une garde d'accès : elle tient au lien entre deux identités,
    // pas au rôle de l'une d'elles.
    if (entree.decideurId === entree.candidatId) {
        throw new ErreurDecisionInvalide(
            "errors.vendor_application.self_decision",
            "Un administrateur ne peut pas décider sur son propre dossier.",
        );
    }

    if (entree.decision === "ACCEPTED") {
        if (entree.raison !== undefined) {
            throw new ErreurDecisionInvalide(
                "errors.vendor_application.reason_forbidden_on_accept",
                "Une acceptation ne porte pas de motif de refus.",
            );
        }
        return;
    }

    if (entree.raison === undefined) {
        throw new ErreurDecisionInvalide(
            "errors.vendor_application.reason_required",
            "Un refus exige un motif codé.",
        );
    }

    // `OTHER` ne dit rien au candidat : sans commentaire, le refus est incompréhensible
    // et la resoumission devient un coup de dés.
    if (entree.raison === "OTHER" && (entree.commentaire ?? "").trim() === "") {
        throw new ErreurDecisionInvalide(
            "errors.vendor_application.comment_required",
            "Le motif « autre » exige un commentaire en clair.",
        );
    }
}
```

Ajouter à `packages/domain/src/interfaces/dossier-vendeur.interface.ts` :

```typescript
import { E_VENDOR_DECISION, E_VENDOR_REJECTION_REASON } from "@clemperl/db/enums";

export type TSensDecision = (typeof E_VENDOR_DECISION)[keyof typeof E_VENDOR_DECISION];
export type TRaisonRefus =
    (typeof E_VENDOR_REJECTION_REASON)[keyof typeof E_VENDOR_REJECTION_REASON];

export interface IDecisionSoumise {
    decideurId: string;
    candidatId: string;
    decision: TSensDecision;
    raison?: TRaisonRefus;
    commentaire?: string;
}
```

- [ ] **Étape 9 : écrire et faire passer les permissions**

Test `packages/domain/src/utils/permissions-vendeur.utils.spec.ts` :

```typescript
import { describe, expect, it } from "vitest";
import {
    estMembreDe,
    peutDecider,
    peutResoumettre,
    peutVoirDossier,
} from "./permissions-vendeur.utils.js";

describe("permissions autour du dossier vendeur", () => {
    it("laisse le candidat voir son dossier", () => {
        expect(peutVoirDossier({ id: "usr_1", role: "CUSTOMER" }, { applicantId: "usr_1" })).toBe(true);
    });

    it("cache le dossier d'autrui à un client", () => {
        expect(peutVoirDossier({ id: "usr_2", role: "CUSTOMER" }, { applicantId: "usr_1" })).toBe(false);
    });

    it("laisse un administrateur voir tout dossier", () => {
        expect(peutVoirDossier({ id: "adm_1", role: "ADMIN" }, { applicantId: "usr_1" })).toBe(true);
    });

    it("réserve la décision aux administrateurs", () => {
        expect(peutDecider({ id: "adm_1", role: "ADMIN" })).toBe(true);
        expect(peutDecider({ id: "usr_1", role: "CUSTOMER" })).toBe(false);
    });

    it("ne laisse resoumettre que le candidat, et que sur un dossier refusé", () => {
        const dossier = { applicantId: "usr_1", status: "REJECTED" } as const;
        expect(peutResoumettre({ id: "usr_1", role: "CUSTOMER" }, dossier)).toBe(true);
        expect(peutResoumettre({ id: "usr_2", role: "CUSTOMER" }, dossier)).toBe(false);
        expect(
            peutResoumettre({ id: "usr_1", role: "CUSTOMER" }, { applicantId: "usr_1", status: "SUBMITTED" }),
        ).toBe(false);
    });

    it("reconnaît un membre de boutique", () => {
        const membres = [{ userId: "usr_1", role: "OWNER" as const }];
        expect(estMembreDe(membres, "usr_1")).toBe(true);
        expect(estMembreDe(membres, "usr_9")).toBe(false);
    });
});
```

Implémentation `packages/domain/src/utils/permissions-vendeur.utils.ts` :

```typescript
import { peutTransitionner } from "./transitions-dossier.utils.js";
import { E_ACTION_DOSSIER } from "../constants/index.js";
import type { TStatutDossier } from "../types/statut-dossier.type.js";

interface IActeur {
    id: string;
    role: "CUSTOMER" | "ADMIN";
}

export function peutVoirDossier(acteur: IActeur, dossier: { applicantId: string }): boolean {
    return acteur.role === "ADMIN" || acteur.id === dossier.applicantId;
}

export function peutDecider(acteur: IActeur): boolean {
    return acteur.role === "ADMIN";
}

// La question « l'état autorise-t-il ? » n'est pas réécrite ici : elle est déléguée à la
// machine à états, seul endroit où la table des transitions est lue. Dupliquer le test
// `status === "REJECTED"` créerait une seconde vérité à tenir synchrone.
export function peutResoumettre(
    acteur: IActeur,
    dossier: { applicantId: string; status: TStatutDossier },
): boolean {
    return (
        acteur.id === dossier.applicantId &&
        peutTransitionner(dossier.status, E_ACTION_DOSSIER.RESOUMETTRE)
    );
}

export function estMembreDe(
    membres: readonly { userId: string }[],
    utilisateurId: string,
): boolean {
    return membres.some((membre) => membre.userId === utilisateurId);
}
```

- [ ] **Étape 10 : écrire et faire passer le slug**

Test `packages/domain/src/utils/slug-boutique.utils.spec.ts` :

```typescript
import { describe, expect, it } from "vitest";
import { slugifierNomBoutique } from "./slug-boutique.utils.js";

describe("dérivation du slug de boutique", () => {
    it("met en minuscules et relie par des tirets", () => {
        expect(slugifierNomBoutique("Chez Clem")).toBe("chez-clem");
    });

    it("retire les accents plutôt que de les encoder", () => {
        expect(slugifierNomBoutique("Créations Éclat")).toBe("creations-eclat");
    });

    it("écrase la ponctuation et les tirets répétés", () => {
        expect(slugifierNomBoutique("L'Atelier  —  Cuir & Co.")).toBe("l-atelier-cuir-co");
    });

    it("ne laisse jamais de tiret en bordure", () => {
        expect(slugifierNomBoutique("  -- Maroquinerie --  ")).toBe("maroquinerie");
    });

    it("tronque à 60 caractères sans couper sur un tiret", () => {
        const long = slugifierNomBoutique("a".repeat(80));
        expect(long).toHaveLength(60);
        expect(long.endsWith("-")).toBe(false);
    });
});
```

Implémentation `packages/domain/src/utils/slug-boutique.utils.ts` :

```typescript
const LONGUEUR_MAX_SLUG = 60;

// Le slug sert d'identifiant public de boutique. Les accents sont DÉPLIÉS et non
// encodés : `créations` et `creations` désigneraient sinon deux boutiques distinctes
// dont personne ne saurait dire laquelle il a visitée.
export function slugifierNomBoutique(nom: string): string {
    return nom
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, LONGUEUR_MAX_SLUG)
        .replace(/-+$/g, "");
}
```

- [ ] **Étape 11 : déclarer toutes les nouvelles clés de traduction**

Dans `packages/i18n/messages/storefront/fr.json` et `en.json`, et dans
`packages/i18n/messages/admin/fr.json` pour celles que l'administration affiche :

`missing_document`, `duplicate_document`, `document_too_large`,
`unsupported_media_type`, `reason_required`, `reason_forbidden_on_accept`,
`comment_required`, `self_decision` — toutes sous `errors.vendor_application`.

Exemple français : `"missing_document": "Il manque une pièce obligatoire : {nature}."` ;
anglais : `"missing_document": "A required document is missing: {nature}."`

- [ ] **Étape 12 : relever les seuils à la valeur mesurée**

```bash
pnpm --filter @clemperl/domain test
```

Lire le tableau de couverture, puis inscrire **les valeurs affichées** dans
`packages/domain/vitest.config.ts` — jamais une valeur arrondie vers le haut, jamais une
valeur souhaitée. Relancer pour confirmer que le plancher passe.

```bash
pnpm --filter @clemperl/domain test && pnpm verify:thresholds
```

- [ ] **Étape 13 : vérification et commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
git add packages/domain/ packages/i18n/
git commit -m "feat(domain): add application validity, decision, permission and slug rules"
```

---

## Tâche 5 — Le schéma Prisma de T1b

**Fichiers :**
- Modifier : `packages/db/prisma/schema.prisma`
- Créer : `packages/db/prisma/migrations/<horodatage>_vendor_applications/migration.sql`
- Modifier : `packages/db/src/index.ts`

**Interfaces :**
- Consomme : tâche 1 (tables au pluriel), tâche 2 (sortie `./enums`).
- Produit : les modèles `VendorApplication`, `VendorDocument`, `VendorDecision`,
  `Vendor`, `VendorMember` et les six énumérations, exportés depuis `@clemperl/db` et
  `@clemperl/db/enums`.

- [ ] **Étape 1 : écrire les énumérations**

À la suite de `E_USER_ROLE` dans `packages/db/prisma/schema.prisma`. Les valeurs sont en
anglais comme celles de `E_USER_ROLE` ; les noms de types restent au singulier.

```prisma
enum E_VENDOR_APPLICATION_STATUS {
  SUBMITTED
  ACCEPTED
  REJECTED

  @@map("vendor_application_status")
}

enum E_VENDOR_DECISION {
  ACCEPTED
  REJECTED

  @@map("vendor_decision")
}

enum E_VENDOR_REJECTION_REASON {
  INCOMPLETE_FILE
  UNREADABLE_DOCUMENT
  IDENTITY_MISMATCH
  INELIGIBLE_ACTIVITY
  OTHER

  @@map("vendor_rejection_reason")
}

enum E_VENDOR_DOCUMENT_KIND {
  REGISTRY
  IDENTITY
  TAX

  @@map("vendor_document_kind")
}

enum E_VENDOR_MEMBER_ROLE {
  OWNER
  MANAGER

  @@map("vendor_member_role")
}

// Catégories DÉCLARATIVES : ce que le candidat annonce vouloir vendre. Ce n'est pas la
// taxonomie produit de T2, qui sera un arbre et une autre table — les fusionner ferait
// dépendre le catalogue d'une déclaration d'intention faite avant toute mise en vente.
enum E_VENDOR_CATEGORY {
  APPAREL
  JEWELLERY
  LEATHER_GOODS

  @@map("vendor_category")
}
```

- [ ] **Étape 2 : écrire les modèles**

```prisma
// Le dossier de candidature est l'INSTANTANÉ de ce qui a été déclaré le jour du dépôt.
// Il n'est jamais resynchronisé depuis la boutique : les champs qui semblent dupliqués
// entre les deux tables sont deux vérités à deux dates, et c'est voulu.
model VendorApplication {
  id          String                      @id @default(cuid(2))
  applicantId String                      @map("applicant_id")
  status      E_VENDOR_APPLICATION_STATUS @default(SUBMITTED)

  // La langue du dépôt. Le courriel de décision part depuis l'administration, qui ne
  // sait pas dans quelle langue le candidat s'est adressé à nous.
  locale String

  shopName        String              @map("shop_name")
  shopDescription String              @map("shop_description")
  contactEmail    String              @map("contact_email")
  contactPhone    String              @map("contact_phone")
  categories      E_VENDOR_CATEGORY[]

  legalForm          String  @map("legal_form")
  legalName          String  @map("legal_name")
  registrationNumber String  @map("registration_number")
  taxNumber          String? @map("tax_number")
  country            String

  submittedAt DateTime  @map("submitted_at")
  decidedAt   DateTime? @map("decided_at")
  vendorId    String?   @unique @map("vendor_id")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // `Restrict` et non `Cascade` : supprimer un compte ne doit pas effacer la trace
  // d'une décision administrative. L'archive survit à celui qui l'a déclenchée.
  applicant User             @relation(fields: [applicantId], references: [id], onDelete: Restrict)
  vendor    Vendor?          @relation(fields: [vendorId], references: [id], onDelete: SetNull)
  documents VendorDocument[]
  decisions VendorDecision[]

  @@index([applicantId])
  @@index([status, submittedAt])
  @@map("vendor_applications")
}

model VendorDocument {
  id            String                 @id @default(cuid(2))
  applicationId String                 @map("application_id")
  kind          E_VENDOR_DOCUMENT_KIND
  objectPath    String                 @map("object_path")
  mimeType      String                 @map("mime_type")
  sizeBytes     Int                    @map("size_bytes")

  // Conservé pour l'affichage seulement : le nom de l'objet stocké est généré, jamais
  // celui fourni par l'utilisateur.
  originalName String @map("original_name")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  application VendorApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  // Une seule pièce par nature : deux registres poseraient la question de savoir lequel
  // fait foi. C'est aussi ce qui fait de la resoumission un `upsert` et non un empilement.
  @@unique([applicationId, kind])
  @@map("vendor_documents")
}

// Journal en AJOUT SEUL. Seul endroit du schéma sans `updatedAt` : une décision ne se
// modifie pas, et un `updatedAt` qui vaut toujours `createdAt` laisserait croire le
// contraire. `createdAt` porte la date de la décision.
model VendorDecision {
  id            String                     @id @default(cuid(2))
  applicationId String                     @map("application_id")
  decision      E_VENDOR_DECISION
  reason        E_VENDOR_REJECTION_REASON?
  comment       String?
  decidedById   String                     @map("decided_by_id")
  createdAt     DateTime                   @default(now()) @map("created_at")

  application VendorApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  decidedBy   User              @relation("DecisionsRendues", fields: [decidedById], references: [id], onDelete: Restrict)

  @@index([applicationId, createdAt])
  @@map("vendor_decisions")
}

// Aucun statut, volontairement : une ligne dans cette table EST un vendeur validé. La
// suspension relève de la modération (T6) et ajoutera son propre mécanisme.
model Vendor {
  id   String @id @default(cuid(2))
  slug String @unique

  shopName        String              @map("shop_name")
  shopDescription String              @map("shop_description")
  contactEmail    String              @map("contact_email")
  contactPhone    String              @map("contact_phone")
  categories      E_VENDOR_CATEGORY[]

  legalForm          String  @map("legal_form")
  legalName          String  @map("legal_name")
  registrationNumber String  @map("registration_number")
  taxNumber          String? @map("tax_number")
  country            String

  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  application VendorApplication?
  members     VendorMember[]

  @@map("vendors")
}

model VendorMember {
  id       String               @id @default(cuid(2))
  vendorId String               @map("vendor_id")
  userId   String               @map("user_id")
  role     E_VENDOR_MEMBER_ROLE

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  vendor Vendor @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([vendorId, userId])
  @@index([userId])
  @@map("vendor_members")
}
```

Ajouter au modèle `User` :

```prisma
  vendorApplications VendorApplication[]
  vendorDecisions    VendorDecision[]    @relation("DecisionsRendues")
  vendorMemberships  VendorMember[]
```

- [ ] **Étape 3 : créer la migration sans l'appliquer**

```bash
pnpm --filter @clemperl/db exec prisma migrate dev --create-only --name vendor_applications
```

- [ ] **Étape 4 : ajouter l'index unique partiel à la main**

Prisma ne sait pas déclarer d'index unique partiel. Ajouter **à la fin** du
`migration.sql` produit :

```sql
-- Prisma ne sait pas déclarer d'index unique partiel, cette contrainte est donc écrite
-- à la main. Sans elle, deux onglets ouverts par le même candidat créent deux dossiers
-- ouverts : une vérification applicative perdrait cette course, la base non.
CREATE UNIQUE INDEX "vendor_applications_applicant_open_key"
    ON "vendor_applications" ("applicant_id")
    WHERE "status" = 'SUBMITTED'::"vendor_application_status";
```

Le transtypage explicite est nécessaire : `status` est d'un type énuméré, et la
comparaison à un littéral texte échouerait à la création de l'index.

- [ ] **Étape 5 : appliquer et vérifier en base**

```bash
pnpm --filter @clemperl/db exec prisma migrate dev
docker exec -i clemperl_dev_postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "\d vendor_applications"
```

Attendu : les colonnes en `snake_case`, et l'index partiel listé avec sa clause `WHERE`.

- [ ] **Étape 6 : exporter depuis `@clemperl/db`**

Dans `packages/db/src/index.ts`, ajouter aux réexports explicites :

```typescript
export type {
    Vendor,
    VendorApplication,
    VendorDecision,
    VendorDocument,
    VendorMember,
} from "../generated/prisma/client.js";
export {
    E_VENDOR_APPLICATION_STATUS,
    E_VENDOR_CATEGORY,
    E_VENDOR_DECISION,
    E_VENDOR_DOCUMENT_KIND,
    E_VENDOR_MEMBER_ROLE,
    E_VENDOR_REJECTION_REASON,
} from "../generated/prisma/client.js";
```

- [ ] **Étape 7 : vérifier que le domaine compile enfin contre de vrais enums**

Les tâches 3 et 4 importaient `E_VENDOR_APPLICATION_STATUS` et consorts depuis
`@clemperl/db/enums` alors qu'ils n'existaient pas encore : le `typecheck` du domaine
échouait, ou passait par tolérance. Il doit maintenant passer strictement.

```bash
pnpm --filter @clemperl/db build && pnpm --filter @clemperl/domain typecheck
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
```

- [ ] **Étape 8 : commit**

```bash
git add packages/db/
git commit -m "feat(db): add vendor application, document, decision, vendor and member models"
```

---

## Tâche 6 — Les repositories et leurs tests d'intégration

**Pourquoi ici** : ces séquences d'écriture ne sont pas testables si elles vivent dans
une server action — on ne charge pas une server action Next depuis Jest dans le conteneur
`api`. Elles vivent donc dans `@clemperl/db`, ce qui est exactement la raison pour
laquelle T0 a voulu ce package partagé : « importé aussi bien par les server actions Next
que par les services Nest ».

**Fichiers :**
- Créer : `packages/db/src/repositories/dossier-vendeur.repository.ts`
- Créer : `packages/db/src/repositories/index.ts`
- Modifier : `packages/db/src/index.ts`
- Créer : `apps/api/test/dossier-vendeur.int-spec.ts`
- Modifier : `apps/api/jest.config.integration.ts`

**Interfaces :**
- Consomme : tâche 5 (modèles), tâche 4 (`TDepotDossier`, `IPieceDeposee`).
- Produit :
  - `creerDossier(prisma, entree: ICreationDossier): Promise<{ id: string }>`
  - `resoumettreDossier(prisma, entree: IResoumissionDossier): Promise<void>`
  - `deciderSurDossier(prisma, entree: IDecisionDossier): Promise<{ vendorId: string | null }>`
  - `lireDossierDuCandidat(prisma, applicantId: string)`
  - `listerDossiersSoumis(prisma)`
  - `lireDossierComplet(prisma, id: string)`

  Toutes prennent le client Prisma en **premier paramètre** : l'appelant décide de la
  connexion, ce qui permet au test d'injecter celle de son conteneur.

- [ ] **Étape 1 : étendre le `testMatch` d'intégration**

Ces tests portent sur `@clemperl/db` et non sur un module de l'API : ils n'ont rien à
faire sous `src/`. Dans `apps/api/jest.config.integration.ts` :

```typescript
    testMatch: [
        "<rootDir>/src/**/*.int-spec.ts",
        // Les suites qui vérifient le schéma et les repositories de `@clemperl/db`
        // vivent ici : elles ne testent aucun module de l'API, qui ne fournit que le
        // harnais Testcontainers.
        "<rootDir>/test/**/*.int-spec.ts",
    ],
```

- [ ] **Étape 2 : écrire les tests d'intégration, qui doivent échouer**

Créer `apps/api/test/dossier-vendeur.int-spec.ts`. Le harnais suit `schema-identite.int-spec.ts` :
lire ce fichier pour reprendre exactement sa façon d'obtenir un client Prisma depuis
`obtenirUrlBase()`.

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import {
    creerDossier,
    deciderSurDossier,
    PrismaClient,
} from "@clemperl/db";
import { obtenirUrlBase } from "./base-de-test";

const CHAMPS = {
    locale: "fr",
    shopName: "Chez Clem",
    shopDescription: "Maroquinerie artisanale depuis 2019.",
    contactEmail: "contact@chezclem.test",
    contactPhone: "+32470000000",
    categories: ["LEATHER_GOODS" as const],
    legalForm: "SRL",
    legalName: "Chez Clem SRL",
    registrationNumber: "0123456789",
    country: "BE",
};

const PIECES = [
    {
        kind: "REGISTRY" as const,
        objectPath: "vendor-applications/x/registry.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        originalName: "rccm.pdf",
    },
];

describe("repository du dossier vendeur", () => {
    let prisma: PrismaClient;

    beforeAll(() => {
        prisma = new PrismaClient({
            adapter: new PrismaPg({ connectionString: obtenirUrlBase() }),
        });
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    async function creerCandidat(email: string): Promise<string> {
        const utilisateur = await prisma.user.create({
            data: { email, name: "Candidat", emailVerified: true },
        });
        return utilisateur.id;
    }

    it("refuse un second dossier ouvert pour le même candidat", async () => {
        const candidat = await creerCandidat(`double-${Date.now()}@test.local`);
        await creerDossier(prisma, { applicantId: candidat, champs: CHAMPS, pieces: PIECES });

        // C'est la BASE qui refuse, pas l'application : une vérification applicative
        // perdrait la course entre deux onglets.
        await expect(
            creerDossier(prisma, { applicantId: candidat, champs: CHAMPS, pieces: PIECES }),
        ).rejects.toThrow(/vendor_applications_applicant_open_key/);
    });

    it("ne laisse qu'une seule décision aboutir sur un dossier", async () => {
        const candidat = await creerCandidat(`course-${Date.now()}@test.local`);
        const admin = await creerCandidat(`admin-${Date.now()}@test.local`);
        const { id } = await creerDossier(prisma, {
            applicantId: candidat,
            champs: CHAMPS,
            pieces: PIECES,
        });

        const resultats = await Promise.allSettled([
            deciderSurDossier(prisma, {
                applicationId: id,
                decidedById: admin,
                decision: "REJECTED",
                reason: "INCOMPLETE_FILE",
            }),
            deciderSurDossier(prisma, {
                applicationId: id,
                decidedById: admin,
                decision: "REJECTED",
                reason: "INCOMPLETE_FILE",
            }),
        ]);

        expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(await prisma.vendorDecision.count({ where: { applicationId: id } })).toBe(1);
    });

    it("crée le vendeur ET son propriétaire dans la même transaction", async () => {
        const candidat = await creerCandidat(`ok-${Date.now()}@test.local`);
        const admin = await creerCandidat(`adm2-${Date.now()}@test.local`);
        const { id } = await creerDossier(prisma, {
            applicantId: candidat,
            champs: { ...CHAMPS, shopName: `Boutique ${Date.now()}` },
            pieces: PIECES,
        });

        const { vendorId } = await deciderSurDossier(prisma, {
            applicationId: id,
            decidedById: admin,
            decision: "ACCEPTED",
        });

        expect(vendorId).not.toBeNull();
        const membres = await prisma.vendorMember.findMany({ where: { vendorId: vendorId! } });
        expect(membres).toHaveLength(1);
        expect(membres[0]!.role).toBe("OWNER");
        expect(membres[0]!.userId).toBe(candidat);
    });

    it("refuse deux boutiques homonymes à l'acceptation", async () => {
        const nom = `Homonyme ${Date.now()}`;
        const premier = await creerCandidat(`h1-${Date.now()}@test.local`);
        const second = await creerCandidat(`h2-${Date.now()}@test.local`);
        const admin = await creerCandidat(`adm3-${Date.now()}@test.local`);

        for (const candidat of [premier, second]) {
            const { id } = await creerDossier(prisma, {
                applicantId: candidat,
                champs: { ...CHAMPS, shopName: nom },
                pieces: PIECES,
            });
            if (candidat === premier) {
                await deciderSurDossier(prisma, {
                    applicationId: id,
                    decidedById: admin,
                    decision: "ACCEPTED",
                });
            } else {
                await expect(
                    deciderSurDossier(prisma, {
                        applicationId: id,
                        decidedById: admin,
                        decision: "ACCEPTED",
                    }),
                ).rejects.toThrow(/vendors_slug_key/);
            }
        }
    });
});
```

- [ ] **Étape 3 : lancer et vérifier l'échec**

```bash
pnpm docker:up
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
```

Attendu : ÉCHEC à l'import — `creerDossier` n'existe pas.

- [ ] **Étape 4 : écrire le repository**

Créer `packages/db/src/repositories/dossier-vendeur.repository.ts` :

```typescript
import { slugifierNomBoutique } from "@clemperl/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

interface IPieceAEnregistrer {
    kind: "REGISTRY" | "IDENTITY" | "TAX";
    objectPath: string;
    mimeType: string;
    sizeBytes: number;
    originalName: string;
}

interface IChampsDossier {
    locale: string;
    shopName: string;
    shopDescription: string;
    contactEmail: string;
    contactPhone: string;
    categories: ("APPAREL" | "JEWELLERY" | "LEATHER_GOODS")[];
    legalForm: string;
    legalName: string;
    registrationNumber: string;
    taxNumber?: string;
    country: string;
}

export interface ICreationDossier {
    applicantId: string;
    champs: IChampsDossier;
    pieces: IPieceAEnregistrer[];
}

export async function creerDossier(
    prisma: PrismaClient,
    entree: ICreationDossier,
): Promise<{ id: string }> {
    // Le dossier et ses pièces dans la MÊME transaction : un dossier sans ses
    // justificatifs serait irrecevable et occuperait pourtant l'unique place ouverte du
    // candidat, qui ne pourrait plus en déposer un autre.
    return prisma.$transaction(async (tx) => {
        const dossier = await tx.vendorApplication.create({
            data: {
                applicantId: entree.applicantId,
                submittedAt: new Date(),
                ...entree.champs,
            },
            select: { id: true },
        });

        await tx.vendorDocument.createMany({
            data: entree.pieces.map((piece) => ({ applicationId: dossier.id, ...piece })),
        });

        return dossier;
    });
}

export interface IDecisionDossier {
    applicationId: string;
    decidedById: string;
    decision: "ACCEPTED" | "REJECTED";
    reason?: "INCOMPLETE_FILE" | "UNREADABLE_DOCUMENT" | "IDENTITY_MISMATCH" | "INELIGIBLE_ACTIVITY" | "OTHER";
    comment?: string;
}

export async function deciderSurDossier(
    prisma: PrismaClient,
    entree: IDecisionDossier,
): Promise<{ vendorId: string | null }> {
    return prisma.$transaction(async (tx) => {
        // `updateMany` CONDITIONNÉ sur l'état, et non `update` sur l'identifiant : c'est
        // la base qui arbitre la course entre deux administrateurs ouvrant la même
        // fiche. Un `update` suivi d'un test applicatif la perdrait.
        const touchees = await tx.vendorApplication.updateMany({
            where: { id: entree.applicationId, status: "SUBMITTED" },
            data: { status: entree.decision, decidedAt: new Date() },
        });

        if (touchees.count !== 1) {
            throw new Error("ALREADY_DECIDED");
        }

        await tx.vendorDecision.create({
            data: {
                applicationId: entree.applicationId,
                decision: entree.decision,
                reason: entree.reason,
                comment: entree.comment,
                decidedById: entree.decidedById,
            },
        });

        if (entree.decision === "REJECTED") {
            return { vendorId: null };
        }

        const dossier = await tx.vendorApplication.findUniqueOrThrow({
            where: { id: entree.applicationId },
        });

        const vendeur = await tx.vendor.create({
            data: {
                slug: slugifierNomBoutique(dossier.shopName),
                shopName: dossier.shopName,
                shopDescription: dossier.shopDescription,
                contactEmail: dossier.contactEmail,
                contactPhone: dossier.contactPhone,
                categories: dossier.categories,
                legalForm: dossier.legalForm,
                legalName: dossier.legalName,
                registrationNumber: dossier.registrationNumber,
                taxNumber: dossier.taxNumber,
                country: dossier.country,
                // Le candidat devient propriétaire dans la même écriture : une boutique
                // sans membre serait inaccessible à celui qui vient de l'obtenir.
                members: { create: { userId: dossier.applicantId, role: "OWNER" } },
            },
            select: { id: true },
        });

        await tx.vendorApplication.update({
            where: { id: entree.applicationId },
            data: { vendorId: vendeur.id },
        });

        return { vendorId: vendeur.id };
    });
}
```

Ajouter dans le même fichier `resoumettreDossier`, `lireDossierDuCandidat`,
`listerDossiersSoumis` et `lireDossierComplet` :

```typescript
export interface IResoumissionDossier {
    applicationId: string;
    champs: IChampsDossier;
    pieces: IPieceAEnregistrer[];
}

export async function resoumettreDossier(
    prisma: PrismaClient,
    entree: IResoumissionDossier,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const touchees = await tx.vendorApplication.updateMany({
            where: { id: entree.applicationId, status: "REJECTED" },
            data: { status: "SUBMITTED", submittedAt: new Date(), ...entree.champs },
        });

        if (touchees.count !== 1) {
            throw new Error("NOT_REJECTED");
        }

        // Une resoumission REMPLACE les pièces, elle ne les empile pas : quand on vous
        // rend un document illisible, vous rapportez le bon, l'ancien ne reste pas au
        // dossier. `@@unique([applicationId, kind])` rend l'upsert non ambigu.
        for (const piece of entree.pieces) {
            await tx.vendorDocument.upsert({
                where: {
                    applicationId_kind: {
                        applicationId: entree.applicationId,
                        kind: piece.kind,
                    },
                },
                create: { applicationId: entree.applicationId, ...piece },
                update: piece,
            });
        }
    });
}

export async function lireDossierDuCandidat(prisma: PrismaClient, applicantId: string) {
    return prisma.vendorApplication.findFirst({
        where: { applicantId },
        orderBy: { createdAt: "desc" },
        include: {
            documents: true,
            decisions: { orderBy: { createdAt: "desc" }, take: 1 },
        },
    });
}

export async function listerDossiersSoumis(prisma: PrismaClient) {
    // Le plus ancien d'abord : une file d'attente se traite dans l'ordre d'arrivée, et
    // trier par date décroissante condamnerait les dossiers du bas.
    return prisma.vendorApplication.findMany({
        where: { status: "SUBMITTED" },
        orderBy: { submittedAt: "asc" },
        select: { id: true, shopName: true, legalName: true, submittedAt: true, country: true },
    });
}

export async function lireDossierComplet(prisma: PrismaClient, id: string) {
    return prisma.vendorApplication.findUnique({
        where: { id },
        include: {
            applicant: { select: { id: true, email: true, name: true } },
            documents: true,
            decisions: {
                orderBy: { createdAt: "desc" },
                include: { decidedBy: { select: { id: true, email: true } } },
            },
        },
    });
}
```

Créer `packages/db/src/repositories/index.ts` et l'ajouter à `packages/db/src/index.ts`.
Ajouter `@clemperl/domain` aux dépendances de `packages/db/package.json` — le repository
dérive le slug, et cette règle ne se réécrit pas ici.

**Attention à la boucle de dépendances** : `@clemperl/domain` dépend de `@clemperl/db`
pour ses enums. La dépendance inverse passe parce que le domaine n'importe que
`@clemperl/db/enums`, un module sans runtime. Si pnpm ou TypeScript s'en plaint, déplacer
`slugifierNomBoutique` dans `@clemperl/core` plutôt que de dupliquer la fonction.

- [ ] **Étape 5 : faire passer les tests**

```bash
pnpm --filter @clemperl/db build
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
```

Attendu : les 4 nouveaux tests au vert, et `schema-identite.int-spec.ts` toujours vert.

- [ ] **Étape 6 : vérification et commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
git add packages/db/ apps/api/
git commit -m "feat(db): add vendor application repositories with integration coverage"
```

---

## Tâche 7 — L'accès au stockage dans `@clemperl/core`

**Pourquoi pas de port `IFileStore`** : un seul adapter sert le développement et la
production, la différence tenant aux variables d'environnement. Une interface à
implémentation unique n'existerait que pour elle-même. Le domaine, lui, ne connaît pas le
stockage : la server action téléverse, puis lui passe une référence.

**Prérequis** : tâche 0 verte.

**Fichiers :**
- Créer : `packages/core/src/utils/stockage-pieces.utils.ts` (+ `.spec.ts`)
- Modifier : `packages/core/src/schemas/base-env.schema.ts`
- Modifier : `packages/core/package.json`

**Interfaces :**
- Consomme : tâche 0 (le service `storage`).
- Produit :
  - `construireCheminObjet(prefixe: string, kind: string, nomOrigine: string): string`
  - `televerserPiece(chemin: string, contenu: ArrayBuffer, mimeType: string): Promise<void>`
  - `lirePiece(chemin: string): Promise<Blob>`
  - `supprimerPieces(chemins: string[]): Promise<void>`

- [ ] **Étape 1 : ajouter la dépendance**

```bash
pnpm --filter @clemperl/core add @supabase/storage-js@2.12.0
```

Le client de stockage seul, et non `@supabase/supabase-js` : nous n'utilisons ni
l'authentification, ni PostgREST, ni le temps réel de Supabase, et tirer le paquet
complet ferait entrer trois clients inutilisés dans l'image.

- [ ] **Étape 2 : déclarer les variables dans le schéma d'environnement**

Dans `packages/core/src/schemas/base-env.schema.ts`, ajouter :

```typescript
    STORAGE_URL: z.url(),
    STORAGE_SERVICE_KEY: z.string().min(1),
    STORAGE_BUCKET: z.string().min(1),
```

- [ ] **Étape 3 : écrire le test de la partie pure, qui doit échouer**

Créer `packages/core/src/utils/stockage-pieces.utils.spec.ts` :

```typescript
import { describe, expect, it } from "vitest";
import { construireCheminObjet } from "./stockage-pieces.utils.js";

describe("chemin d'objet d'une pièce justificative", () => {
    it("range la pièce sous le groupe de sa soumission", () => {
        const chemin = construireCheminObjet("soumission_123", "REGISTRY", "rccm.pdf");
        expect(chemin.startsWith("soumission_123/REGISTRY-")).toBe(true);
    });

    // Le nom fourni par l'utilisateur ne doit JAMAIS servir de nom d'objet : il peut
    // contenir des séparateurs de chemin, et l'écrire tel quel laisserait choisir où
    // l'objet atterrit.
    it("n'utilise pas le nom d'origine, même piégé", () => {
        const chemin = construireCheminObjet("soumission_123", "IDENTITY", "../../etc/passwd");
        expect(chemin).not.toContain("..");
        expect(chemin.split("/")).toHaveLength(2);
    });

    it("conserve l'extension d'origine, en minuscules", () => {
        expect(construireCheminObjet("soumission_1", "TAX", "Scan.PDF").endsWith(".pdf")).toBe(true);
    });

    it("retombe sur .bin quand il n'y a pas d'extension", () => {
        expect(construireCheminObjet("soumission_1", "TAX", "scan").endsWith(".bin")).toBe(true);
    });

    it("produit deux chemins différents pour deux dépôts de la même pièce", () => {
        const a = construireCheminObjet("soumission_1", "TAX", "scan.pdf");
        const b = construireCheminObjet("soumission_1", "TAX", "scan.pdf");
        expect(a).not.toBe(b);
    });
});
```

Le dernier test compte : une resoumission qui réutiliserait le même chemin écraserait
l'objet avant que la transaction ne soit validée, et un échec laisserait le dossier
pointant vers un fichier déjà remplacé.

- [ ] **Étape 4 : implémenter**

Créer `packages/core/src/utils/stockage-pieces.utils.ts` :

```typescript
import { randomUUID } from "node:crypto";
import { StorageClient } from "@supabase/storage-js";

// Le client est construit à la demande et non au chargement du module : l'importer
// depuis un contexte sans variables d'environnement — un test unitaire, une étape de
// build — ne doit pas faire échouer l'import lui-même.
function client(): StorageClient {
    const url = process.env["STORAGE_URL"];
    const cle = process.env["STORAGE_SERVICE_KEY"];
    if (!url || !cle) {
        throw new Error("STORAGE_URL ou STORAGE_SERVICE_KEY est absente.");
    }
    return new StorageClient(url, { Authorization: `Bearer ${cle}` });
}

function bucket(): string {
    const nom = process.env["STORAGE_BUCKET"];
    if (!nom) {
        throw new Error("STORAGE_BUCKET est absente.");
    }
    return nom;
}

// Le nom d'objet est GÉNÉRÉ. Reprendre celui de l'utilisateur laisserait choisir où le
// fichier atterrit — `../` compris — et ferait collisionner deux dépôts homonymes.
// Le nom d'origine survit en base, pour l'affichage seulement.
// `prefixe` regroupe les pièces d'une MÊME soumission. Ce n'est pas l'identifiant du
// dossier : Prisma le génère à l'insertion, donc après le téléversement. Un UUID tiré
// par la server action suffit — le chemin complet est de toute façon stocké en base,
// et une resoumission obtient ainsi son propre groupe sans écraser le précédent.
export function construireCheminObjet(
    prefixe: string,
    kind: string,
    nomOrigine: string,
): string {
    const morceaux = nomOrigine.split(".");
    const extension =
        morceaux.length > 1 ? (morceaux.pop() as string).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    return `${prefixe}/${kind}-${randomUUID()}.${extension || "bin"}`;
}

export async function televerserPiece(
    chemin: string,
    contenu: ArrayBuffer,
    mimeType: string,
): Promise<void> {
    const { error } = await client().from(bucket()).upload(chemin, contenu, {
        contentType: mimeType,
        upsert: false,
    });
    if (error) {
        throw error;
    }
}

export async function lirePiece(chemin: string): Promise<Blob> {
    const { data, error } = await client().from(bucket()).download(chemin);
    if (error || !data) {
        throw error ?? new Error(`Pièce introuvable : ${chemin}`);
    }
    return data;
}

// Utilisée en compensation après l'échec d'une transaction, et pour retirer les anciens
// objets APRÈS le commit d'une resoumission. Elle n'échoue jamais bruyamment : un objet
// orphelin coûte de l'espace, pas de la correction, et faire échouer un dépôt réussi
// parce qu'un ménage a raté serait une régression.
export async function supprimerPieces(chemins: readonly string[]): Promise<void> {
    if (chemins.length === 0) {
        return;
    }
    try {
        await client().from(bucket()).remove([...chemins]);
    } catch (erreur) {
        console.error("Suppression de pièces impossible", { chemins, erreur });
    }
}
```

- [ ] **Étape 5 : faire passer, relever le seuil, commiter**

```bash
pnpm --filter @clemperl/core test
```

Relever `thresholds` dans `packages/core/vitest.config.ts` à la valeur **mesurée** —
elle aura monté, `core` étant à 61 % depuis T1a.

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
git add packages/core/ pnpm-lock.yaml
git commit -m "feat(core): add private document storage access"
```

---

## Tâche 8 — Les trois courriels

**Fichiers :**
- Créer : `packages/domain/src/messages/messages-dossier.utils.ts` (+ `.spec.ts`)
- Créer : `packages/domain/src/messages/index.ts`
- Modifier : `packages/domain/src/index.ts`

**Interfaces :**
- Consomme : `IEmailMessage` de `@clemperl/core`, `TRaisonRefus` (tâche 4).
- Produit :
  - `construireMessageAccuseReception(nomBoutique: string, locale: string): IEmailMessage`
  - `construireMessageAcceptation(nomBoutique: string, locale: string): IEmailMessage`
  - `construireMessageRefus(nomBoutique: string, motif: string, locale: string): IEmailMessage`

- [ ] **Étape 1 : écrire le test, qui doit échouer**

```typescript
import { describe, expect, it } from "vitest";
import {
    construireMessageAccuseReception,
    construireMessageAcceptation,
    construireMessageRefus,
} from "./messages-dossier.utils.js";

describe("courriels du dossier vendeur", () => {
    it("accuse réception en français", () => {
        const message = construireMessageAccuseReception("Chez Clem", "fr");
        expect(message.sujet).toContain("Chez Clem");
        expect(message.destinataire).toBe("");
    });

    it("accuse réception en anglais", () => {
        expect(construireMessageAccuseReception("Chez Clem", "en").sujet).toMatch(/received/i);
    });

    // Une locale inconnue ne doit jamais produire un message vide : le français est la
    // langue par défaut de la plateforme, c'est lui qui sert de repli.
    it("retombe sur le français pour une locale inconnue", () => {
        expect(construireMessageAccuseReception("Chez Clem", "de").sujet).toBe(
            construireMessageAccuseReception("Chez Clem", "fr").sujet,
        );
    });

    it("porte le motif dans le corps du refus", () => {
        const message = construireMessageRefus("Chez Clem", "Registre illisible.", "fr");
        expect(message.texte).toContain("Registre illisible.");
    });

    it("annonce la boutique dans l'acceptation", () => {
        expect(construireMessageAcceptation("Chez Clem", "fr").texte).toContain("Chez Clem");
    });
});
```

- [ ] **Étape 2 : implémenter**

Créer `packages/domain/src/messages/messages-dossier.utils.ts`, sur la forme exacte de
`packages/auth/src/utils/messages-verification.utils.ts` — lire ce fichier avant d'écrire.

```typescript
import type { IEmailMessage } from "@clemperl/core";

// Les textes vivent ici et non dans les catalogues next-intl : ces messages sont
// construits côté serveur, hors de tout contexte de requête Next, où `getTranslations`
// n'est pas disponible. Les deux langues sont donc portées par ce fichier.
const TEXTES = {
    fr: {
        accuse: (boutique: string) => ({
            sujet: `Votre demande pour « ${boutique} » nous est bien parvenue`,
            corps: `Nous avons reçu votre dossier de candidature pour « ${boutique} ».\n\nNotre équipe l'examine et vous répondra par courriel. Vous pouvez suivre son état depuis votre espace client.`,
        }),
        acceptation: (boutique: string) => ({
            sujet: `« ${boutique} » est validée`,
            corps: `Bonne nouvelle : votre boutique « ${boutique} » vient d'être validée.\n\nVous pouvez désormais accéder à votre espace vendeur.`,
        }),
        refus: (boutique: string, motif: string) => ({
            sujet: `Votre demande pour « ${boutique} » demande une correction`,
            corps: `Votre dossier pour « ${boutique} » n'a pas pu être validé en l'état.\n\nMotif :\n${motif}\n\nVous pouvez corriger votre dossier et le soumettre à nouveau depuis votre espace client.`,
        }),
    },
    en: {
        accuse: (boutique: string) => ({
            sujet: `We have received your application for "${boutique}"`,
            corps: `We have received your vendor application for "${boutique}".\n\nOur team is reviewing it and will reply by email. You can follow its status from your account.`,
        }),
        acceptation: (boutique: string) => ({
            sujet: `"${boutique}" has been approved`,
            corps: `Good news: your shop "${boutique}" has just been approved.\n\nYou can now access your vendor area.`,
        }),
        refus: (boutique: string, motif: string) => ({
            sujet: `Your application for "${boutique}" needs a correction`,
            corps: `Your application for "${boutique}" could not be approved as it stands.\n\nReason:\n${motif}\n\nYou can correct it and submit it again from your account.`,
        }),
    },
} as const;

function textes(locale: string): (typeof TEXTES)["fr"] {
    return locale === "en" ? TEXTES.en : TEXTES.fr;
}

// Le destinataire est laissé vide : c'est l'appelant qui le connaît, et le lui faire
// passer ici obligerait à propager une donnée que la construction du texte n'utilise pas.
export function construireMessageAccuseReception(
    nomBoutique: string,
    locale: string,
): IEmailMessage {
    const { sujet, corps } = textes(locale).accuse(nomBoutique);
    return { destinataire: "", sujet, texte: corps };
}

export function construireMessageAcceptation(
    nomBoutique: string,
    locale: string,
): IEmailMessage {
    const { sujet, corps } = textes(locale).acceptation(nomBoutique);
    return { destinataire: "", sujet, texte: corps };
}

export function construireMessageRefus(
    nomBoutique: string,
    motif: string,
    locale: string,
): IEmailMessage {
    const { sujet, corps } = textes(locale).refus(nomBoutique, motif);
    return { destinataire: "", sujet, texte: corps };
}
```

- [ ] **Étape 3 : vérifier, relever le seuil du domaine, commiter**

```bash
pnpm --filter @clemperl/domain test
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
git add packages/domain/
git commit -m "feat(domain): add vendor application emails in both languages"
```

---

## Tâche 9 — Storefront : déposer un dossier

**Fichiers :**
- Modifier : `apps/storefront/next.config.ts`, `apps/storefront/package.json`
- Créer : `apps/storefront/src/lib/session.ts`
- Créer : `apps/storefront/src/app/[locale]/(compte)/devenir-vendeur/page.tsx`
- Créer : `apps/storefront/src/app/[locale]/(compte)/devenir-vendeur/actions.ts`
- Créer : `apps/storefront/src/app/[locale]/(compte)/devenir-vendeur/types/etat-formulaire.interface.ts`
- Créer : `apps/storefront/src/app/[locale]/(compte)/devenir-vendeur/components/formulaire-dossier.tsx`
- Créer : `apps/storefront/src/app/[locale]/(compte)/devenir-vendeur/components/dossier-en-examen.tsx`
- Créer : `apps/storefront/src/app/[locale]/(compte)/devenir-vendeur/components/dossier-accepte.tsx`
- Modifier : `apps/storefront/src/app/[locale]/(auth)/connexion/page.tsx`
- Modifier : `packages/i18n/messages/storefront/fr.json`, `en.json`

**Interfaces :**
- Consomme : tâches 4 (`schemaDepotDossier`, `validerDossier`), 6 (`creerDossier`,
  `lireDossierDuCandidat`), 7 (`construireCheminObjet`, `televerserPiece`,
  `supprimerPieces`), 8 (`construireMessageAccuseReception`).
- Produit :
  - `IEtatFormulaire { message: string[]; succes: boolean }`
  - `deposerDossier(precedent: IEtatFormulaire, donnees: FormData): Promise<IEtatFormulaire>`
  - `lireSessionVerifiee(destination: string)` — redirige si absente ou non vérifiée

- [ ] **Étape 1 : configurer l'application**

Dans `apps/storefront/next.config.ts` :

```typescript
const config: NextConfig = {
    output: "standalone",
    transpilePackages: [
        "@clemperl/ui",
        "@clemperl/core",
        "@clemperl/i18n",
        "@clemperl/auth",
        "@clemperl/domain",
    ],
    experimental: {
        serverActions: {
            // Trois pièces de 5 Mo transitent par la server action. Le défaut de 1 Mo
            // ferait échouer le dépôt avec une erreur de plateforme, hors de portée du
            // message métier. Ce plafond vaut pour les JUSTIFICATIFS : les médias
            // produit de T2 passeront par un téléversement direct, pas par ici.
            bodySizeLimit: "16mb",
        },
    },
};
```

Ajouter `@clemperl/domain` aux dépendances de `apps/storefront/package.json`, puis
`pnpm install`.

- [ ] **Étape 2 : la garde de session**

Créer `apps/storefront/src/lib/session.ts` :

```typescript
import { auth } from "@clemperl/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// La garde vit dans le composant serveur et NON dans le middleware : celui-ci ne pourrait
// faire qu'une lecture optimiste du cookie, et poser la règle aux deux endroits
// créerait deux vérités à tenir synchrones.
export async function lireSessionVerifiee(destination: string) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        redirect(`/connexion?suite=${encodeURIComponent(destination)}`);
    }

    if (!session.user.emailVerified) {
        redirect("/verifier");
    }

    return session;
}
```

- [ ] **Étape 3 : honorer `?suite=` à la connexion**

Dans `apps/storefront/src/app/[locale]/(auth)/connexion/page.tsx`, remplacer
`window.location.href = "/"` par une destination lue dans l'URL :

```typescript
    // Une page protégée renvoie ici en portant sa propre adresse : sans cela, l'utilisateur
    // se reconnecte pour atterrir sur l'accueil et doit retrouver seul où il allait.
    // La destination est contrainte à un chemin interne — une URL absolue permettrait à
    // un lien forgé de rediriger vers un site tiers après une connexion réussie.
    const suite = new URLSearchParams(window.location.search).get("suite");
    window.location.href = suite?.startsWith("/") && !suite.startsWith("//") ? suite : "/";
```

- [ ] **Étape 4 : l'état de retour de la server action**

Créer `.../types/etat-formulaire.interface.ts` :

```typescript
// Le contrat d'erreur du dépôt : `message: string[]`, un seul format qu'il y ait une ou
// dix fautes. Les clés sont traduites par la server action, jamais par le composant.
export interface IEtatFormulaire {
    message: string[];
    succes: boolean;
}

export const ETAT_INITIAL: IEtatFormulaire = { message: [], succes: false };
```

- [ ] **Étape 5 : la server action de dépôt**

Créer `.../actions.ts` :

```typescript
"use server";

import { randomUUID } from "node:crypto";
import {
    construireCheminObjet,
    envoyerEmail,
    supprimerPieces,
    televerserPiece,
} from "@clemperl/core";
import { creerDossier, prisma } from "@clemperl/db";
import {
    construireMessageAccuseReception,
    schemaDepotDossier,
    validerDossier,
} from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { lireSessionVerifiee } from "../../../../lib/session";
import { ETAT_INITIAL, type IEtatFormulaire } from "./types/etat-formulaire.interface";

const NATURES = ["REGISTRY", "IDENTITY", "TAX"] as const;

export async function deposerDossier(
    _precedent: IEtatFormulaire,
    donnees: FormData,
): Promise<IEtatFormulaire> {
    const session = await lireSessionVerifiee("/devenir-vendeur");
    const t = await getTranslations("errors.vendor_application");
    const locale = String(donnees.get("locale") ?? "fr");

    const champs = schemaDepotDossier.safeParse({
        shopName: donnees.get("shopName"),
        shopDescription: donnees.get("shopDescription"),
        contactEmail: donnees.get("contactEmail"),
        contactPhone: donnees.get("contactPhone"),
        categories: donnees.getAll("categories"),
        legalForm: donnees.get("legalForm"),
        legalName: donnees.get("legalName"),
        registrationNumber: donnees.get("registrationNumber"),
        taxNumber: donnees.get("taxNumber") || undefined,
        country: donnees.get("country"),
        locale,
    });

    if (!champs.success) {
        return {
            ...ETAT_INITIAL,
            message: champs.error.issues.map((souci) =>
                t("invalid_field", { champ: String(souci.path[0] ?? "") }),
            ),
        };
    }

    const fichiers = NATURES.flatMap((nature) => {
        const fichier = donnees.get(nature);
        return fichier instanceof File && fichier.size > 0
            ? [{ kind: nature, fichier }]
            : [];
    });

    const violations = validerDossier(
        champs.data,
        fichiers.map(({ kind, fichier }) => ({
            kind,
            mimeType: fichier.type,
            sizeBytes: fichier.size,
        })),
    );

    // RIEN n'est écrit tant que le dossier n'est pas recevable : ni objet dans le
    // bucket, ni ligne en base. Téléverser d'abord laisserait des orphelins à chaque
    // formulaire mal rempli.
    if (violations.length > 0) {
        return {
            ...ETAT_INITIAL,
            message: violations.map((violation) => t(violation.i18nKey.split(".").pop()!, violation.i18nArgs)),
        };
    }

    const prefixe = randomUUID();
    const televersees: string[] = [];

    try {
        const pieces = [];
        for (const { kind, fichier } of fichiers) {
            const chemin = construireCheminObjet(prefixe, kind, fichier.name);
            await televerserPiece(chemin, await fichier.arrayBuffer(), fichier.type);
            televersees.push(chemin);
            pieces.push({
                kind,
                objectPath: chemin,
                mimeType: fichier.type,
                sizeBytes: fichier.size,
                originalName: fichier.name,
            });
        }

        await creerDossier(prisma, {
            applicantId: session.user.id,
            champs: champs.data,
            pieces,
        });
    } catch (erreur) {
        // Compensation : il n'existe pas de transaction commune au stockage et à la
        // base. Sans ce ménage, un échec d'insertion laisserait les objets derrière lui.
        await supprimerPieces(televersees);

        const doublon = String(erreur).includes("vendor_applications_applicant_open_key");
        return {
            ...ETAT_INITIAL,
            message: [doublon ? t("already_open") : t("submit_failed")],
        };
    }

    // Hors transaction : un relais SMTP indisponible ne doit pas annuler un dépôt valide.
    const message = construireMessageAccuseReception(champs.data.shopName, locale);
    await envoyerEmail({ ...message, destinataire: session.user.email });

    revalidatePath("/devenir-vendeur");
    return { message: [], succes: true };
}
```

Vérifier le nom réel de la fonction d'envoi exportée par `@clemperl/core` (T1a l'a
introduite avec l'adapter SMTP) et l'employer tel quel plutôt que `envoyerEmail` si elle
porte un autre nom.

- [ ] **Étape 6 : la page d'aiguillage**

Créer `.../page.tsx` :

```tsx
import { lireDossierDuCandidat, prisma } from "@clemperl/db";
import { getTranslations } from "next-intl/server";
import type { JSX } from "react";
import { lireSessionVerifiee } from "../../../../lib/session";
import { DossierAccepte } from "./components/dossier-accepte";
import { DossierEnExamen } from "./components/dossier-en-examen";
import { FormulaireDossier } from "./components/formulaire-dossier";

// Une seule adresse, quatre états. Deux routes obligeraient un lien de navigation à
// deviner laquelle proposer, et l'une des deux répondrait « rien à voir ici ».
export default async function DevenirVendeurPage(): Promise<JSX.Element> {
    const session = await lireSessionVerifiee("/devenir-vendeur");
    const t = await getTranslations("vendeur.dossier");
    const dossier = await lireDossierDuCandidat(prisma, session.user.id);

    if (dossier?.status === "ACCEPTED") {
        return <DossierAccepte nomBoutique={dossier.shopName} />;
    }

    if (dossier?.status === "SUBMITTED") {
        return <DossierEnExamen depuis={dossier.submittedAt} />;
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-16">
            <h1 className="text-2xl font-semibold">{t("titre")}</h1>
            <p className="mt-4 text-sm opacity-80">{t("piecesAPreparer")}</p>
            <FormulaireDossier />
        </main>
    );
}
```

L'état `REJECTED` est traité en tâche 10 ; ici il retombe sur le formulaire vierge.

- [ ] **Étape 7 : le formulaire**

Créer `.../components/formulaire-dossier.tsx`, composant client suivant le style des
pages de T1a — `<form>` natif, `useTranslations`, `Button` de `@clemperl/ui` — avec
`useActionState`, successeur idiomatique de la soumission manuelle pour une server action :

```tsx
"use client";

import { Button } from "@clemperl/ui";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, type JSX } from "react";
import { deposerDossier } from "../actions";
import { ETAT_INITIAL } from "../types/etat-formulaire.interface";

export function FormulaireDossier(): JSX.Element {
    const t = useTranslations("vendeur.dossier");
    const locale = useLocale();
    const [etat, action, enCours] = useActionState(deposerDossier, ETAT_INITIAL);

    return (
        <form action={action} className="mt-8 flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />

            <label className="flex flex-col gap-1">
                {t("nomBoutique")}
                <input name="shopName" required minLength={2} maxLength={80} className="border border-bordure p-2" />
            </label>
            <label className="flex flex-col gap-1">
                {t("description")}
                <textarea name="shopDescription" required minLength={20} maxLength={2000} className="border border-bordure p-2" />
            </label>
            <label className="flex flex-col gap-1">
                {t("emailContact")}
                <input name="contactEmail" type="email" required className="border border-bordure p-2" />
            </label>
            <label className="flex flex-col gap-1">
                {t("telephoneContact")}
                <input name="contactPhone" required className="border border-bordure p-2" />
            </label>

            <fieldset className="flex flex-col gap-1">
                <legend>{t("categories")}</legend>
                {["APPAREL", "JEWELLERY", "LEATHER_GOODS"].map((categorie) => (
                    <label key={categorie} className="flex items-center gap-2">
                        <input type="checkbox" name="categories" value={categorie} />
                        {t(`categorie.${categorie}`)}
                    </label>
                ))}
            </fieldset>

            <label className="flex flex-col gap-1">
                {t("formeJuridique")}
                <input name="legalForm" required className="border border-bordure p-2" />
            </label>
            <label className="flex flex-col gap-1">
                {t("raisonSociale")}
                <input name="legalName" required className="border border-bordure p-2" />
            </label>
            <label className="flex flex-col gap-1">
                {t("numeroEnregistrement")}
                <input name="registrationNumber" required className="border border-bordure p-2" />
            </label>
            <label className="flex flex-col gap-1">
                {t("numeroTva")}
                <input name="taxNumber" className="border border-bordure p-2" />
            </label>
            <label className="flex flex-col gap-1">
                {t("pays")}
                <input name="country" required maxLength={2} className="border border-bordure p-2" />
            </label>

            <label className="flex flex-col gap-1">
                {t("piece.REGISTRY")}
                <input name="REGISTRY" type="file" required accept="application/pdf,image/jpeg,image/png" className="border border-bordure p-2" />
            </label>
            <label className="flex flex-col gap-1">
                {t("piece.IDENTITY")}
                <input name="IDENTITY" type="file" required accept="application/pdf,image/jpeg,image/png" className="border border-bordure p-2" />
            </label>
            <label className="flex flex-col gap-1">
                {t("piece.TAX")}
                <input name="TAX" type="file" accept="application/pdf,image/jpeg,image/png" className="border border-bordure p-2" />
            </label>

            {etat.message.length > 0 && (
                <ul role="alert" className="text-sm">
                    {etat.message.map((ligne) => (
                        <li key={ligne}>{ligne}</li>
                    ))}
                </ul>
            )}

            <Button type="submit" disabled={enCours}>
                {enCours ? t("envoiEnCours") : t("valider")}
            </Button>
        </form>
    );
}
```

- [ ] **Étape 8 : les deux écrans d'état**

`.../components/dossier-en-examen.tsx` et `.../components/dossier-accepte.tsx`, composants
serveur simples : un titre, une phrase, et pour le premier la date de dépôt formatée par
`useFormatter` de next-intl. Aucune chaîne en dur.

- [ ] **Étape 9 : les traductions**

Ajouter sous `vendeur.dossier` dans `storefront/fr.json` et `en.json` : `titre`,
`piecesAPreparer`, `nomBoutique`, `description`, `emailContact`, `telephoneContact`,
`categories`, `categorie.APPAREL`, `categorie.JEWELLERY`, `categorie.LEATHER_GOODS`,
`formeJuridique`, `raisonSociale`, `numeroEnregistrement`, `numeroTva`, `pays`,
`piece.REGISTRY`, `piece.IDENTITY`, `piece.TAX`, `valider`, `envoiEnCours`,
`enExamen.titre`, `enExamen.depuis`, `accepte.titre`, `accepte.suite`.

Sous `errors.vendor_application`, ajouter `invalid_field`, `already_open`,
`submit_failed`.

- [ ] **Étape 10 : vérifier à la main dans le navigateur**

```bash
pnpm docker:up
```

Ouvrir `http://localhost:3000/devenir-vendeur` **déconnecté** : redirection vers
`/connexion?suite=%2Fdevenir-vendeur`. Se connecter : retour sur la page. Déposer un
dossier complet. Vérifier l'accusé de réception dans Mailpit (`http://localhost:8025`),
la ligne en base, et les objets dans le bucket :

```bash
docker exec clemperl_dev_storage ls -R /var/lib/storage
```

- [ ] **Étape 11 : prouver que Prisma n'est pas parti dans le navigateur**

C'est la preuve attendue par la tâche 2, et elle ne peut se faire qu'ici, sur un vrai build.

```bash
pnpm --filter @clemperl/storefront build
grep -rl "PrismaClient" apps/storefront/.next/static/ | head
```

Attendu : **aucune sortie**. Une correspondance signifie que le schéma Zod a entraîné le
client Prisma jusqu'au paquet client, et qu'il faut appliquer le repli de la spec.

- [ ] **Étape 12 : vérification et commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
git add apps/storefront/ packages/i18n/ pnpm-lock.yaml
git commit -m "feat(storefront): let a verified customer submit a vendor application"
```

---

## Tâche 10 — Storefront : suivre un refus et resoumettre

**Fichiers :**
- Créer : `.../devenir-vendeur/components/dossier-refuse.tsx`
- Modifier : `.../devenir-vendeur/page.tsx`, `.../devenir-vendeur/actions.ts`
- Modifier : `.../devenir-vendeur/components/formulaire-dossier.tsx`
- Modifier : `packages/i18n/messages/storefront/fr.json`, `en.json`

**Interfaces :**
- Consomme : tâche 9, tâche 6 (`resoumettreDossier`), tâche 4 (`peutResoumettre`).
- Produit : `resoumettreDossierAction(precedent, donnees): Promise<IEtatFormulaire>`, et
  `FormulaireDossier` accepte désormais une prop `valeursInitiales`.

- [ ] **Étape 1 : rendre le formulaire préremplissable**

Ajouter à `FormulaireDossier` une prop optionnelle :

```tsx
interface FormulaireDossierProps {
    // Une resoumission repart du dossier refusé : redemander la saisie complète pour une
    // pièce illisible ferait abandonner des candidats légitimes.
    valeursInitiales?: {
        shopName: string;
        shopDescription: string;
        contactEmail: string;
        contactPhone: string;
        categories: string[];
        legalForm: string;
        legalName: string;
        registrationNumber: string;
        taxNumber: string | null;
        country: string;
        applicationId: string;
    };
}
```

Poser `defaultValue` sur chaque champ, `defaultChecked` sur les cases de catégorie, et un
`<input type="hidden" name="applicationId" />` quand `valeursInitiales` est fourni. Les
champs de fichier restent **vides** : un `<input type="file">` ne se préremplit pas, et le
libellé doit dire que laisser vide conserve la pièce déjà déposée.

L'action employée est choisie par la présence de `valeursInitiales` :

```tsx
    const [etat, action, enCours] = useActionState(
        valeursInitiales ? resoumettreDossierAction : deposerDossier,
        ETAT_INITIAL,
    );
```

- [ ] **Étape 2 : l'action de resoumission**

Ajouter à `.../actions.ts` :

```typescript
export async function resoumettreDossierAction(
    _precedent: IEtatFormulaire,
    donnees: FormData,
): Promise<IEtatFormulaire> {
    const session = await lireSessionVerifiee("/devenir-vendeur");
    const t = await getTranslations("errors.vendor_application");
    const applicationId = String(donnees.get("applicationId") ?? "");

    const dossier = await lireDossierDuCandidat(prisma, session.user.id);

    // La permission est demandée au domaine et non réécrite ici : c'est lui qui sait que
    // seul un dossier REFUSÉ se resoumet, et il le sait par la table des transitions.
    if (
        !dossier ||
        dossier.id !== applicationId ||
        !peutResoumettre(
            { id: session.user.id, role: session.user.role },
            { applicantId: dossier.applicantId, status: dossier.status },
        )
    ) {
        return { ...ETAT_INITIAL, message: [t("not_resubmittable")] };
    }

    // `preparerSoumission` est la fonction privée extraite à l'étape suivante : elle
    // analyse le formulaire avec Zod, lit les fichiers, appelle `validerDossier` et
    // téléverse. Elle rend soit des messages, soit les pièces prêtes à enregistrer.
    const prepare = await preparerSoumission(donnees, t);
    if (prepare.message.length > 0) {
        return { ...ETAT_INITIAL, message: prepare.message };
    }
    const { champs, fichiers, pieces, televersees } = prepare;

    // Les pièces absentes du nouveau formulaire sont CONSERVÉES : seules celles
    // effectivement redéposées remplacent les anciennes.
    const anciensChemins = dossier.documents
        .filter((document) => fichiers.some((f) => f.kind === document.kind))
        .map((document) => document.objectPath);

    try {
        await resoumettreDossier(prisma, { applicationId, champs: champs.data, pieces });
    } catch (erreur) {
        await supprimerPieces(televersees);
        return { ...ETAT_INITIAL, message: [t("submit_failed")] };
    }

    // APRÈS le commit, jamais avant : supprimer d'abord perdrait des pièces encore
    // référencées si la transaction échouait.
    await supprimerPieces(anciensChemins);

    const message = construireMessageAccuseReception(champs.data.shopName, locale);
    await envoyerEmail({ ...message, destinataire: session.user.email });

    revalidatePath("/devenir-vendeur");
    return { message: [], succes: true };
}
```

Extraire cette partie commune **avant** d'écrire la resoumission, et refaire passer le
dépôt de la tâche 9 dessus. Signature exacte, dans le même fichier, non exportée :

```typescript
interface IPreparation {
    message: string[];
    champs: TDepotDossier;
    fichiers: { kind: "REGISTRY" | "IDENTITY" | "TAX"; fichier: File }[];
    pieces: {
        kind: "REGISTRY" | "IDENTITY" | "TAX";
        objectPath: string;
        mimeType: string;
        sizeBytes: number;
        originalName: string;
    }[];
    televersees: string[];
}

// Analyse Zod, lecture des fichiers, `validerDossier`, puis téléversement. Recopier
// cette séquence dans les deux actions la ferait diverger à la première règle ajoutée —
// et la divergence serait silencieuse, chaque copie restant valide isolément.
async function preparerSoumission(
    donnees: FormData,
    t: Awaited<ReturnType<typeof getTranslations>>,
): Promise<IPreparation>
```

Elle rend `message` non vide **sans avoir rien téléversé** quand le dossier est
irrecevable, et `televersees` rempli sinon — c'est cette liste que la compensation
supprime en cas d'échec d'écriture.

- [ ] **Étape 3 : l'écran de refus**

Créer `.../components/dossier-refuse.tsx`, composant serveur qui affiche la **dernière**
décision — sa raison traduite et son commentaire — puis rend `FormulaireDossier` prérempli.
Le journal complet n'est pas montré au candidat : il est pour l'administration.

- [ ] **Étape 4 : brancher l'état dans la page**

```tsx
    if (dossier?.status === "REJECTED") {
        return <DossierRefuse dossier={dossier} />;
    }
```

- [ ] **Étape 5 : traductions**

Sous `vendeur.dossier` : `refuse.titre`, `refuse.motif`, `refuse.commentaire`,
`refuse.instruction`, `refuse.pieceInchangee`, et un libellé par valeur de
`E_VENDOR_REJECTION_REASON` sous `refuse.raison.*`. Sous `errors.vendor_application` :
`not_resubmittable`. En français **et** en anglais.

- [ ] **Étape 6 : vérifier à la main**

Refuser un dossier directement en base pour éprouver l'écran sans attendre la tâche 12 :

```bash
docker exec -i clemperl_dev_postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "UPDATE vendor_applications SET status='REJECTED', decided_at=now();"
```

Recharger la page : le motif s'affiche, le formulaire est prérempli, la resoumission
ramène à « en examen ».

- [ ] **Étape 7 : vérification et commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
git add apps/storefront/ packages/i18n/
git commit -m "feat(storefront): show the rejection reason and allow resubmission"
```

---

## Tâche 11 — La coquille de `apps/admin`

**Fichiers :**
- Créer : `apps/admin/src/i18n/request.ts`
- Créer : `apps/admin/src/lib/session.ts`
- Modifier : `apps/admin/src/app/layout.tsx`, `apps/admin/src/app/page.tsx`
- Modifier : `apps/admin/next.config.ts`, `apps/admin/package.json`
- Modifier : `packages/i18n/messages/admin/fr.json`
- Modifier : `packages/db/prisma/seed.ts`

**Interfaces :**
- Consomme : `@clemperl/auth`, `@clemperl/i18n`.
- Produit : `exigerAdministrateur(): Promise<Session>` — redirige ou rend `notFound()`, et
  un compte d'administration **capable de se connecter**.

- [ ] **Étape 1 : vider le seed, et amorcer l'administration**

Le seed de T0 crée `admin@clemperl.test` par un `prisma.user.upsert` : une ligne `users`,
sans ligne `accounts`. Better Auth n'a donc aucun identifiant à vérifier, et personne ne
peut ouvrir l'administration. **On retire ce compte du seed plutôt que de lui greffer un
mot de passe** : le premier administrateur naît à la première ouverture.

Dans `packages/db/prisma/seed.ts`, supprimer la création du compte. Garder le script et
son entrée `prisma.seed` — il accueillera des données de référence — avec un commentaire
qui dit pourquoi il ne crée aucun utilisateur :

```typescript
// Ce seed ne crée AUCUN utilisateur. Le premier administrateur naît par la page
// d'amorçage de `apps/admin`, qui n'existe que tant qu'aucun compte ne porte le rôle
// `ADMIN`. Semer un compte reviendrait soit à écrire un mot de passe dans le dépôt,
// soit — comme le faisait T0 — à produire un compte sans identifiants, donc inutilisable.
```

Créer `apps/admin/src/app/installation/page.tsx` et `actions.ts` :

```typescript
"use server";

export async function creerPremierAdministrateur(
    _precedent: IEtatFormulaire,
    donnees: FormData,
): Promise<IEtatFormulaire> {
    const t = await getTranslations("errors.installation");

    // La SEULE barrière est l'absence d'administrateur, et elle est revérifiée ici et
    // pas seulement au rendu : entre l'affichage du formulaire et sa soumission, un
    // autre amorçage a pu aboutir.
    if ((await prisma.user.count({ where: { role: "ADMIN" } })) > 0) {
        return { message: [t("already_installed")], succes: false };
    }

    const email = String(donnees.get("email"));
    await auth.api.signUpEmail({
        body: {
            email,
            password: String(donnees.get("motDePasse")),
            name: String(donnees.get("nom")),
        },
    });

    // Le rôle et la vérification d'adresse ne s'accordent pas à l'inscription, et c'est
    // heureux : les poser ici est ce qui distingue l'amorçage d'une inscription ordinaire.
    await prisma.user.update({
        where: { email },
        data: { role: "ADMIN", emailVerified: true },
    });

    redirect("/dossiers");
}
```

La page appelle le même comptage avant de rendre le formulaire, et rend `notFound()`
dès qu'un administrateur existe — la porte se referme définitivement.

**Attention à la course** : deux amorçages simultanés sur une base vierge passeraient
tous deux le comptage. Le second échouera sur l'unicité de l'adresse s'il emploie la même,
mais pas sinon — et l'instance aurait deux administrateurs. Le risque est jugé
acceptable au vu de la fenêtre, et la spec le porte ; ne pas ajouter de verrou sans le
demander.

- [ ] **Étape 2 : câbler next-intl en monolingue**

T0 a tranché : l'administration est « câblée sur la même infrastructure mais livrée en
français seul ». Une seule locale ne justifie ni segment `[locale]`, ni middleware de
négociation : `packages/i18n/messages/admin/fr.json` existe déjà, il suffit de le servir.

Créer `apps/admin/src/i18n/request.ts` :

```typescript
import { DEFAULT_LOCALE } from "@clemperl/i18n";
import { getRequestConfig } from "next-intl/server";

// Pas de segment `[locale]` ni de middleware : l'administration est livrée en français
// seul. Le jour où l'anglais arrive, ce fichier et un catalogue suffiront — l'absence de
// préfixe d'URL est justement ce qui rend cette bascule indolore.
export default getRequestConfig(async () => ({
    locale: DEFAULT_LOCALE,
    messages: (await import(`@clemperl/i18n/messages/admin/${DEFAULT_LOCALE}.json`)).default,
}));
```

Dans `apps/admin/next.config.ts`, brancher le plugin comme le fait le storefront, et
ajouter `@clemperl/domain` à `transpilePackages`.

- [ ] **Étape 3 : la garde**

Créer `apps/admin/src/lib/session.ts` :

```typescript
import { auth } from "@clemperl/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

// Appelée EXPLICITEMENT en tête de chaque page et de chaque server action, jamais posée
// dans un layout. Un layout ne s'interpose pas de façon garantie devant tout ce qu'il
// enveloppe, et une garde qui SEMBLE protéger est pire qu'une garde absente.
export async function exigerAdministrateur() {
    const session = await auth.api.getSession({ headers: await headers() });

    // Sur une base vierge, renvoyer vers la connexion enverrait vers un formulaire
    // qu'aucun compte ne peut passer : c'est l'amorçage qu'il faut proposer.
    if ((await prisma.user.count({ where: { role: "ADMIN" } })) === 0) {
        redirect("/installation");
    }

    if (!session) {
        redirect("/connexion");
    }

    // `notFound()` et non une page « interdit » : répondre 403 confirmerait à un compte
    // ordinaire que la route existe.
    if (session.user.role !== "ADMIN") {
        notFound();
    }

    return session;
}
```

`apps/admin` n'ayant pas de page de connexion propre, `/connexion` doit renvoyer vers
celle du storefront. Deux options, à trancher à l'écriture : une redirection depuis
`apps/admin/src/app/connexion/page.tsx` vers
`${NEXT_PUBLIC_STOREFRONT_URL}/connexion?suite=…`, ou un `redirect()` direct dans la
garde. Retenir la seconde, plus courte, en construisant l'URL absolue depuis
`NEXT_PUBLIC_STOREFRONT_URL` — la session étant partagée, la connexion faite là vaut ici.

- [ ] **Étape 4 : la mise en page**

Dans `apps/admin/src/app/layout.tsx` : `NextIntlClientProvider`, un en-tête portant le
nom de la plateforme et un lien vers `/dossiers`, un `<main>`. Aucune chaîne en dur ;
`lang="fr"` sur `<html>`.

`apps/admin/src/app/page.tsx` appelle `exigerAdministrateur()` puis redirige vers
`/dossiers` : la racine de l'administration n'a rien à montrer d'autre tant que le
tableau de bord (T6) n'existe pas.

- [ ] **Étape 5 : vérifier la garde à la main**

```bash
pnpm docker:up
```

`http://localhost:3002` déconnecté → renvoi vers la connexion du storefront. Connecté
avec un compte `CUSTOMER` → page 404. Connecté avec `admin@clemperl.test` (créé par le
seed) → arrivée sur `/dossiers`, qui répond 404 tant que la tâche 12 n'a pas tourné.

- [ ] **Étape 6 : vérification et commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
git add apps/admin/ packages/i18n/ packages/db/ pnpm-lock.yaml
git commit -m "feat(admin): add the back-office shell and the administrator guard"
```

---

## Tâche 12 — Administration : file d'attente, fiche, décision, pièces

**Fichiers :**
- Créer : `apps/admin/src/app/dossiers/page.tsx`
- Créer : `apps/admin/src/app/dossiers/[id]/page.tsx`
- Créer : `apps/admin/src/app/dossiers/[id]/actions.ts`
- Créer : `apps/admin/src/app/dossiers/[id]/components/formulaire-decision.tsx`
- Créer : `apps/admin/src/app/api/pieces/[id]/route.ts`
- Modifier : `packages/i18n/messages/admin/fr.json`

**Interfaces :**
- Consomme : tâches 6 (`listerDossiersSoumis`, `lireDossierComplet`, `deciderSurDossier`),
  4 (`validerDecision`, `peutDecider`), 8 (messages), 7 (`lirePiece`), 11
  (`exigerAdministrateur`).
- Produit :
  - `IEtatDecision { message: string[] }` et `ETAT_DECISION_INITIAL`, dans
    `apps/admin/src/app/dossiers/[id]/types/etat-decision.interface.ts` — même contrat
    d'erreur que le storefront, `message: string[]`, sans le drapeau `succes` : une
    décision réussie recharge la fiche plutôt que d'afficher une confirmation.
  - `decider(precedent: IEtatDecision, donnees: FormData): Promise<IEtatDecision>`.

- [ ] **Étape 1 : la file d'attente**

`apps/admin/src/app/dossiers/page.tsx` — composant serveur :

```tsx
export default async function DossiersPage(): Promise<JSX.Element> {
    await exigerAdministrateur();
    const t = await getTranslations("dossiers");
    const dossiers = await listerDossiersSoumis(prisma);

    if (dossiers.length === 0) {
        return <p className="p-8">{t("fileVide")}</p>;
    }

    return (
        <table className="w-full">
            {/* Le plus ancien en haut : une file se traite dans l'ordre d'arrivée. */}
            <tbody>
                {dossiers.map((dossier) => (
                    <tr key={dossier.id}>
                        <td><Link href={`/dossiers/${dossier.id}`}>{dossier.shopName}</Link></td>
                        <td>{dossier.legalName}</td>
                        <td>{dossier.country}</td>
                        <td>{format.dateTime(dossier.submittedAt, "short")}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
```

- [ ] **Étape 2 : servir une pièce, autorisation vérifiée à chaque requête**

Créer `apps/admin/src/app/api/pieces/[id]/route.ts` :

```typescript
import { lirePiece } from "@clemperl/core";
import { prisma } from "@clemperl/db";
import { notFound } from "next/navigation";
import { exigerAdministrateur } from "../../../../lib/session";

// Un route handler plutôt qu'une URL signée : une URL signée est un PORTEUR — qui l'a,
// l'ouvre — et elle traîne dans l'historique, le presse-papier et les en-têtes
// `Referer`. Ici l'autorisation est réévaluée à chaque requête, et une révocation prend
// effet immédiatement. Le fichier transite par Next, ce qui est sans objet pour trois
// justificatifs lus par une poignée d'administrateurs.
export async function GET(
    _requete: Request,
    contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
    await exigerAdministrateur();

    const { id } = await contexte.params;
    const piece = await prisma.vendorDocument.findUnique({ where: { id } });

    if (!piece) {
        notFound();
    }

    const contenu = await lirePiece(piece.objectPath);

    return new Response(contenu, {
        headers: {
            "Content-Type": piece.mimeType,
            // `inline` : l'administrateur consulte, il ne collectionne pas. Le nom
            // d'origine est assaini — il vient de l'utilisateur et finit dans un en-tête.
            "Content-Disposition": `inline; filename="${piece.originalName.replace(/[^\w.\-]/g, "_")}"`,
            "Cache-Control": "private, no-store",
        },
    });
}
```

- [ ] **Étape 3 : la fiche**

`apps/admin/src/app/dossiers/[id]/page.tsx` : `exigerAdministrateur()`, puis
`lireDossierComplet`. Affiche les champs déclarés, la liste des pièces — chacune un lien
vers `/api/pieces/{id}` ouvert dans un nouvel onglet —, **le journal complet des
décisions** du plus récent au plus ancien, et le formulaire de décision si le dossier est
`SUBMITTED`.

- [ ] **Étape 4 : la server action de décision**

`apps/admin/src/app/dossiers/[id]/actions.ts` :

```typescript
"use server";

import { deciderSurDossier, lireDossierComplet, prisma } from "@clemperl/db";
import { construireMessageAcceptation, construireMessageRefus, validerDecision } from "@clemperl/domain";
// `ErreurDomaine` vit dans `@clemperl/core`, à côté du contrat `II18nExceptionResponse`
// qu'elle implémente — le domaine n'expose que ses erreurs concrètes.
import { envoyerEmail, ErreurDomaine } from "@clemperl/core";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { exigerAdministrateur } from "../../../lib/session";

export async function decider(
    _precedent: IEtatDecision,
    donnees: FormData,
): Promise<IEtatDecision> {
    const session = await exigerAdministrateur();
    const t = await getTranslations("errors.vendor_application");

    const applicationId = String(donnees.get("applicationId"));
    const dossier = await lireDossierComplet(prisma, applicationId);
    if (!dossier) {
        return { message: [t("not_found")] };
    }

    const entree = {
        applicationId,
        decidedById: session.user.id,
        candidatId: dossier.applicantId,
        decision: String(donnees.get("decision")) as "ACCEPTED" | "REJECTED",
        raison: (donnees.get("reason") || undefined) as never,
        commentaire: String(donnees.get("comment") ?? "") || undefined,
    };

    try {
        // Le domaine arbitre AVANT d'écrire : raison codée obligatoire sur un refus,
        // commentaire obligatoire quand la raison est `OTHER`, et interdiction de
        // décider sur son propre dossier.
        validerDecision(entree);
    } catch (erreur) {
        return {
            message: [erreur instanceof ErreurDomaine ? t(erreur.i18nKey.split(".").pop()!) : t("decide_failed")],
        };
    }

    let vendorId: string | null = null;
    try {
        ({ vendorId } = await deciderSurDossier(prisma, {
            applicationId,
            decidedById: session.user.id,
            decision: entree.decision,
            reason: entree.raison,
            comment: entree.commentaire,
        }));
    } catch (erreur) {
        const texte = String(erreur);
        // Deux administrateurs ont ouvert la même fiche : la base a tranché, pas nous.
        if (texte.includes("ALREADY_DECIDED")) {
            revalidatePath(`/dossiers/${applicationId}`);
            return { message: [t("already_decided")] };
        }
        // Deux boutiques homonymes : l'arbitrage du nom revient à l'administration.
        if (texte.includes("vendors_slug_key")) {
            return { message: [t("slug_conflict")] };
        }
        return { message: [t("decide_failed")] };
    }

    // Hors transaction, et dans la langue du DÉPÔT : l'administration travaille en
    // français, le candidat pas forcément.
    const message =
        vendorId === null
            ? construireMessageRefus(dossier.shopName, entree.commentaire ?? "", dossier.locale)
            : construireMessageAcceptation(dossier.shopName, dossier.locale);
    await envoyerEmail({ ...message, destinataire: dossier.applicant.email });

    revalidatePath("/dossiers");
    revalidatePath(`/dossiers/${applicationId}`);
    return { message: [] };
}
```

- [ ] **Étape 5 : le formulaire de décision**

`components/formulaire-decision.tsx`, composant client avec `useActionState` : deux
boutons (`decision=ACCEPTED` / `REJECTED`), un `<select name="reason">` listant les
valeurs de `E_VENDOR_REJECTION_REASON`, un `<textarea name="comment">`, et l'affichage
de `etat.message`. La contrainte « commentaire obligatoire si `OTHER` » **n'est pas
réécrite côté client** : elle est déjà dans le domaine, et une seconde copie divergerait.

- [ ] **Étape 6 : traductions**

Dans `packages/i18n/messages/admin/fr.json` : `dossiers.*` (titre, fileVide, colonnes,
champs de la fiche, libellés des pièces, journal), `decision.*` (accepter, refuser,
raison, commentaire), un libellé par valeur de `E_VENDOR_REJECTION_REASON`, et sous
`errors.vendor_application` : `not_found`, `already_decided`, `slug_conflict`,
`decide_failed`. Français seul.

- [ ] **Étape 7 : éprouver la course à deux administrateurs**

Le test d'intégration de la tâche 6 couvre la base. Ici on vérifie le message rendu :
ouvrir la même fiche dans deux onglets, accepter dans le premier, refuser dans le second.
Attendu : le second affiche « ce dossier a déjà été traité » et sa page se rafraîchit sur
la décision réelle.

- [ ] **Étape 8 : vérification et commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
git add apps/admin/ packages/i18n/
git commit -m "feat(admin): review, decide and read documents of vendor applications"
```

---

## Tâche 13 — Bout en bout, passation, et ouverture de la PR

**Fichiers :**
- Créer : `e2e/dossier-vendeur.spec.ts`
- Modifier : `docs/passation.md`
- Modifier : `docs/pieges.md`
- Créer : `e2e/fixtures/rccm.pdf`, `e2e/fixtures/identite.png`

**Interfaces :**
- Consomme : toutes les tâches précédentes.
- Produit : la preuve de la tranche telle qu'on la vit.

- [ ] **Étape 1 : les fixtures**

Deux petits fichiers valides, quelques kilo-octets, versionnés. Un PDF d'une page et un
PNG. Les générer plutôt que de copier des documents réels — aucun justificatif véritable
n'entre dans le dépôt.

- [ ] **Étape 2 : le parcours complet**

Créer `e2e/dossier-vendeur.spec.ts`. Lire `e2e/authentification.spec.ts` d'abord pour
reprendre sa façon de créer un compte et de traverser les applications.

```typescript
import { expect, test } from "@playwright/test";

// Le seul test qui prouve la tranche telle qu'on la vit : il traverse deux applications,
// un refus, une correction et une acceptation. Aucune assertion sur un en-tête ne
// remplacerait ce parcours.
test("un candidat dépose, est refusé, corrige, et devient vendeur", async ({ page, browser }) => {
    const suffixe = Date.now();
    const email = `candidat-${suffixe}@clemperl.test`;
    const nomBoutique = `Atelier ${suffixe}`;

    // `creerCompteVerifie` et `URL_STOREFRONT` / `URL_ADMIN` existent déjà dans
    // `e2e/authentification.spec.ts` et `playwright.config.ts` : les en extraire vers un
    // module partagé `e2e/aides/comptes.ts` plutôt que de les recopier ici.
    await creerCompteVerifie(request, email);
    await page.request.post(`${URL_STOREFRONT}/api/auth/sign-in/email`, {
        data: { email, password: MOT_DE_PASSE },
    });

    await page.goto(`${URL_STOREFRONT}/devenir-vendeur`);
    await page.fill('[name="shopName"]', nomBoutique);
    await page.fill('[name="shopDescription"]', "Maroquinerie artisanale, pièces uniques.");
    await page.fill('[name="contactEmail"]', email);
    await page.fill('[name="contactPhone"]', "+32470000000");
    await page.check('input[name="categories"][value="LEATHER_GOODS"]');
    await page.fill('[name="legalForm"]', "SRL");
    await page.fill('[name="legalName"]', `Atelier ${suffixe} SRL`);
    await page.fill('[name="registrationNumber"]', "0123456789");
    await page.fill('[name="country"]', "BE");
    await page.setInputFiles('[name="REGISTRY"]', "e2e/fixtures/rccm.pdf");
    await page.setInputFiles('[name="IDENTITY"]', "e2e/fixtures/identite.png");
    await page.getByRole("button", { name: /déposer|valider/i }).click();
    await expect(page.getByText(/en cours d'examen/i)).toBeVisible();

    // L'administrateur refuse, depuis un contexte de navigateur SÉPARÉ : deux
    //    sessions dans le même contexte partageraient le cookie et s'écraseraient.
    const contexteAdmin = await browser.newContext();
    const pageAdmin = await contexteAdmin.newPage();
    // Aucun administrateur n'est semé : sur une base neuve, la suite doit d'abord
    // amorcer l'instance. Une fois faite, la page d'amorçage disparaît — ce test ne peut
    // donc l'emprunter qu'une fois par base, ce qu'un `down -v` garantit.
    await pageAdmin.goto(`${URL_ADMIN}/installation`);
    if (await pageAdmin.getByRole("button", { name: /installer|cr\u00e9er/i }).isVisible()) {
        await pageAdmin.fill('[name="nom"]', "Administration");
        await pageAdmin.fill('[name="email"]', ADMIN_EMAIL);
        await pageAdmin.fill('[name="motDePasse"]', ADMIN_MOT_DE_PASSE);
        await pageAdmin.getByRole("button", { name: /installer|cr\u00e9er/i }).click();
    } else {
        await pageAdmin.request.post(`${URL_STOREFRONT}/api/auth/sign-in/email`, {
            data: { email: ADMIN_EMAIL, password: ADMIN_MOT_DE_PASSE },
        });
    }
    await pageAdmin.goto(`${URL_ADMIN}/dossiers`);
    await pageAdmin.getByRole("link", { name: nomBoutique }).click();
    await pageAdmin.selectOption('[name="reason"]', "UNREADABLE_DOCUMENT");
    await pageAdmin.fill('[name="comment"]', "Le registre est illisible.");
    await pageAdmin.getByRole("button", { name: /refuser/i }).click();

    // 4. Le candidat lit le motif et resoumet.
    await page.reload();
    await expect(page.getByText("Le registre est illisible.")).toBeVisible();
    await page.setInputFiles('[name="REGISTRY"]', "e2e/fixtures/rccm.pdf");
    await page.getByRole("button", { name: /renvoyer|valider/i }).click();
    await expect(page.getByText(/en cours d'examen/i)).toBeVisible();

    // 5. L'administrateur accepte, et la boutique existe.
    await pageAdmin.reload();
    await pageAdmin.getByRole("button", { name: /accepter/i }).click();
    await page.reload();
    await expect(page.getByText(new RegExp(nomBoutique))).toBeVisible();

    await contexteAdmin.close();
});
```

- [ ] **Étape 3 : jouer la suite entière, à froid**

```bash
docker compose --env-file .env -f docker/docker-compose.dev.yml down -v
pnpm docker:up
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

Le `down -v` compte : c'est le seul moyen de vérifier le critère 1 — un clone neuf
démarre sans intervention, migrations et bucket compris.

- [ ] **Étape 4 : la suite d'intégration, au complet**

```bash
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.e2e.ts --runInBand"
```

- [ ] **Étape 5 : vérification finale et seuils mesurés**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
```

Relire chaque `vitest.config.ts` touché : les planchers doivent porter la valeur
**mesurée aujourd'hui**, pas celle d'hier ni une valeur souhaitée.

- [ ] **Étape 6 : mettre la passation à jour**

Dans `docs/passation.md` : passer T1b à « livrée », ouvrir T2, et reprendre « Ce qui
reste ouvert » avec ce que cette tranche laisse derrière elle — le chemin Supabase hébergé
jamais joué, les objets orphelins non balayés, l'absence d'écran de modification d'une
boutique validée, l'obligation de `down -v` après la régénération des migrations.
Actualiser « Ce qui a été vérifié, et comment » avec les commandes réellement exécutées.

- [ ] **Étape 7 : consigner les pièges payés**

Dans `docs/pieges.md`, une entrée par piège réellement rencontré pendant le chantier — pas
par piège anticipé. Candidats probables : la configuration de `storage-api` hors CLI, le
plafond de corps des server actions, l'index unique partiel écrit à la main que
`prisma migrate dev` peut réécrire si on régénère la migration.

- [ ] **Étape 8 : décider du regroupement de l'historique**

L'utilisateur a autorisé les commits intermédiaires en demandant qu'on réduise
l'historique à la fin. Proposer un regroupement — par exemple trois commits : le
renommage au pluriel, les fondations (`domain`, `db`, `core`, stockage), puis les deux
parcours — et **attendre son arbitrage** avant de réécrire quoi que ce soit.

```bash
git log --oneline main..HEAD
# rien n'est poussé tant que la décision n'est pas prise
git branch -r --contains HEAD   # doit ne rien renvoyer
```

- [ ] **Étape 9 : ouvrir la PR**

Description **en anglais**, et **moins de 1500 caractères** — compter, ne pas estimer :

```bash
wc -m description.md
```

Elle porte, dans cet ordre : ce qui change ; ce qui n'est pas armé (le chemin Supabase
hébergé n'a jamais tourné, aucun balayage des objets orphelins, `apps/vendor` toujours
vide) ; ce qui n'a pas été vérifié ; les suites hors périmètre. Aucun trailer
d'attribution.
