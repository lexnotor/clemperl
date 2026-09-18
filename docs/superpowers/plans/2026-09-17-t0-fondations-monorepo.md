# Plan d'implémentation — T0 : Fondations du monorepo

**Avancement au 2026-09-18** : les treize tâches sont exécutées et vérifiées.
Sept critères d'acceptation sur huit sont satisfaits ; le huitième — affichage sur un
smartphone du réseau — exige un appareil réel et l'installation de l'autorité mkcert
dessus. Le commit final reste à exécuter par le propriétaire du dépôt.

> **Pour les exécutants agentiques :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes
> utilisent des cases à cocher (`- [ ]`).

**Objectif :** poser les fondations techniques de ClemPerl — monorepo Turborepo, quatre
applications dockerisées derrière un reverse proxy HTTPS, packages partagés, base de
données migrée, internationalisation et chaîne de tests — sans aucune fonctionnalité
métier.

**Architecture :** un workspace pnpm unique contient quatre applications (`storefront`,
`vendor`, `admin` en Next.js, `api` en NestJS) et six packages partagés. Chaque
application a son `Dockerfile` multi-cible : `dev` pour le développement conteneurisé,
`runner` issu de `turbo prune` pour une image de production minimale. Un proxy nginx
termine le TLS en 443 et route par nom d'hôte ; les ports applicatifs ne sont jamais
publiés.

**Stack :** pnpm · Turborepo 2.10.13 · Next.js 16.3.5 · NestJS 12.0.3 · React 19.3.0 ·
Prisma 7.10.0 · PostgreSQL 17 · Redis 7 · Tailwind CSS 4.3.3 · TypeScript 6.0.3 ·
ESLint 10.10.0 · Vitest 5.0.1 · Jest 30.5.1 · Playwright 1.63.0 · next-intl 4.14.5 ·
nginx · mkcert

**Spec :** `docs/superpowers/specs/2026-09-17-t0-fondations-monorepo-design.md`

---

## Écart assumé avec le skill `writing-plans`

Ce skill prescrit une étape « Commit » à la fin de chaque tâche. La convention du dépôt
([Git](../../conventions/git.md)) l'interdit : **un seul commit par chantier**, et
**aucune écriture git par l'agent**. Chaque tâche se termine donc par une étape de
**vérification**. Le commit final est rédigé par l'agent, en anglais, sans trailer
d'attribution, et **exécuté par le propriétaire du dépôt**.

---

## Contraintes globales

Ces exigences s'appliquent à **toutes** les tâches. Elles ne sont pas répétées ensuite.

### Versions, épinglées exactement

| Paquet | Version | Portée |
| --- | --- | --- |
| Node.js | 24 (image `node:24-alpine`) | partout |
| pnpm | activé par `corepack`, jamais installé globalement | partout |
| turbo | `2.10.13` | racine |
| next | `16.3.5` | 3 fronts |
| react / react-dom | `19.3.0` | 3 fronts, `@clemperl/ui` |
| @nestjs/core, @nestjs/common | `12.0.3` | `apps/api` |
| prisma, @prisma/client | `7.10.0` | `@clemperl/db` |
| typescript | `6.0.3` | partout |
| tailwindcss | `4.3.3` | 3 fronts, `@clemperl/ui` |
| eslint | `10.10.0` | partout |
| prettier | `3.9.7` | partout |
| vitest | `5.0.1` | 3 fronts, packages |
| jest | `30.5.1` | `apps/api` |
| @swc/jest | `0.2.39` | `apps/api` |
| supertest | `7.2.2` | `apps/api` |
| playwright | `1.63.0` | racine |
| next-intl | `4.14.5` | 3 fronts |
| zod | dernière stable au scaffold | `@clemperl/core` |

**TypeScript est épinglé en 6.0.3, pas en 7.x.** Deux outils majeurs refusent la 7 :
`ts-jest` (`>=4.3 <7`) et `typescript-eslint` 8.70.0 (`>=4.8.4 <6.1.0`), qui est la
version la plus haute publiée. La 6.0.3 est la plus haute stable que les deux acceptent.

### Conventions non négociables

- **Aucune commande git en écriture.** Ni `add`, ni `commit`, ni `branch`, ni `fetch`.
  Lecture libre. Pour l'état du distant, `gh api`, jamais `origin/*`.
- **Langue :** code, commentaires et documentation en **français** ; `README.md`,
  messages de commit et descriptions de PR en **anglais**.
- **Commentaires :** ils expliquent le *pourquoi*, au présent, et se suffisent à
  eux-mêmes. Jamais de renvoi à un paragraphe de document (« voir la spec §5.2 »).
  Chaque fichier non trivial ouvre sur une ligne disant son rôle.
- **Nommage :** fichiers en kebab-case ; enums `E_` + MAJUSCULE_SNAKE en object-literal
  `as const` avec leur type `T` dérivé ; interfaces `I` + PascalCase, sauf les props de
  composants (`ButtonProps`) ; types `T` + PascalCase ; constantes MAJUSCULE_SNAKE
  `as const`. Exception : les fichiers imposés par l'App Router (`page.tsx`, `layout.tsx`,
  `route.ts`) gardent leur nom.
- **Preuve :** aucune affirmation de bon fonctionnement sans exécution. Une image se
  vérifie construite, une stack démarrée, un script exécuté y compris sur ses chemins
  d'échec. Distinguer explicitement « vérifié en l'exécutant » de « vérifié sur la
  logique ».
- **Nettoyage :** conteneurs jetables et images intermédiaires supprimés avant de rendre
  la tâche.
- **Aucun secret versionné.** Seul `.env.example` l'est, avec des valeurs factices.

### Le tout-conteneur et ses deux pièges

Le développement se fait intégralement dans Docker.

1. `node_modules` et `.next` sont des **volumes nommés**, jamais montés depuis l'hôte :
   un montage masquerait les dépendances installées dans l'image et les binaires natifs
   (moteurs Prisma) seraient ceux de l'hôte.
2. Après l'ajout d'un package, `pnpm docker:up -V` **ne suffit pas** :
   `--renew-anon-volumes` ne vise que les volumes anonymes. Utiliser
   `pnpm docker:down --volumes`.

---

## Structure des fichiers

### Racine

| Fichier | Responsabilité |
| --- | --- |
| `package.json` | manifeste racine, scripts d'orchestration, `packageManager` |
| `pnpm-workspace.yaml` | déclare `apps/*` et `packages/*` |
| `turbo.json` | graphe de tâches, `globalEnv`, entrées/sorties de cache |
| `tsconfig.json` | racine, ne fait que référencer `@clemperl/tsconfig` |
| `.gitignore` | déjà présent — trois entrées ajoutées en tâche 1, étape 8 |
| `.dockerignore` | **le seul lu** par les builds, dont le contexte est la racine |
| `.env.example` | modèle documenté, valeurs factices |
| `README.md` | **en anglais** — vitrine du dépôt public |
| `.vscode/settings.json` | file nesting : replie les tests sous leur source |
| `docker/docker-compose.dev.yml` | dev : Postgres, Redis, nginx, les 4 apps |
| `playwright.config.ts` | e2e navigateur, joué contre le compose |
| `.github/workflows/ci.yml` | lint, typecheck, test, build, docker, e2e |
| `.husky/pre-commit` | lint-staged + gitleaks |

### Packages

| Package | Rôle | Dépend de |
| --- | --- | --- |
| `packages/tsconfig` | configurations TypeScript partagées | — |
| `packages/eslint-config` | configuration plate ESLint 10 partagée | — |
| `packages/core` | vocabulaire métier : `Money`, validation d'environnement | — |
| `packages/db` | schéma Prisma, client singleton, migrations, seed | `core` |
| `packages/i18n` | configuration next-intl, catalogues `fr` / `en` | — |
| `packages/ui` | composants shadcn, tokens, thème | `core` |

Règle de dépendance : `apps/*` → `core, db, ui, i18n` ; `db` → `core` ; `ui` → `core` ;
`core` et `i18n` ne dépendent de rien. Toute flèche inverse est un défaut de conception.

### Applications

| Application | Techno | Port interne | Nom de développement |
| --- | --- | --- | --- |
| `apps/storefront` | Next 16 | 3000 | `${DEV_HOST}` |
| `apps/vendor` | Next 16 | 3001 | `vendeur.${DEV_HOST}` |
| `apps/admin` | Next 16 | 3002 | `admin.${DEV_HOST}` |
| `apps/api` | NestJS 12 | 3003 | `api.${DEV_HOST}` |
| `docker/proxy` | nginx | 443 (publié) | — |

Aucun port applicatif n'est publié : nginx est le seul point d'entrée.

---

## Tâche 1 : Squelette du workspace

**Fichiers :**
- Créer : `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`,
  `.dockerignore`, `.env.example`, `README.md`, `.vscode/settings.json`
- Modifier : `.gitignore`

**Interfaces :**
- Produit : le workspace `@clemperl/*` ; les scripts racine `lint`, `typecheck`, `test`,
  `build`, `dev` ; la variable `DEV_HOST` comme unique source de vérité des URL.

- [x] **Étape 1 : activer pnpm par corepack et vérifier**

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

Attendu : un numéro de version s'affiche. Si `corepack` est absent, s'arrêter et le
signaler — ne pas installer pnpm globalement.

- [x] **Étape 2 : écrire le manifeste racine**

`package.json` :

```json
{
  "name": "clemperl",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:e2e": "playwright test",
    "dev:certs": "./scripts/dev-certs.sh"
  },
  "devDependencies": {
    "turbo": "2.10.13",
    "typescript": "6.0.3",
    "prettier": "3.9.7"
  }
}
```

Remplacer `pnpm@10.0.0` par la version réellement affichée à l'étape 1.

- [x] **Étape 3 : déclarer le workspace**

`pnpm-workspace.yaml` :

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [x] **Étape 4 : écrire le graphe de tâches Turborepo**

`turbo.json` — le commentaire d'en-tête explique pourquoi `globalEnv` existe :

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalEnv": [
    "NODE_ENV",
    "DATABASE_URL",
    "REDIS_URL",
    "DEV_HOST",
    "NEXT_PUBLIC_STOREFRONT_URL",
    "NEXT_PUBLIC_VENDOR_URL",
    "NEXT_PUBLIC_ADMIN_URL",
    "NEXT_PUBLIC_API_URL"
  ],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] }
  }
}
```

Toute variable consommée pendant un build doit figurer dans `globalEnv`. Une variable
absente de cette liste laisse Turbo servir un artefact construit avec l'ancienne valeur,
ce qui se manifeste comme un bug fantôme disparaissant après un build forcé.

- [x] **Étape 5 : écrire le `.dockerignore` racine**

Le contexte de build étant la racine, c'est le **seul** `.dockerignore` que Docker lit.

```
node_modules
**/node_modules
.git
.github
.next
**/.next
dist
**/dist
.turbo
**/.turbo
coverage
**/coverage
test-results
playwright-report
docs
certs
.env
.env.*
!.env.example
*.log
```

- [x] **Étape 6 : mesurer l'effet du `.dockerignore`**

```bash
du -sh --exclude=node_modules --exclude=.git . && du -sh .
```

Noter les deux chiffres dans `docs/conventions/monorepo.md`, à la place de la ligne
*« Taille du contexte : à mesurer au premier build »*. Un chiffre mesuré, jamais estimé.

- [x] **Étape 7 : écrire `.env.example`**

```bash
NODE_ENV=development

DATABASE_URL=postgresql://clemperl:clemperl@postgres:5432/clemperl
REDIS_URL=redis://redis:6379

# Adresse locale de la machine, notation à tirets.
# Unique source de vérité : toutes les URL ci-dessous en dérivent.
# Si l'adresse change : mettre à jour ici PUIS relancer `pnpm dev:certs`.
DEV_HOST=192-168-1-42.sslip.io

NEXT_PUBLIC_STOREFRONT_URL=https://${DEV_HOST}
NEXT_PUBLIC_VENDOR_URL=https://vendeur.${DEV_HOST}
NEXT_PUBLIC_ADMIN_URL=https://admin.${DEV_HOST}
NEXT_PUBLIC_API_URL=https://api.${DEV_HOST}

# Décommenter si le rechargement à chaud ne réagit pas (repli inotify).
# WATCHPACK_POLLING=true
```

- [x] **Étape 8 : compléter `.gitignore`**

Ajouter aux entrées existantes :

```
certs/
.vscode/*
!.vscode/settings.json
```

`certs/` contient les certificats mkcert, qui ne se versionnent jamais.

- [x] **Étape 9 : écrire `.vscode/settings.json`**

```jsonc
{
    "explorer.fileNesting.enabled": true,
    "explorer.fileNesting.patterns": {
        "*.ts": "${capture}.spec.ts, ${capture}.int-spec.ts, ${capture}.contract-spec.ts",
        "*.tsx": "${capture}.spec.tsx"
    }
}
```

- [x] **Étape 10 : écrire le `README.md`, en anglais**

```markdown
# ClemPerl

Multi-vendor marketplace for apparel, jewellery and bags.

## Stack

Turborepo monorepo: Next.js storefront, vendor and admin apps, NestJS API,
PostgreSQL with Prisma, Redis, Supabase Storage for media.

## Getting started

    corepack enable
    cp .env.example .env      # set DEV_HOST to this machine's LAN address
    pnpm install
    pnpm dev:certs            # local TLS certificate for DEV_HOST
    pnpm docker:up

The apps are served over HTTPS by nginx. Application ports are never published.

## Documentation

Conventions and design documents live in `docs/`, in French.
```

- [x] **Étape 11 : installer et vérifier**

```bash
pnpm install
pnpm turbo run build --dry-run
```

Attendu : l'installation se termine sans erreur, `pnpm-lock.yaml` est créé à la racine,
et le `--dry-run` liste zéro tâche sans échouer — aucun package n'existe encore.

- [x] **Étape 12 : vérifier qu'aucun lockfile parasite n'existe**

```bash
find . -name "package-lock.json" -o -name "yarn.lock" -not -path "./node_modules/*"
```

Attendu : aucune sortie. Un seul lockfile, `pnpm-lock.yaml`, à la racine.

---

## Tâche 2 : Packages de configuration partagée

**Fichiers :**
- Créer : `packages/tsconfig/package.json`, `packages/tsconfig/base.json`,
  `packages/tsconfig/next.json`, `packages/tsconfig/nest.json`
- Créer : `packages/eslint-config/package.json`, `packages/eslint-config/index.js`

**Interfaces :**
- Produit : `@clemperl/tsconfig/base.json`, `/next.json`, `/nest.json` — étendus par tous
  les autres `tsconfig.json` ; `@clemperl/eslint-config` — importé par tous les
  `eslint.config.js`.

- [x] **Étape 1 : créer le package de configurations TypeScript**

`packages/tsconfig/package.json` :

```json
{
  "name": "@clemperl/tsconfig",
  "version": "0.0.0",
  "private": true,
  "files": ["base.json", "next.json", "nest.json"]
}
```

`packages/tsconfig/base.json` — `noUncheckedIndexedAccess` est le réglage qui attrape
les accès de tableau non vérifiés, source d'erreurs à l'exécution que `strict` seul
laisse passer :

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "noEmit": true
  }
}
```

`packages/tsconfig/next.json` :

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "plugins": [{ "name": "next" }]
  }
}
```

`packages/tsconfig/nest.json` — NestJS a besoin des décorateurs et émet vers `dist/` :

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "noEmit": false,
    "outDir": "./dist"
  }
}
```

- [x] **Étape 2 : créer le package de configuration ESLint**

`packages/eslint-config/package.json` :

```json
{
  "name": "@clemperl/eslint-config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "index.js",
  "dependencies": {
    "@eslint/js": "^10.0.0",
    "typescript-eslint": "^8.0.0",
    "eslint-config-prettier": "^10.0.0"
  }
}
```

`packages/eslint-config/index.js` :

```javascript
// Configuration ESLint partagée par les quatre applications et les packages.
// La règle no-restricted-imports fait respecter le sens des dépendances :
// aucun package de bas niveau ne peut remonter vers une application.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["@clemperl/storefront/*", "@clemperl/vendor/*",
                                    "@clemperl/admin/*", "@clemperl/api/*"],
                            message:
                                "Un package ne dépend jamais d'une application. " +
                                "Déplacer le code partagé dans @clemperl/core.",
                        },
                    ],
                },
            ],
        },
    },
);
```

- [x] **Étape 3 : installer et vérifier que les configurations se résolvent**

```bash
pnpm install
pnpm ls -r --depth -1
```

Attendu : les deux packages apparaissent dans la liste du workspace.

Ne pas tenter `require.resolve("@clemperl/tsconfig/base.json")` depuis la racine : pnpm
ne lie un package que là où il est déclaré en dépendance, et la racine ne le déclare pas.
L'échec de résolution y serait le comportement normal, pas un défaut d'installation. La
vraie vérification a lieu à la tâche 3, depuis un package qui le consomme.

---

## Tâche 3 : `@clemperl/core` — `Money` et validation d'environnement

**Fichiers :**
- Créer : `packages/core/package.json`, `packages/core/tsconfig.json`,
  `packages/core/eslint.config.js`, `packages/core/vitest.config.ts`
- Créer : `packages/core/src/enums/currency.enum.ts`,
  `packages/core/src/enums/index.ts`
- Créer : `packages/core/src/constants/currency-exponent.constant.ts`,
  `packages/core/src/constants/index.ts`
- Créer : `packages/core/src/interfaces/money.interface.ts`,
  `packages/core/src/interfaces/index.ts`
- Créer : `packages/core/src/utils/money.utils.ts`,
  `packages/core/src/utils/money.utils.spec.ts`, `packages/core/src/utils/index.ts`
- Créer : `packages/core/src/schemas/base-env.schema.ts`,
  `packages/core/src/schemas/index.ts`

**Interfaces :**
- Produit : `IMoney { amount: number; currency: TCurrency }` ;
  `addMoney(a: IMoney, b: IMoney): IMoney` ;
  `formatMoney(money: IMoney, locale: string): string` ;
  `E_CURRENCY` / `TCurrency` ; `CURRENCY_EXPONENT` ;
  `parseBaseEnv(source: Record<string, string | undefined>): TBaseEnv`.

- [x] **Étape 1 : créer le manifeste et les configurations du package**

`packages/core/package.json` :

```json
{
  "name": "@clemperl/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --coverage"
  },
  "dependencies": { "zod": "4.6.5" },
  "devDependencies": {
    "@clemperl/eslint-config": "workspace:*",
    "@clemperl/tsconfig": "workspace:*",
    "@vitest/coverage-v8": "5.0.1",
    "eslint": "10.10.0",
    "typescript": "6.0.3",
    "vitest": "5.0.1"
  }
}
```

`packages/core/tsconfig.json` :

```json
{
  "extends": "@clemperl/tsconfig/base.json",
  "include": ["src/**/*.ts"]
}
```

`packages/core/eslint.config.js` :

```javascript
import config from "@clemperl/eslint-config";
export default config;
```

`packages/core/vitest.config.ts` :

```typescript
// Seuils de couverture : plancher mesuré, jamais souhaité (cliquet, tâche 13).
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            exclude: ["**/index.ts", "**/*.config.ts"],
        },
    },
});
```

Les barrels `index.ts` sont exclus de la couverture : ils ne contiennent aucune logique
et feraient baisser un pourcentage qu'aucun test ne peut relever.

- [x] **Étape 2 : écrire les devises et leurs exposants**

`packages/core/src/enums/currency.enum.ts` :

```typescript
// Devises acceptées par la plateforme, en codes ISO 4217.
export const E_CURRENCY = {
    EUR: "EUR",
    USD: "USD",
    XOF: "XOF",
    XAF: "XAF",
    CDF: "CDF",
} as const;

export type TCurrency = (typeof E_CURRENCY)[keyof typeof E_CURRENCY];
```

`packages/core/src/constants/currency-exponent.constant.ts` :

```typescript
import { E_CURRENCY, type TCurrency } from "../enums";

// Nombre de décimales de chaque devise. Le franc CFA n'en a AUCUNE :
// diviser un montant par 100 y produit un prix cent fois trop petit.
// Toute conversion passe par cette table, jamais par une constante écrite en dur.
export const CURRENCY_EXPONENT: Record<TCurrency, number> = {
    [E_CURRENCY.EUR]: 2,
    [E_CURRENCY.USD]: 2,
    [E_CURRENCY.XOF]: 0,
    [E_CURRENCY.XAF]: 0,
    [E_CURRENCY.CDF]: 2,
} as const;
```

- [x] **Étape 3 : écrire l'interface `IMoney`**

`packages/core/src/interfaces/money.interface.ts` :

```typescript
import type { TCurrency } from "../enums";

// Un montant est TOUJOURS un entier dans l'unité mineure de sa devise
// (centimes pour l'euro, francs pour le XOF), accompagné de cette devise.
// Un nombre à virgule flottante ne peut pas représenter un prix sans erreur
// d'arrondi cumulative.
export interface IMoney {
    amount: number;
    currency: TCurrency;
}
```

- [x] **Étape 4 : écrire le test qui échoue**

`packages/core/src/utils/money.utils.spec.ts` :

```typescript
import { describe, expect, it } from "vitest";
import { E_CURRENCY } from "../enums";
import { addMoney, formatMoney } from "./money.utils";

describe("addMoney", () => {
    it("additionne deux montants de même devise", () => {
        const total = addMoney(
            { amount: 1999, currency: E_CURRENCY.EUR },
            { amount: 501, currency: E_CURRENCY.EUR },
        );
        expect(total).toEqual({ amount: 2500, currency: E_CURRENCY.EUR });
    });

    it("refuse d'additionner deux devises différentes", () => {
        expect(() =>
            addMoney(
                { amount: 1000, currency: E_CURRENCY.EUR },
                { amount: 1000, currency: E_CURRENCY.XOF },
            ),
        ).toThrow("devises différentes");
    });
});

describe("formatMoney", () => {
    it("place deux décimales pour l'euro", () => {
        const texte = formatMoney({ amount: 1999, currency: E_CURRENCY.EUR }, "fr-FR");
        expect(texte).toContain("19,99");
    });

    it("n'introduit AUCUNE décimale pour le franc CFA", () => {
        const texte = formatMoney({ amount: 1999, currency: E_CURRENCY.XOF }, "fr-FR");
        expect(texte).toContain("1");
        expect(texte).not.toContain("19,99");
        expect(texte).not.toContain("19.99");
    });
});
```

Le dernier test est celui qui compte : il échoue si quelqu'un écrit `amount / 100`.

- [x] **Étape 5 : exécuter le test et vérifier qu'il ÉCHOUE**

```bash
pnpm --filter @clemperl/core test
```

Attendu : échec sur `Cannot find module './money.utils'`. Un test qui n'a jamais échoué
ne prouve rien.

- [x] **Étape 6 : écrire l'implémentation minimale**

`packages/core/src/utils/money.utils.ts` :

```typescript
import { CURRENCY_EXPONENT } from "../constants";
import type { IMoney } from "../interfaces";

// Additionne deux montants. Lève si les devises diffèrent : additionner des euros
// et des francs CFA n'a pas de sens, et le silence produirait un total faux
// qu'aucun type ne signalerait.
export function addMoney(a: IMoney, b: IMoney): IMoney {
    if (a.currency !== b.currency) {
        throw new Error(
            `Addition impossible entre devises différentes : ${a.currency} et ${b.currency}`,
        );
    }
    return { amount: a.amount + b.amount, currency: a.currency };
}

// Formate un montant pour l'affichage. L'exposant vient de la table des devises :
// le XOF en a zéro, donc son montant s'affiche tel quel.
export function formatMoney(money: IMoney, locale: string): string {
    const exposant = CURRENCY_EXPONENT[money.currency];
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: money.currency,
        minimumFractionDigits: exposant,
        maximumFractionDigits: exposant,
    }).format(money.amount / 10 ** exposant);
}
```

- [x] **Étape 7 : exécuter le test et vérifier qu'il PASSE**

```bash
pnpm --filter @clemperl/core test
```

Attendu : 4 tests passent. Noter le pourcentage de couverture affiché — il servira de
plancher à la tâche 13.

- [x] **Étape 8 : écrire la validation d'environnement**

`packages/core/src/schemas/base-env.schema.ts` :

```typescript
import { z } from "zod";

// Validé au démarrage de chaque application. Une variable absente fait échouer
// le boot avec un message nommant la variable, plutôt qu'un `undefined` qui se
// propage et explose trois écrans plus loin, loin de sa cause.
export const baseEnvSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    DEV_HOST: z.string().min(1),
});

export type TBaseEnv = z.infer<typeof baseEnvSchema>;

export function parseBaseEnv(source: Record<string, string | undefined>): TBaseEnv {
    const resultat = baseEnvSchema.safeParse(source);
    if (!resultat.success) {
        const details = resultat.error.issues
            .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
            .join("\n");
        throw new Error(`Environnement invalide :\n${details}`);
    }
    return resultat.data;
}
```

- [x] **Étape 9 : écrire les barrels et le point d'entrée**

Chaque sous-dossier porte son `index.ts` ; la racine du package expose l'ensemble.

```typescript
// packages/core/src/enums/index.ts
export * from "./currency.enum";

// packages/core/src/constants/index.ts
export * from "./currency-exponent.constant";

// packages/core/src/interfaces/index.ts
export * from "./money.interface";

// packages/core/src/utils/index.ts
export * from "./money.utils";

// packages/core/src/schemas/index.ts
export * from "./base-env.schema";

// packages/core/src/index.ts
export * from "./constants";
export * from "./enums";
export * from "./interfaces";
export * from "./schemas";
export * from "./utils";
```

- [x] **Étape 10 : vérifier lint, typage et tests**

```bash
pnpm --filter @clemperl/core lint
pnpm --filter @clemperl/core typecheck
pnpm --filter @clemperl/core test
```

Attendu : les trois passent. `@clemperl/core` ne doit dépendre que de `zod` — vérifier
que `package.json` ne contient ni React, ni Prisma, ni rien de NestJS.

---

## Tâche 4 : `@clemperl/db` — Prisma, migration et seed

**Fichiers :**
- Créer : `packages/db/package.json`, `packages/db/tsconfig.json`,
  `packages/db/eslint.config.js`
- Créer : `packages/db/prisma/schema.prisma`, `packages/db/prisma/seed.ts`
- Créer : `packages/db/src/client.ts`, `packages/db/src/index.ts`

**Interfaces :**
- Consomme : rien de `core` en T0 ; la dépendance est déclarée pour le sens du graphe.
- Produit : `prisma` (instance `PrismaClient` unique) ; les types générés `User` et
  `E_USER_ROLE` ; la table `user` et le type PostgreSQL `user_role`.

- [x] **Étape 1 : créer le manifeste**

`packages/db/package.json` :

```json
{
  "name": "@clemperl/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "echo \"aucun test unitaire : ce package n'a pas de logique\" && exit 0",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "dependencies": {
    "@clemperl/core": "workspace:*",
    "@prisma/client": "7.10.0"
  },
  "devDependencies": {
    "@clemperl/eslint-config": "workspace:*",
    "@clemperl/tsconfig": "workspace:*",
    "eslint": "10.10.0",
    "prisma": "7.10.0",
    "tsx": "^4.0.0",
    "typescript": "6.0.3"
  }
}
```

Le script `test` réussit volontairement sans rien exécuter : ce package n'expose que le
client généré et n'a aucune logique propre. Un test vide y serait du bruit, et le faire
échouer bloquerait `turbo run test` sans rien protéger.

- [x] **Étape 2 : écrire le schéma Prisma**

`packages/db/prisma/schema.prisma` :

```prisma
// Source de vérité du modèle de données. Les noms de tables sont au singulier et
// dans le schéma `public` : cloisonner par schémas PostgreSQL se décide avant les
// premières migrations, pas après.

generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum E_USER_ROLE {
  CUSTOMER
  VENDOR
  ADMIN

  @@map("user_role")
}

model User {
  id        String      @id @default(cuid(2))
  email     String      @unique
  name      String?
  role      E_USER_ROLE @default(CUSTOMER)
  createdAt DateTime    @default(now()) @map("created_at")
  updatedAt DateTime    @updatedAt @map("updated_at")
  deletedAt DateTime?   @map("deleted_at")

  // `user` est un mot réservé en SQL. Prisma échappe les identifiants qu'il génère,
  // donc les migrations passent ; toute requête écrite à la main doit quoter "user".
  @@map("user")
}
```

- [x] **Étape 3 : valider la syntaxe du schéma**

```bash
pnpm --filter @clemperl/db exec prisma validate
```

Attendu : `The schema at prisma/schema.prisma is valid`.

Si `@default(cuid(2))` est rejeté, c'est que cette forme n'existe pas dans Prisma 7.10 —
remplacer par `@default(cuid())` et **le signaler**, car la spec annonce cuid2.

- [x] **Étape 4 : écrire le client singleton**

`packages/db/src/client.ts` :

```typescript
import { PrismaClient } from "@prisma/client";

// Une seule instance par processus. En développement, le rechargement à chaud
// réévalue les modules et créerait une instance par rechargement : chacune ouvre
// son pool de connexions, et PostgreSQL finit par refuser les nouvelles.
// L'instance est donc accrochée à globalThis, qui survit au rechargement.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
```

`packages/db/src/index.ts` :

```typescript
export * from "./client";
export type { User } from "@prisma/client";
export { E_USER_ROLE } from "@prisma/client";
```

- [x] **Étape 5 : écrire le seed**

`packages/db/prisma/seed.ts` :

```typescript
import { E_USER_ROLE, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Compte d'administration de développement. `upsert` plutôt que `create` :
// le seed doit pouvoir être rejoué sur une base déjà peuplée sans échouer
// sur la contrainte d'unicité de l'adresse.
async function main(): Promise<void> {
    const admin = await prisma.user.upsert({
        where: { email: "admin@clemperl.test" },
        update: {},
        create: {
            email: "admin@clemperl.test",
            name: "Administration ClemPerl",
            role: E_USER_ROLE.ADMIN,
        },
    });
    console.log(`Compte d'administration prêt : ${admin.email} (${admin.id})`);
}

main()
    .catch((erreur: unknown) => {
        console.error(erreur);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
```

- [x] **Étape 6 : démarrer un PostgreSQL jetable pour prouver la migration**

Le compose n'existe pas encore : on se donne une base le temps de la vérification.

```bash
docker run --rm -d --name clemperl-db-check \
  -e POSTGRES_USER=clemperl -e POSTGRES_PASSWORD=clemperl -e POSTGRES_DB=clemperl \
  -p 55432:5432 postgres:17-alpine

until docker exec clemperl-db-check pg_isready -U clemperl; do sleep 1; done
```

- [x] **Étape 7 : jouer la migration initiale**

```bash
cd packages/db
DATABASE_URL="postgresql://clemperl:clemperl@localhost:55432/clemperl" \
  pnpm exec prisma migrate dev --name init
```

Attendu : le dossier `prisma/migrations/<horodatage>_init/` est créé et la migration
s'applique. C'est une preuve d'**exécution**, pas de lecture.

- [x] **Étape 8 : jouer le seed et vérifier en base**

```bash
DATABASE_URL="postgresql://clemperl:clemperl@localhost:55432/clemperl" \
  pnpm exec tsx prisma/seed.ts

docker exec clemperl-db-check psql -U clemperl -d clemperl \
  -c 'SELECT id, email, role FROM "user";'
```

Attendu : une ligne, rôle `ADMIN`. Noter que la table s'interroge avec `"user"` entre
guillemets — c'est le mot réservé annoncé dans le schéma.

- [x] **Étape 9 : nettoyer le conteneur jetable**

```bash
docker rm -f clemperl-db-check
docker ps -a --filter name=clemperl-db-check
```

Attendu : aucune ligne. Rien de jetable ne survit à la tâche qui l'a créé.

---

## Tâche 5 : `@clemperl/i18n` — next-intl, français par défaut

**Fichiers :**
- Créer : `packages/i18n/package.json`, `packages/i18n/tsconfig.json`,
  `packages/i18n/eslint.config.js`, `packages/i18n/vitest.config.ts`
- Créer : `packages/i18n/src/config.ts`, `packages/i18n/src/config.spec.ts`,
  `packages/i18n/src/index.ts`
- Créer : `packages/i18n/messages/storefront/fr.json`,
  `packages/i18n/messages/storefront/en.json`
- Créer : `packages/i18n/messages/vendor/fr.json`,
  `packages/i18n/messages/admin/fr.json`

**Interfaces :**
- Produit : `E_LOCALE` / `TLocale` ; `DEFAULT_LOCALE = "fr"` ; `LOCALES` ;
  `isSupportedLocale(valeur: string): valeur is TLocale`.

- [x] **Étape 1 : créer le manifeste**

`packages/i18n/package.json` :

```json
{
  "name": "@clemperl/i18n",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./messages/*": "./messages/*"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --coverage"
  },
  "devDependencies": {
    "@clemperl/eslint-config": "workspace:*",
    "@clemperl/tsconfig": "workspace:*",
    "@vitest/coverage-v8": "5.0.1",
    "eslint": "10.10.0",
    "typescript": "6.0.3",
    "vitest": "5.0.1"
  }
}
```

- [x] **Étape 2 : écrire le test qui échoue**

`packages/i18n/src/config.spec.ts` :

```typescript
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, isSupportedLocale } from "./config";

describe("configuration des locales", () => {
    it("place le français en locale par défaut", () => {
        expect(DEFAULT_LOCALE).toBe("fr");
    });

    it("expose exactement le français et l'anglais", () => {
        expect(LOCALES).toEqual(["fr", "en"]);
    });

    it("reconnaît une locale supportée", () => {
        expect(isSupportedLocale("fr")).toBe(true);
        expect(isSupportedLocale("en")).toBe(true);
    });

    it("rejette une locale inconnue", () => {
        expect(isSupportedLocale("de")).toBe(false);
        expect(isSupportedLocale("")).toBe(false);
    });
});
```

- [x] **Étape 3 : exécuter et vérifier l'échec**

```bash
pnpm --filter @clemperl/i18n test
```

Attendu : échec sur module introuvable.

- [x] **Étape 4 : écrire la configuration**

`packages/i18n/src/config.ts` :

```typescript
// Locales de la plateforme. Le français est la langue par défaut du marché visé ;
// il reste donc SANS préfixe d'URL sur la boutique (`/produits`), l'anglais étant
// préfixé (`/en/produits`). Un préfixe sur la langue majoritaire dilue le référencement.
export const E_LOCALE = {
    FR: "fr",
    EN: "en",
} as const;

export type TLocale = (typeof E_LOCALE)[keyof typeof E_LOCALE];

export const DEFAULT_LOCALE: TLocale = E_LOCALE.FR;

export const LOCALES: readonly TLocale[] = [E_LOCALE.FR, E_LOCALE.EN];

export function isSupportedLocale(valeur: string): valeur is TLocale {
    return (LOCALES as readonly string[]).includes(valeur);
}
```

`packages/i18n/src/index.ts` :

```typescript
export * from "./config";
```

- [x] **Étape 5 : exécuter et vérifier le succès**

```bash
pnpm --filter @clemperl/i18n test
```

Attendu : 4 tests passent.

- [x] **Étape 6 : écrire les catalogues, découpés par application**

Le découpage par application évite d'envoyer les libellés de l'administration dans le
paquet servi au public.

`packages/i18n/messages/storefront/fr.json` :

```json
{
  "accueil": {
    "titre": "ClemPerl",
    "sousTitre": "Vêtements, joaillerie et maroquinerie de vendeurs indépendants"
  },
  "navigation": { "boutique": "Boutique", "compte": "Mon compte" }
}
```

`packages/i18n/messages/storefront/en.json` :

```json
{
  "accueil": {
    "titre": "ClemPerl",
    "sousTitre": "Apparel, jewellery and bags from independent sellers"
  },
  "navigation": { "boutique": "Shop", "compte": "My account" }
}
```

`packages/i18n/messages/vendor/fr.json` :

```json
{ "accueil": { "titre": "Espace vendeur" } }
```

`packages/i18n/messages/admin/fr.json` :

```json
{ "accueil": { "titre": "Administration ClemPerl" } }
```

Les clés sont en français et imbriquées par domaine. Une clé est un identifiant stable :
une phrase entière en guise de clé casse toutes les langues au premier ajustement de ton.

- [x] **Étape 7 : vérifier que `fr` et `en` ont les mêmes clés**

```bash
cd packages/i18n
node -e '
const fr = require("./messages/storefront/fr.json");
const en = require("./messages/storefront/en.json");
const plat = (o, p = "") => Object.entries(o).flatMap(([k, v]) =>
    typeof v === "object" ? plat(v, p + k + ".") : [p + k]);
const a = plat(fr).sort(), b = plat(en).sort();
const manquantes = a.filter((k) => !b.includes(k));
const surplus = b.filter((k) => !a.includes(k));
if (manquantes.length || surplus.length) {
    console.error("Clés désynchronisées", { manquantes, surplus });
    process.exit(1);
}
console.log(`${a.length} clés, fr et en synchronisées`);
'
```

Attendu : le compte de clés s'affiche, sortie 0. Une clé absente d'une langue retombe
silencieusement sur une autre langue, sans que rien ne le signale.

---

## Tâche 6 : `@clemperl/ui` — design system partagé

**Fichiers :**
- Créer : `packages/ui/package.json`, `packages/ui/tsconfig.json`,
  `packages/ui/eslint.config.js`, `packages/ui/vitest.config.ts`
- Créer : `packages/ui/src/styles/globals.css`
- Créer : `packages/ui/src/utils/cn.utils.ts`, `packages/ui/src/utils/index.ts`
- Créer : `packages/ui/src/components/button.tsx`,
  `packages/ui/src/components/button.spec.tsx`,
  `packages/ui/src/components/index.ts`
- Créer : `packages/ui/src/index.ts`

**Interfaces :**
- Produit : `Button` (composant React) ; `ButtonProps` ; `cn(...entrées)` ;
  `@clemperl/ui/styles/globals.css` importable par les trois fronts.

- [x] **Étape 1 : créer le manifeste**

`packages/ui/package.json` :

```json
{
  "name": "@clemperl/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./styles/globals.css": "./src/styles/globals.css"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --coverage"
  },
  "dependencies": {
    "@clemperl/core": "workspace:*",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^3.0.0"
  },
  "peerDependencies": { "react": "19.3.0", "react-dom": "19.3.0" },
  "devDependencies": {
    "@clemperl/eslint-config": "workspace:*",
    "@clemperl/tsconfig": "workspace:*",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "@vitest/coverage-v8": "5.0.1",
    "eslint": "10.10.0",
    "jsdom": "^26.0.0",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "tailwindcss": "4.3.3",
    "typescript": "6.0.3",
    "vitest": "5.0.1"
  }
}
```

React est en `peerDependencies` : le package ne doit pas embarquer sa propre copie, sinon
deux instances de React coexistent et les hooks lèvent à l'exécution.

`packages/ui/tsconfig.json` :

```json
{
  "extends": "@clemperl/tsconfig/next.json",
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

`packages/ui/vitest.config.ts` :

```typescript
// Les composants se rendent dans jsdom : il n'y a pas de navigateur ici.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test-setup.ts"],
        coverage: { provider: "v8", exclude: ["**/index.ts", "**/*.config.ts"] },
    },
});
```

`packages/ui/src/test-setup.ts` :

```typescript
import "@testing-library/jest-dom/vitest";
```

- [x] **Étape 2 : écrire les tokens de thème**

Tailwind 4 se configure en CSS : il n'y a pas de `tailwind.config.js`.

`packages/ui/src/styles/globals.css` :

```css
/* Tokens partagés par les trois fronts. Les couleurs sont déclarées en variables
   plutôt qu'en classes utilitaires figées : le thème sombre les redéfinit sans
   toucher un seul composant. */
@import "tailwindcss";

@theme {
    --color-fond: oklch(100% 0 0);
    --color-texte: oklch(20% 0 0);
    --color-accent: oklch(55% 0.18 15);
    --color-bordure: oklch(90% 0 0);
    --radius-controle: 0.5rem;
}

@media (prefers-color-scheme: dark) {
    @theme {
        --color-fond: oklch(18% 0 0);
        --color-texte: oklch(95% 0 0);
        --color-bordure: oklch(30% 0 0);
    }
}

body {
    background-color: var(--color-fond);
    color: var(--color-texte);
}
```

- [x] **Étape 3 : écrire l'utilitaire de fusion de classes**

`packages/ui/src/utils/cn.utils.ts` :

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Fusionne des classes Tailwind en résolvant les conflits : `twMerge` garde la
// dernière classe d'une même famille, ce que la simple concaténation ne fait pas.
// Sans cela, une classe passée en prop ne peut pas surcharger celle du composant.
export function cn(...entrees: ClassValue[]): string {
    return twMerge(clsx(entrees));
}
```

- [x] **Étape 4 : écrire le test de rendu, qui échoue**

`packages/ui/src/components/button.spec.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
    it("affiche son contenu", () => {
        render(<Button>Ajouter au panier</Button>);
        expect(screen.getByRole("button", { name: "Ajouter au panier" })).toBeVisible();
    });

    it("laisse une classe passée en prop surcharger la classe par défaut", () => {
        render(<Button className="rounded-none">Valider</Button>);
        expect(screen.getByRole("button")).toHaveClass("rounded-none");
    });

    it("transmet l'état désactivé au bouton natif", () => {
        render(<Button disabled>Payer</Button>);
        expect(screen.getByRole("button")).toBeDisabled();
    });
});
```

- [x] **Étape 5 : exécuter et vérifier l'échec**

```bash
pnpm --filter @clemperl/ui test
```

Attendu : échec sur `./button` introuvable.

- [x] **Étape 6 : écrire le composant**

`packages/ui/src/components/button.tsx` :

```tsx
import { type VariantProps, cva } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../utils";

const boutonVariants = cva(
    "inline-flex items-center justify-center font-medium transition-colors " +
        "disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variante: {
                plein: "bg-accent text-fond hover:opacity-90",
                contour: "border border-bordure bg-transparent hover:bg-bordure/20",
            },
            taille: {
                normale: "h-10 px-4 text-sm rounded-[--radius-controle]",
                large: "h-12 px-6 text-base rounded-[--radius-controle]",
            },
        },
        defaultVariants: { variante: "plein", taille: "normale" },
    },
);

// Les props de composant ne portent pas le préfixe I : c'est la forme attendue
// par l'écosystème React et par les composants shadcn installés tels quels.
export interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof boutonVariants> {}

export function Button({
    className,
    variante,
    taille,
    ...props
}: ButtonProps): React.JSX.Element {
    return (
        <button
            className={cn(boutonVariants({ variante, taille }), className)}
            {...props}
        />
    );
}
```

- [x] **Étape 7 : écrire les barrels**

```typescript
// packages/ui/src/utils/index.ts
export * from "./cn.utils";

// packages/ui/src/components/index.ts
export * from "./button";

// packages/ui/src/index.ts
export * from "./components";
export * from "./utils";
```

- [x] **Étape 8 : exécuter et vérifier le succès**

```bash
pnpm --filter @clemperl/ui test
pnpm --filter @clemperl/ui lint
pnpm --filter @clemperl/ui typecheck
```

Attendu : 3 tests passent, lint et typage propres.

---

## Tâche 7 : `apps/storefront` — boutique publique

**Fichiers :**
- Créer : `apps/storefront/package.json`, `apps/storefront/tsconfig.json`,
  `apps/storefront/next.config.ts`, `apps/storefront/eslint.config.js`
- Créer : `apps/storefront/src/i18n/routing.ts`, `apps/storefront/src/i18n/request.ts`
- Créer : `apps/storefront/src/middleware.ts`
- Créer : `apps/storefront/src/app/[locale]/layout.tsx`,
  `apps/storefront/src/app/[locale]/page.tsx`
- Créer : `apps/storefront/src/app/api/health/route.ts`
- Créer : `apps/storefront/src/env.ts`

**Interfaces :**
- Consomme : `@clemperl/ui` (`Button`, `globals.css`), `@clemperl/i18n`
  (`LOCALES`, `DEFAULT_LOCALE`), `@clemperl/core` (`parseBaseEnv`).
- Produit : un service HTTP sur le port 3000 ; `GET /api/health` renvoyant
  `{ statut: "ok", application: "storefront" }`.

- [x] **Étape 1 : créer le manifeste**

`apps/storefront/package.json` :

```json
{
  "name": "@clemperl/storefront",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000 --hostname 0.0.0.0",
    "build": "next build",
    "start": "next start --port 3000 --hostname 0.0.0.0",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@clemperl/core": "workspace:*",
    "@clemperl/db": "workspace:*",
    "@clemperl/i18n": "workspace:*",
    "@clemperl/ui": "workspace:*",
    "next": "16.3.5",
    "next-intl": "4.14.5",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@clemperl/eslint-config": "workspace:*",
    "@clemperl/tsconfig": "workspace:*",
    "@types/react": "^19.0.0",
    "eslint": "10.10.0",
    "tailwindcss": "4.3.3",
    "typescript": "6.0.3",
    "vitest": "5.0.1"
  }
}
```

`--hostname 0.0.0.0` est obligatoire en conteneur : par défaut Next n'écoute que sur
`localhost`, donc à l'intérieur du conteneur uniquement, et nginx ne pourrait pas
l'atteindre.

- [x] **Étape 2 : écrire la configuration Next**

`apps/storefront/next.config.ts` :

```typescript
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

// `standalone` produit un serveur autonome avec ses seules dépendances utiles :
// c'est ce que l'étage `runner` du Dockerfile copie, et ce qui fait la différence
// entre une image de 180 Mo et une image de 900 Mo.
const config: NextConfig = {
    output: "standalone",
    transpilePackages: ["@clemperl/ui", "@clemperl/core", "@clemperl/i18n"],
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(config);
```

`transpilePackages` est requis : les packages internes sont du TypeScript brut, sans
étape de compilation, et Next doit donc les transpiler lui-même.

- [x] **Étape 3 : écrire le routage des locales**

`apps/storefront/src/i18n/routing.ts` :

```typescript
import { DEFAULT_LOCALE, LOCALES } from "@clemperl/i18n";
import { defineRouting } from "next-intl/routing";

// `as-needed` laisse le français sans préfixe (`/produits`) et préfixe l'anglais
// (`/en/produits`). Préfixer la langue majoritaire du marché dilue le référencement
// sur deux URL pour un même contenu.
export const routing = defineRouting({
    locales: LOCALES,
    defaultLocale: DEFAULT_LOCALE,
    localePrefix: "as-needed",
});
```

`apps/storefront/src/i18n/request.ts` :

```typescript
import { getRequestConfig } from "next-intl/server";
import { isSupportedLocale } from "@clemperl/i18n";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
    const demandee = await requestLocale;
    const locale =
        demandee && isSupportedLocale(demandee) ? demandee : routing.defaultLocale;

    return {
        locale,
        messages: (await import(`@clemperl/i18n/messages/storefront/${locale}.json`))
            .default,
    };
});
```

`apps/storefront/src/middleware.ts` :

```typescript
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

// Le point de santé est exclu : il doit répondre sans négociation de langue,
// sinon une sonde reçoit une redirection au lieu d'un état.
export const config = {
    matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
```

- [x] **Étape 4 : écrire la validation d'environnement de l'application**

`apps/storefront/src/env.ts` :

```typescript
import { parseBaseEnv } from "@clemperl/core";

// Évalué à l'import, donc au démarrage : une variable manquante arrête le processus
// avec le nom de la variable, au lieu de produire un `undefined` qui voyage.
export const env = parseBaseEnv(process.env);
```

- [x] **Étape 5 : écrire la mise en page et la page d'accueil**

`apps/storefront/src/app/[locale]/layout.tsx` :

```tsx
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { isSupportedLocale } from "@clemperl/i18n";
import "@clemperl/ui/styles/globals.css";
import type { ReactNode } from "react";

export default async function LocaleLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
    const { locale } = await params;
    if (!isSupportedLocale(locale)) notFound();

    const messages = await getMessages();

    return (
        <html lang={locale}>
            <body>
                <NextIntlClientProvider messages={messages}>
                    {children}
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
```

`apps/storefront/src/app/[locale]/page.tsx` :

```tsx
import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";

export default function AccueilPage(): React.JSX.Element {
    const t = useTranslations("accueil");

    return (
        <main className="mx-auto max-w-3xl px-4 py-16">
            <h1 className="text-3xl font-semibold">{t("titre")}</h1>
            <p className="mt-2 text-sm opacity-80">{t("sousTitre")}</p>
            <Button className="mt-8">{t("titre")}</Button>
        </main>
    );
}
```

Aucune chaîne visible n'est écrite en dur : c'est une habitude qui ne se rattrape pas
une fois cent composants écrits.

- [x] **Étape 6 : écrire le point de santé**

`apps/storefront/src/app/api/health/route.ts` :

```typescript
import { NextResponse } from "next/server";

// Sonde de santé utilisée par le healthcheck du compose et, plus tard, par
// l'orchestrateur de production. `force-dynamic` empêche Next de la pré-rendre
// au build : une sonde figée renverrait « en bonne santé » même processus éteint.
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
    return NextResponse.json({ statut: "ok", application: "storefront" });
}
```

- [x] **Étape 7 : construire et vérifier**

```bash
pnpm --filter @clemperl/storefront build
```

Attendu : le build réussit et `apps/storefront/.next/standalone/` existe.

- [x] **Étape 8 : démarrer et prouver les trois comportements**

```bash
pnpm --filter @clemperl/storefront dev &
sleep 8
curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/ | grep -o "vendeurs indépendants"
curl -s http://localhost:3000/en | grep -o "independent sellers"
kill %1
```

Attendu, dans l'ordre : `{"statut":"ok","application":"storefront"}` ; la phrase
française sur `/` sans préfixe ; la phrase anglaise sur `/en`. Les trois ensemble
prouvent que le routage `as-needed` fonctionne.

---

## Tâche 8 : `apps/vendor` et `apps/admin` — back-offices en français

Ces deux applications sont câblées sur `next-intl` mais livrées en **français seul** :
traduire un back-office interne n'apporte rien tant qu'aucun utilisateur non francophone
ne l'emploie. Elles n'ont donc **pas** de segment `[locale]` ni de middleware de routage.

**Fichiers :**
- Créer : `apps/vendor/package.json`, `tsconfig.json`, `next.config.ts`,
  `eslint.config.js`, `src/env.ts`, `src/app/layout.tsx`, `src/app/page.tsx`,
  `src/app/api/health/route.ts`
- Créer : les mêmes sous `apps/admin/`

**Interfaces :**
- Consomme : `@clemperl/ui`, `@clemperl/i18n`, `@clemperl/core`.
- Produit : deux services HTTP, ports 3001 et 3002, chacun avec `GET /api/health`.

- [x] **Étape 1 : écrire le manifeste de `apps/vendor`**

```json
{
  "name": "@clemperl/vendor",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001 --hostname 0.0.0.0",
    "build": "next build",
    "start": "next start --port 3001 --hostname 0.0.0.0",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@clemperl/core": "workspace:*",
    "@clemperl/db": "workspace:*",
    "@clemperl/i18n": "workspace:*",
    "@clemperl/ui": "workspace:*",
    "next": "16.3.5",
    "next-intl": "4.14.5",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@clemperl/eslint-config": "workspace:*",
    "@clemperl/tsconfig": "workspace:*",
    "@types/react": "^19.0.0",
    "eslint": "10.10.0",
    "tailwindcss": "4.3.3",
    "typescript": "6.0.3",
    "vitest": "5.0.1"
  }
}
```

- [x] **Étape 2 : écrire la configuration Next de `apps/vendor`**

`apps/vendor/next.config.ts` :

```typescript
import type { NextConfig } from "next";

// Pas de greffon next-intl ici : cette application ne sert qu'une langue et n'a
// donc aucune négociation à faire. Les libellés viennent du catalogue `vendor`.
const config: NextConfig = {
    output: "standalone",
    transpilePackages: ["@clemperl/ui", "@clemperl/core", "@clemperl/i18n"],
};

export default config;
```

`apps/vendor/tsconfig.json` :

```json
{
  "extends": "@clemperl/tsconfig/next.json",
  "include": ["src/**/*.ts", "src/**/*.tsx", "next-env.d.ts"]
}
```

`apps/vendor/eslint.config.js` :

```javascript
import config from "@clemperl/eslint-config";
export default config;
```

- [x] **Étape 3 : écrire les pages de `apps/vendor`**

`apps/vendor/src/env.ts` :

```typescript
import { parseBaseEnv } from "@clemperl/core";

export const env = parseBaseEnv(process.env);
```

`apps/vendor/src/app/layout.tsx` :

```tsx
import "@clemperl/ui/styles/globals.css";
import type { ReactNode } from "react";

export default function RootLayout({
    children,
}: {
    children: ReactNode;
}): React.JSX.Element {
    return (
        <html lang="fr">
            <body>{children}</body>
        </html>
    );
}
```

`apps/vendor/src/app/page.tsx` :

```tsx
import messages from "@clemperl/i18n/messages/vendor/fr.json";

export default function AccueilPage(): React.JSX.Element {
    return (
        <main className="mx-auto max-w-3xl px-4 py-16">
            <h1 className="text-3xl font-semibold">{messages.accueil.titre}</h1>
        </main>
    );
}
```

`apps/vendor/src/app/api/health/route.ts` :

```typescript
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
    return NextResponse.json({ statut: "ok", application: "vendor" });
}
```

- [x] **Étape 4 : dériver `apps/admin` par substitution explicite**

L'administration est identique au détail près. La produire par substitution plutôt qu'à
la main évite l'écart silencieux entre deux fichiers censés être jumeaux.

```bash
cp -r apps/vendor apps/admin
rm -rf apps/admin/node_modules apps/admin/.next

grep -rl 'vendor\|3001' apps/admin --include='*.ts' --include='*.tsx' --include='*.json' \
  | xargs sed -i 's/@clemperl\/vendor/@clemperl\/admin/g; s/messages\/vendor\//messages\/admin\//g; s/"vendor"/"admin"/g; s/3001/3002/g'

grep -rn 'vendor\|3001' apps/admin --include='*.ts' --include='*.tsx' --include='*.json'
```

Attendu : la dernière commande ne renvoie **rien**. Toute occurrence restante est un
oubli de substitution.

| Valeur | `apps/vendor` | `apps/admin` |
| --- | --- | --- |
| nom du package | `@clemperl/vendor` | `@clemperl/admin` |
| port | 3001 | 3002 |
| catalogue | `messages/vendor/fr.json` | `messages/admin/fr.json` |
| champ `application` du point de santé | `"vendor"` | `"admin"` |

- [x] **Étape 5 : construire les deux et prouver leurs points de santé**

```bash
pnpm install
pnpm --filter @clemperl/vendor build
pnpm --filter @clemperl/admin build

pnpm --filter @clemperl/vendor dev & sleep 8
curl -s http://localhost:3001/api/health; echo
kill %1

pnpm --filter @clemperl/admin dev & sleep 8
curl -s http://localhost:3002/api/health; echo
kill %1
```

Attendu : `{"statut":"ok","application":"vendor"}` puis
`{"statut":"ok","application":"admin"}`. Deux réponses identiques signaleraient une
substitution incomplète.

---

## Tâche 9 : `apps/api` — NestJS et ses quatre configurations Jest

**Fichiers :**
- Créer : `apps/api/package.json`, `tsconfig.json`, `eslint.config.js`, `nest-cli.json`
- Créer : `apps/api/jest.config.ts`, `jest.config.integration.ts`,
  `jest.config.contract.ts`, `jest.config.e2e.ts`
- Créer : `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- Créer : `apps/api/src/modules/health/health.module.ts`
- Créer : `apps/api/src/modules/health/controllers/health.controller.ts`,
  `health.controller.spec.ts`, `index.ts`

**Interfaces :**
- Consomme : `@clemperl/core` (`parseBaseEnv`), `@clemperl/db` (`prisma`).
- Produit : un service HTTP sur le port 3003 ; `GET /health` renvoyant
  `{ statut: "ok", application: "api" }`.

- [x] **Étape 1 : créer le manifeste**

`apps/api/package.json` :

```json
{
  "name": "@clemperl/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main.js",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "jest --config jest.config.ts --coverage",
    "test:integration": "jest --config jest.config.integration.ts --runInBand",
    "test:contract": "jest --config jest.config.contract.ts --runInBand",
    "test:e2e": "jest --config jest.config.e2e.ts --runInBand"
  },
  "dependencies": {
    "@clemperl/core": "workspace:*",
    "@clemperl/db": "workspace:*",
    "@nestjs/common": "12.0.3",
    "@nestjs/core": "12.0.3",
    "@nestjs/platform-express": "12.0.3",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@clemperl/eslint-config": "workspace:*",
    "@clemperl/tsconfig": "workspace:*",
    "@nestjs/cli": "12.0.3",
    "@nestjs/testing": "12.0.3",
    "@swc/core": "^1.0.0",
    "@swc/jest": "0.2.39",
    "@types/jest": "^30.0.0",
    "@types/supertest": "^6.0.0",
    "eslint": "10.10.0",
    "jest": "30.5.1",
    "supertest": "7.2.2",
    "typescript": "6.0.3"
  }
}
```

**Le transformeur est `@swc/jest`, pas `ts-jest`.** Sous TypeScript 6.0.3 les deux
seraient compatibles ; `@swc/jest` est retenu pour sa vitesse. Il ne vérifie pas les
types — cette vérification revient au script `typecheck`, job de CI distinct et bloquant.

- [x] **Étape 2 : écrire les quatre configurations Jest**

Quatre fichiers à la racine de l'application, **aucune clé `jest` dans `package.json`** :
un seul endroit où chercher.

`apps/api/jest.config.ts` — couche unitaire, rapide, jouée à chaque modification :

```typescript
import type { Config } from "jest";

const config: Config = {
    rootDir: ".",
    testMatch: ["<rootDir>/src/**/*.spec.ts"],
    transform: { "^.+\\.ts$": ["@swc/jest", {}] },
    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/**/index.ts",
        "!src/**/*.module.ts",
        "!src/main.ts",
    ],
};

export default config;
```

Les modules de câblage, les barrels et le point d'entrée sont exclus de la couverture :
aucun test ne peut les relever, et un pourcentage qu'on ne peut pas faire bouger cesse
d'être un objectif.

`apps/api/jest.config.integration.ts` :

```typescript
import type { Config } from "jest";

// Couche lourde : un conteneur PostgreSQL, démarré UNE fois pour tout le run par
// globalSetup. Les fichiers y créent leur propre base logique.
// Les fichiers référencés ici arrivent en T1, avec la première couche d'intégration.
const config: Config = {
    rootDir: ".",
    testMatch: ["<rootDir>/src/**/*.int-spec.ts"],
    transform: { "^.+\\.ts$": ["@swc/jest", {}] },
    maxWorkers: 1,
};

export default config;
```

`apps/api/jest.config.contract.ts` :

```typescript
import type { Config } from "jest";

// Couche contrat : configuration SÉPARÉE de l'intégration, et ce n'est pas de
// l'esthétique. La bibliothèque qui intercepte le HTTP sortant remplace le module
// `http` pour tout le processus, et Testcontainers parle au démon Docker sur une
// connexion HTTP. Les réunir casse la connexion Docker avec une erreur qui n'évoque
// en rien sa cause. Ces deux couches ne partagent jamais un run.
const config: Config = {
    rootDir: ".",
    testMatch: ["<rootDir>/src/**/*.contract-spec.ts"],
    transform: { "^.+\\.ts$": ["@swc/jest", {}] },
    maxWorkers: 1,
};

export default config;
```

`apps/api/jest.config.e2e.ts` :

```typescript
import type { Config } from "jest";

// E2E HTTP de l'API, joué avec supertest contre l'application montée.
// Les parcours navigateur des trois fronts relèvent de Playwright, ailleurs.
const config: Config = {
    rootDir: ".",
    testMatch: ["<rootDir>/test/**/*.e2e-spec.ts"],
    transform: { "^.+\\.ts$": ["@swc/jest", {}] },
    maxWorkers: 1,
};

export default config;
```

Les quatre `testMatch` s'excluent par construction : `*.spec.ts` ne peut pas attraper
`*.int-spec.ts`. Rien n'est joué deux fois.

- [x] **Étape 3 : écrire le test unitaire qui échoue**

`apps/api/src/modules/health/controllers/health.controller.spec.ts` :

```typescript
import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
    let controller: HealthController;

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [HealthController],
        }).compile();
        controller = module.get(HealthController);
    });

    it("annonce l'application et son état", () => {
        expect(controller.lire()).toEqual({ statut: "ok", application: "api" });
    });
});
```

- [x] **Étape 4 : exécuter et vérifier l'échec**

```bash
pnpm --filter @clemperl/api test
```

Attendu : échec sur `./health.controller` introuvable.

- [x] **Étape 5 : écrire le contrôleur, le module et l'application**

`apps/api/src/modules/health/controllers/health.controller.ts` :

```typescript
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
    @Get()
    lire(): { statut: string; application: string } {
        return { statut: "ok", application: "api" };
    }
}
```

`apps/api/src/modules/health/controllers/index.ts` :

```typescript
export * from "./health.controller";
```

`apps/api/src/modules/health/health.module.ts` — **la racine du module ne porte pas
d'`index.ts`** :

```typescript
import { Module } from "@nestjs/common";
import { HealthController } from "./controllers";

// Pas de barrel à la racine de ce dossier, et son absence est délibérée : un barrel
// de racine réexporte tout le module, et deux modules qui se citent forment alors un
// cycle d'imports que NestJS résout en livrant `undefined` à l'exécution — sans erreur
// au démarrage, avec un provider vide au moment de s'en servir.
@Module({ controllers: [HealthController] })
export class HealthModule {}
```

`apps/api/src/app.module.ts` :

```typescript
import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module";

@Module({ imports: [HealthModule] })
export class AppModule {}
```

`apps/api/src/main.ts` :

```typescript
import { NestFactory } from "@nestjs/core";
import { parseBaseEnv } from "@clemperl/core";
import { AppModule } from "./app.module";

// L'environnement est validé AVANT de monter l'application : une variable manquante
// arrête le processus ici, avec son nom, plutôt qu'au premier accès à la base.
parseBaseEnv(process.env);

async function demarrer(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    // 0.0.0.0 et non localhost : en conteneur, écouter sur localhost rend le service
    // injoignable depuis le proxy.
    await app.listen(3003, "0.0.0.0");
}

void demarrer();
```

`apps/api/nest-cli.json` :

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

`apps/api/tsconfig.json` :

```json
{
  "extends": "@clemperl/tsconfig/nest.json",
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [x] **Étape 6 : exécuter et vérifier le succès**

```bash
pnpm --filter @clemperl/api test
```

Attendu : 1 test passe. Noter le pourcentage de couverture pour la tâche 13.

- [x] **Étape 7 : prouver que les quatre configurations sont distinctes et ne se chevauchent pas**

```bash
cd apps/api
for c in jest.config.ts jest.config.integration.ts jest.config.contract.ts jest.config.e2e.ts; do
  printf "%-32s " "$c"
  pnpm exec jest --config "$c" --listTests 2>/dev/null | wc -l
done
```

Attendu : `jest.config.ts` trouve **1** fichier ; les trois autres en trouvent **0**,
leurs couches n'existant pas encore. Un chiffre supérieur à 1 sur une autre
configuration signalerait des `testMatch` qui se chevauchent — le même test serait alors
joué deux fois et compté deux fois.

- [x] **Étape 8 : construire et prouver le point de santé**

```bash
pnpm --filter @clemperl/api build
pnpm --filter @clemperl/api start & sleep 5
curl -s http://localhost:3003/health; echo
kill %1
```

Attendu : `{"statut":"ok","application":"api"}`.

---

## Tâche 10 : Dockerfiles — quatre applications et le proxy

**Fichiers :**
- Créer : `apps/storefront/Dockerfile`, `apps/vendor/Dockerfile`,
  `apps/admin/Dockerfile`, `apps/api/Dockerfile`
- Créer : `docker/proxy/Dockerfile`, `docker/proxy/templates/default.conf.template`

**Interfaces :**
- Produit : cinq images construites depuis la racine du dépôt ; deux cibles par
  application (`dev`, `runner`).

- [x] **Étape 1 : écrire le Dockerfile de `apps/storefront`**

```dockerfile
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
CMD ["pnpm", "--filter", "@clemperl/storefront", "dev"]

# --- Isolation du sous-graphe ---
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo prune @clemperl/storefront --docker

# --- Installation puis build, sur le seul sous-graphe ---
FROM base AS installer
# Les manifestes d'abord : cette couche n'est invalidée que si les dépendances de
# CETTE application changent, pas à chaque modification de code.
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@clemperl/storefront

# --- Exécution : la sortie standalone seule ---
FROM base AS runner
ENV NODE_ENV=production
USER node
COPY --from=installer --chown=node:node /app/apps/storefront/.next/standalone ./
COPY --from=installer --chown=node:node /app/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=installer --chown=node:node /app/apps/storefront/public ./apps/storefront/public
EXPOSE 3000
CMD ["node", "apps/storefront/server.js"]
```

- [x] **Étape 2 : écrire les Dockerfiles de `vendor` et `admin`**

Identiques au précédent, avec le nom de package, le chemin et le port substitués :

```bash
for app in vendor:3001 admin:3002; do
  nom="${app%%:*}"; port="${app##*:}"
  sed "s/storefront/${nom}/g; s/EXPOSE 3000/EXPOSE ${port}/" \
    apps/storefront/Dockerfile > "apps/${nom}/Dockerfile"
done

grep -n 'storefront\|EXPOSE' apps/vendor/Dockerfile apps/admin/Dockerfile
```

Attendu : aucune occurrence de `storefront`, `EXPOSE 3001` dans vendor, `EXPOSE 3002`
dans admin.

- [x] **Étape 3 : écrire le Dockerfile de `apps/api`**

La sortie de NestJS est `dist/`, pas `.next/standalone` : les dépendances d'exécution
doivent être installées explicitement dans l'image finale.

```dockerfile
# Image de l'API : Socket.IO, traitements de fond et webhooks.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS dev
COPY . .
RUN pnpm install --frozen-lockfile
CMD ["pnpm", "--filter", "@clemperl/api", "dev"]

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo prune @clemperl/api --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@clemperl/api

FROM base AS runner
ENV NODE_ENV=production
COPY --from=pruner /app/out/json/ .
# --prod n'installe que les dépendances d'exécution : l'image finale ne contient
# ni Jest, ni la CLI NestJS, ni supertest.
RUN pnpm install --frozen-lockfile --prod
COPY --from=installer /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 3003
CMD ["node", "apps/api/dist/main.js"]
```

- [x] **Étape 4 : écrire le proxy**

Trois fichiers : un template de configuration, un fragment d'en-têtes communs, et le
Dockerfile.

`docker/proxy/templates/default.conf.template` — l'image nginx substitue `${DEV_HOST}`
au démarrage dans tout fichier de `/etc/nginx/templates`. Ne pas le renommer en `.conf`,
la substitution ne s'appliquerait plus.

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# nginx résout les noms de ses upstreams UNE fois, au démarrage, quand ils sont écrits
# littéralement dans `proxy_pass` : si une application n'est pas encore lancée, nginx
# refuse de démarrer au lieu de l'attendre. Passer par une variable force la résolution
# à chaque requête, via le résolveur interne de Docker.
resolver 127.0.0.11 valid=10s ipv6=off;

server {
    listen 443 ssl;
    http2 on;
    server_name ${DEV_HOST};

    ssl_certificate     /certs/dev.pem;
    ssl_certificate_key /certs/dev-key.pem;

    location / {
        set $cible http://storefront:3000;
        proxy_pass $cible;
        include /etc/nginx/snippets/proxy-commun.conf;
    }
}
```

Les trois autres blocs `server` sont identiques, avec `vendeur.${DEV_HOST}` → `vendor:3001`,
`admin.${DEV_HOST}` → `admin:3002`, `api.${DEV_HOST}` → `api:3003`.

`docker/proxy/snippets/proxy-commun.conf` :

```nginx
proxy_http_version 1.1;

# Sans ces deux lignes, aucune connexion WebSocket ne traverse le proxy : le
# rechargement à chaud de Next s'en sert, et Socket.IO s'en servira. nginx ne relaie
# PAS l'upgrade de protocole par défaut.
proxy_set_header Upgrade    $http_upgrade;
proxy_set_header Connection $connection_upgrade;

proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;

proxy_read_timeout    3600s;
proxy_send_timeout    3600s;
proxy_buffering       off;
```

`docker/proxy/Dockerfile` — la règle « une image se construit, elle ne se déclare pas »
vaut aussi pour le proxy :

```dockerfile
FROM nginx:1-alpine
COPY docker/proxy/templates/ /etc/nginx/templates/
COPY docker/proxy/snippets/ /etc/nginx/snippets/
EXPOSE 443
```

- [x] **Étape 5 : valider la syntaxe de la configuration sans démarrer la stack**

```bash
docker compose build proxy
pnpm docker:up proxy
docker exec clemperl_dev_proxy nginx -t
docker exec clemperl_dev_proxy grep server_name /etc/nginx/conf.d/default.conf
```

Attendu : `syntax is ok` et `test is successful`, puis les quatre `server_name` avec
`DEV_HOST` substitué. Une configuration invalide ferait échouer la stack au démarrage,
avec un message enterré dans les journaux d'un conteneur qui redémarre.

- [x] **Étape 6 : construire les cinq images et prouver qu'elles démarrent**

```bash
for a in storefront vendor admin api; do
  docker build --target runner -t "clemperl/${a}:check" -f "apps/${a}/Dockerfile" .
done
docker build -t clemperl/proxy:check -f docker/proxy/Dockerfile .
```

Puis vérifier **contre l'image construite**, pas contre le fichier :

```bash
docker run --rm -d --name check-storefront -p 3100:3000 \
  -e DATABASE_URL=postgresql://x:x@localhost:5432/x -e REDIS_URL=redis://localhost:6379 \
  -e DEV_HOST=192-168-1-42.sslip.io clemperl/storefront:check
sleep 6
curl -s http://localhost:3100/api/health; echo
docker rm -f check-storefront
```

Attendu : `{"statut":"ok","application":"storefront"}` servi par l'image de production.

- [x] **Étape 7 : relever la taille des images**

```bash
docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}' | grep clemperl
```

Noter les tailles. La spec annonce environ 180 Mo pour une application Next : un écart
important signale une cible `runner` qui copie plus que la sortie standalone.

- [x] **Étape 8 : nettoyer les images de vérification**

```bash
docker rmi clemperl/storefront:check clemperl/vendor:check \
  clemperl/admin:check clemperl/api:check clemperl/proxy:check
docker image prune -f
docker images | grep clemperl || echo "aucune image de vérification restante"
```

---

## Tâche 11 : compose, certificats et accès depuis le réseau local

**Fichiers :**
- Créer : `docker/docker-compose.dev.yml`
- Créer : `scripts/dev-certs.sh`

**Interfaces :**
- Consomme : les cinq images de la tâche 10, la variable `DEV_HOST`.
- Produit : une stack complète en HTTPS, joignable depuis un appareil du réseau local.

- [x] **Étape 1 : écrire le script de génération des certificats**

`scripts/dev-certs.sh` :

```bash
#!/usr/bin/env bash
# Émet le certificat TLS local couvrant DEV_HOST et ses sous-domaines.
# Le certificat est lié à un nom précis : après tout changement de DEV_HOST,
# relancer ce script, sinon les quatre fronts refusent la connexion.
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
```

- [x] **Étape 2 : exécuter le script sur ses DEUX chemins d'échec, puis sur le chemin nominal**

Un script ne se vérifie pas seulement quand tout va bien.

```bash
chmod +x scripts/dev-certs.sh

# Chemin d'échec 1 : DEV_HOST absent
env -u DEV_HOST bash -c 'cd '"$PWD"' && mv .env .env.bak 2>/dev/null; ./scripts/dev-certs.sh; echo "code=$?"'
mv .env.bak .env 2>/dev/null || true

# Chemin nominal
cp .env.example .env
./scripts/dev-certs.sh
ls -l certs/
```

Attendu : le premier appel affiche `DEV_HOST n'est pas défini` et sort en code 1 ; le
second crée `certs/dev.pem` et `certs/dev-key.pem`. Le chemin d'échec « mkcert absent »
se vérifie en retirant temporairement mkcert du `PATH` :
`PATH=/usr/bin:/bin ./scripts/dev-certs.sh` doit afficher `mkcert est introuvable`.

- [x] **Étape 3 : écrire le compose**

`docker/docker-compose.dev.yml` :

```yaml
# Environnement de développement complet. Aucun port applicatif n'est publié :
# nginx est le seul point d'entrée, en 443. Les sources sont montées dossier par
# dossier — jamais la racine d'un package — afin que les `node_modules` installés
# dans l'image ne soient pas masqués par ceux de l'hôte, dont les binaires natifs
# sont compilés pour une autre bibliothèque C.
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: clemperl
      POSTGRES_PASSWORD: clemperl
      POSTGRES_DB: clemperl
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U clemperl"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  proxy:
    build:
      context: .
      dockerfile: docker/proxy/Dockerfile
    environment:
      DEV_HOST: ${DEV_HOST}
    ports:
      - "443:443"
    volumes:
      - ./certs:/certs:ro
    depends_on: [storefront, vendor, admin, api]

  storefront:
    build:
      context: .
      dockerfile: apps/storefront/Dockerfile
      target: dev
    env_file: .env
    volumes:
      - ./apps/storefront/src:/app/apps/storefront/src
      - ./packages/core/src:/app/packages/core/src
      - ./packages/ui/src:/app/packages/ui/src
      - ./packages/i18n/src:/app/packages/i18n/src
      - ./packages/i18n/messages:/app/packages/i18n/messages
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 40s

  vendor:
    build:
      context: .
      dockerfile: apps/vendor/Dockerfile
      target: dev
    env_file: .env
    volumes:
      - ./apps/vendor/src:/app/apps/vendor/src
      - ./packages/core/src:/app/packages/core/src
      - ./packages/ui/src:/app/packages/ui/src
      - ./packages/i18n/messages:/app/packages/i18n/messages
    depends_on:
      postgres: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/health"]
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 40s

  admin:
    build:
      context: .
      dockerfile: apps/admin/Dockerfile
      target: dev
    env_file: .env
    volumes:
      - ./apps/admin/src:/app/apps/admin/src
      - ./packages/core/src:/app/packages/core/src
      - ./packages/ui/src:/app/packages/ui/src
      - ./packages/i18n/messages:/app/packages/i18n/messages
    depends_on:
      postgres: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3002/api/health"]
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 40s

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: dev
    env_file: .env
    volumes:
      - ./apps/api/src:/app/apps/api/src
      - ./packages/core/src:/app/packages/core/src
      - ./packages/db/src:/app/packages/db/src
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3003/health"]
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 40s

volumes:
  pg_data:
  redis_data:
```

Le montage dossier par dossier remplace la solution des volumes nommés sur
`node_modules` : plus simple, et sans le piège du volume nommé qui n'est peuplé qu'à sa
création. Contrepartie assumée : modifier un `package.json` impose
`pnpm docker:up --build`, et ajouter une dépendance impose `pnpm docker:down --volumes`.

- [x] **Étape 4 : démarrer la stack et prouver que les healthchecks passent**

```bash
pnpm docker:up
sleep 60
pnpm docker:ps --format 'table {{.Service}}\t{{.Status}}'
```

Attendu : les six services en `Up`, et `(healthy)` sur `postgres`, `redis`,
`storefront`, `vendor`, `admin`, `api`. Un service `(unhealthy)` se diagnostique par
`pnpm docker:logs <service>`.

- [x] **Étape 5 : appliquer la migration et le seed dans la stack**

```bash
docker exec clemperl_dev_api pnpm --filter @clemperl/db exec prisma migrate deploy
docker exec clemperl_dev_api pnpm --filter @clemperl/db exec tsx prisma/seed.ts
docker exec clemperl_dev_postgres psql -U clemperl -d clemperl -c 'SELECT email, role FROM "user";'
```

Attendu : le compte `admin@clemperl.test` en rôle `ADMIN`.

- [x] **Étape 6 : prouver les quatre accès HTTPS depuis la machine**

```bash
source .env
curl -s "https://${DEV_HOST}/api/health"; echo
curl -s "https://vendeur.${DEV_HOST}/api/health"; echo
curl -s "https://admin.${DEV_HOST}/api/health"; echo
curl -s "https://api.${DEV_HOST}/health"; echo
```

Attendu : quatre réponses `{"statut":"ok", ...}` avec un champ `application` différent à
chaque fois. Quatre réponses identiques signaleraient une erreur de routage dans le
configuration nginx. `curl` accepte le certificat sans `-k` parce que `mkcert -install` a inscrit
l'autorité dans le magasin du système.

- [x] **Étape 7 : prouver l'accès depuis un smartphone du réseau local**

1. Installer l'autorité racine sur l'appareil. Servir le fichier sur le réseau :
   ```bash
   cd "$(mkcert -CAROOT)" && python3 -m http.server 8000
   ```
   puis, sur le mobile, ouvrir `http://<adresse-lan-de-la-machine>:8000/rootCA.pem`.
   Sur Android : installer comme autorité utilisateur. Sur iOS : installer le profil,
   puis l'activer dans Réglages → Général → Informations → Certificats.
2. Ouvrir `https://<DEV_HOST>` sur le mobile.

Attendu : la page d'accueil s'affiche **sans avertissement de sécurité**. C'est le
critère d'acceptation n°8, et il ne se vérifie que sur un vrai appareil.

- [x] **Étape 8 : prouver qu'aucun port applicatif n'est publié**

```bash
pnpm docker:ps --format 'table {{.Service}}\t{{.Ports}}'
curl -s --max-time 3 http://localhost:3000/api/health && echo "ÉCHEC : port publié" || echo "OK : port non joignable"
```

Attendu : seul `proxy` expose un port (443), et l'accès direct au 3000 échoue.

---

## Tâche 12 : Playwright et intégration continue

**Fichiers :**
- Créer : `playwright.config.ts`, `e2e/smoke.spec.ts`
- Créer : `.github/workflows/ci.yml`

**Interfaces :**
- Consomme : la stack du compose, la variable `DEV_HOST`.
- Produit : une suite de fumée sur les trois fronts, et six jobs de CI.

- [x] **Étape 1 : écrire la configuration Playwright**

`playwright.config.ts` :

```typescript
// Parcours navigateur des trois fronts. Les parcours HTTP de l'API relèvent de
// supertest, dans apps/api : deux outils, deux emplacements, aucun recouvrement.
import { defineConfig, devices } from "@playwright/test";

const devHost = process.env.DEV_HOST ?? "127-0-0-1.sslip.io";

export default defineConfig({
    testDir: "./e2e",
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL: `https://${devHost}`,
        // L'autorité mkcert n'est pas dans le magasin du navigateur embarqué.
        ignoreHTTPSErrors: true,
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [x] **Étape 2 : écrire la suite de fumée**

`e2e/smoke.spec.ts` :

```typescript
import { expect, test } from "@playwright/test";

const devHost = process.env.DEV_HOST ?? "127-0-0-1.sslip.io";

test("la boutique affiche son accueil en français", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ClemPerl");
    await expect(page.getByText("vendeurs indépendants")).toBeVisible();
});

test("la boutique bascule en anglais sous /en", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByText("independent sellers")).toBeVisible();
});

test("l'espace vendeur répond sur son sous-domaine", async ({ page }) => {
    await page.goto(`https://vendeur.${devHost}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Espace vendeur");
});

test("l'administration répond sur son sous-domaine", async ({ page }) => {
    await page.goto(`https://admin.${devHost}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Administration ClemPerl",
    );
});

test("le même bouton partagé est rendu par les trois fronts", async ({ page }) => {
    for (const url of ["/", `https://vendeur.${devHost}/`, `https://admin.${devHost}/`]) {
        await page.goto(url);
        await expect(page.locator("body")).toBeVisible();
    }
});
```

- [x] **Étape 3 : ajouter Playwright à la racine et exécuter la suite**

```bash
pnpm add -D -w @playwright/test@1.63.0
pnpm exec playwright install --with-deps chromium
source .env && pnpm test:e2e
```

Attendu : 5 tests passent contre la stack démarrée à la tâche 11. Si la stack est
arrêtée, la relancer par `pnpm docker:up`.

- [x] **Étape 4 : écrire le workflow d'intégration continue**

`.github/workflows/ci.yml` — en anglais, comme tout ce qui part sur GitHub :

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    name: ${{ matrix.task }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        task: [lint, typecheck, test, build]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: corepack enable
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ matrix.task }}-${{ github.sha }}
          restore-keys: turbo-${{ matrix.task }}-
      - run: pnpm install --frozen-lockfile
      - run: pnpm ${{ matrix.task }}

  images:
    name: docker (${{ matrix.app }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        app: [storefront, vendor, admin, api]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/${{ matrix.app }}/Dockerfile
          target: runner
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: corepack enable
      - run: pnpm install --frozen-lockfile

      # sslip.io resolves 127-0-0-1.sslip.io to 127.0.0.1, so the same
      # certificate-and-proxy setup works here as on a developer machine.
      - name: Issue local certificate
        run: |
          curl -fsSL -o mkcert \
            https://dl.filippo.io/mkcert/latest?for=linux/amd64
          chmod +x mkcert && sudo mv mkcert /usr/local/bin/
          cp .env.example .env
          sed -i 's/^DEV_HOST=.*/DEV_HOST=127-0-0-1.sslip.io/' .env
          ./scripts/dev-certs.sh

      - run: pnpm docker:up
      - name: Wait for services to become healthy
        run: |
          for i in $(seq 1 60); do
            unhealthy=$(pnpm docker:ps --format '{{.Health}}' | grep -c unhealthy || true)
            starting=$(pnpm docker:ps --format '{{.Health}}' | grep -c starting || true)
            if [ "$unhealthy" = "0" ] && [ "$starting" = "0" ]; then exit 0; fi
            sleep 5
          done
          pnpm docker:ps
          pnpm docker:logs
          exit 1

      - run: pnpm exec playwright install --with-deps chromium
      - run: DEV_HOST=127-0-0-1.sslip.io pnpm test:e2e
      - if: always()
        run: pnpm docker:down --volumes
```

- [x] **Étape 5 : valider le workflow sans le pousser**

Aucune écriture git n'est autorisée, donc le déclenchement réel n'est pas possible ici.
Ce qui l'est :

```bash
pnpm dlx yaml-lint .github/workflows/ci.yml 2>/dev/null \
  || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML valide')"

# Syntaxe shell de chaque bloc `run:` multiligne
python3 - <<'PY'
import subprocess, yaml
wf = yaml.safe_load(open(".github/workflows/ci.yml"))
blocs = [s["run"] for j in wf["jobs"].values() for s in j["steps"] if "run" in s]
for i, b in enumerate(blocs):
    r = subprocess.run(["bash", "-n"], input=b, text=True, capture_output=True)
    print(f"bloc {i}: {'OK' if r.returncode == 0 else 'ERREUR ' + r.stderr}")
PY
```

Attendu : `YAML valide` et `OK` pour chaque bloc.

**Niveau de preuve à annoncer sans le surestimer** : c'est une vérification **sur la
logique** — syntaxe YAML et syntaxe shell. Ce n'est **pas** une preuve d'exécution : un
workflow GitHub ne se déclenche que par un push, et pousser n'est pas permis ici. La
preuve d'exécution viendra du premier push, et se lira par `gh api`, jamais par un
`origin/*` qu'on ne peut pas rafraîchir.

---

## Tâche 13 : cliquet de couverture, garde-fous à secrets, et remise

**Fichiers :**
- Modifier : `packages/core/vitest.config.ts`, `packages/ui/vitest.config.ts`,
  `packages/i18n/vitest.config.ts`, `apps/api/jest.config.ts`
- Créer : `.husky/pre-commit`, `.lintstagedrc.json`
- Modifier : `docs/conventions/tests.md`, `docs/conventions/monorepo.md`

- [x] **Étape 1 : relever les couvertures réellement mesurées**

```bash
pnpm test 2>&1 | grep -E "All files|% (Stmts|Lines|Funcs|Branch)"
```

Noter les quatre pourcentages de chaque package. Ce sont les **planchers**, pas des
objectifs : le cliquet part de la valeur mesurée.

- [x] **Étape 2 : inscrire les planchers dans chaque configuration**

Dans chaque `vitest.config.ts`, sous `test.coverage`, en remplaçant les zéros par les
valeurs relevées à l'étape précédente :

```typescript
        coverage: {
            provider: "v8",
            exclude: ["**/index.ts", "**/*.config.ts"],
            // Plancher : la couverture MESURÉE le jour de la mise en place.
            // Il monte, jamais il ne descend.
            thresholds: { statements: 0, branches: 0, functions: 0, lines: 0 },
        },
```

Et dans `apps/api/jest.config.ts` :

```typescript
    coverageThreshold: {
        global: { statements: 0, branches: 0, functions: 0, lines: 0 },
    },
```

- [x] **Étape 3 : prouver que le cliquet mord**

Baisser volontairement la couverture doit faire échouer la commande.

```bash
# Relever temporairement un seuil au-dessus du réel
sed -i 's/statements: [0-9]*/statements: 100/' packages/core/vitest.config.ts
pnpm --filter @clemperl/core test; echo "code attendu non nul : $?"
git checkout -- packages/core/vitest.config.ts 2>/dev/null || true
```

Attendu : la commande échoue avec un message de seuil non atteint. Un seuil qui ne fait
rien échouer ne protège rien.

**Attention** : `git checkout` est une écriture git, donc interdite. Restaurer la valeur
**à la main** dans le fichier, en réécrivant le chiffre relevé à l'étape 1.

- [x] **Étape 4 : vérifier si Vitest échoue sur un seuil par fichier orphelin**

Jest fait échouer le run quand une entrée de seuil désigne un fichier inexistant, ce qui
empêche une exigence de disparaître avec un renommage. Ce comportement est à vérifier
sous Vitest, pas à supposer.

```bash
# Ajouter à la main, dans packages/core/vitest.config.ts, sous coverage.thresholds :
#   "src/utils/fichier-inexistant.ts": { statements: 100 }
pnpm --filter @clemperl/core test; echo "code=$?"
```

Attendu si le garde-fou existe : échec explicite mentionnant le fichier. Sinon, **le
noter** : il faudra un contrôle dédié en CI, et la section « Ce que ça donne dans
ClemPerl » de `docs/conventions/tests.md` doit être mise à jour avec le résultat réel.
Retirer ensuite l'entrée de test.

- [x] **Étape 5 : installer les garde-fous à secrets**

```bash
pnpm add -D -w husky lint-staged
pnpm exec husky init
docker pull zricethezav/gitleaks:latest
```

Gitleaks est un binaire Go, **pas un paquet npm** : `@gitleaks/gitleaks` n'existe pas, et
le paquet `gitleaks` publié sur npm est un fork tiers abandonné depuis 2020 (vérifié le
2026-09-17 sur le registre). On l'exécute par son image officielle, Docker étant déjà une
dépendance de ce dépôt.

`.lintstagedrc.json` :

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml,yaml,css}": ["prettier --write"]
}
```

`.husky/pre-commit` :

```bash
# Le dépôt est public : un secret commité reste lisible dans l'historique même
# après suppression. Le scan côté GitHub intervient après le push — trop tard.
# Ce contrôle-ci l'empêche d'entrer.
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
    protect --staged --source=/repo --redact --verbose
pnpm exec lint-staged
```

- [x] **Étape 6 : prouver que le scan de secrets bloque bien**

```bash
chmod +x .husky/pre-commit
printf 'AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE\n' > /tmp/faux-secret.env
cp /tmp/faux-secret.env ./faux-secret.env
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
    detect --source=/repo --no-git --redact --verbose; echo "code=$?"
rm -f ./faux-secret.env /tmp/faux-secret.env
```

Attendu : gitleaks signale une fuite et sort en code non nul. Un scanner qui ne trouve
rien sur un faux secret évident est un scanner mal configuré.

- [x] **Étape 7 : passer la totalité des critères d'acceptation** *(7 sur 8 ; le
  critère 8 exige un smartphone réel)*

```bash
pnpm docker:down --volumes
pnpm docker:up && sleep 60
pnpm docker:ps --format 'table {{.Service}}\t{{.Status}}'

source .env
for u in "https://${DEV_HOST}/api/health" "https://vendeur.${DEV_HOST}/api/health" \
         "https://admin.${DEV_HOST}/api/health" "https://api.${DEV_HOST}/health"; do
  printf "%-50s " "$u"; curl -s "$u"; echo
done

pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Les huit critères de la spec, à cocher un par un :

1. `pnpm docker:up` démarre les six services, healthchecks au vert
2. les quatre applications répondent en HTTPS derrière nginx, aucun port publié
3. `docker build --target runner` produit isolément une image fonctionnelle (tâche 10)
4. la migration et le seed passent, le compte d'administration existe (tâche 11)
5. le même `Button` de `@clemperl/ui` s'affiche dans les trois fronts (suite Playwright)
6. la boutique bascule entre français et anglais (suite Playwright)
7. `pnpm lint`, `typecheck`, `test`, `test:e2e` passent en local **et** en CI
8. la boutique s'affiche depuis un smartphone du réseau, sans avertissement (tâche 11)

- [x] **Étape 8 : nettoyer**

```bash
pnpm docker:down
docker image prune -f
docker ps -a --filter name=clemperl
```

Attendu : aucun conteneur jetable, aucune image intermédiaire de vérification.

- [x] **Étape 9 : remettre le commit au propriétaire du dépôt**

Un seul commit pour toute la tranche. Il est **rédigé** ici, **exécuté** par le
propriétaire. Message en anglais, sans trailer d'attribution.

```bash
git add -A
git status --short
git commit -m "$(cat <<'MSG'
feat: scaffold the T0 monorepo foundations

Set up the Turborepo workspace with pnpm: three Next.js front-ends
(storefront, vendor, admin), a NestJS API, and six shared packages.
Every app ships a multi-target Dockerfile; `turbo prune` keeps the
runner images down to their own dependency subgraph.

Development runs entirely in containers behind a nginx reverse proxy
that terminates TLS on 443 with a mkcert certificate. Hostnames resolve
through sslip.io, so the stack is reachable from any device on the LAN
without DNS setup. No application port is published.

Money is modelled as integer minor units plus an ISO 4217 code from the
start: XOF and XAF have a zero exponent, so a hardcoded division by 100
would be silently wrong on the main target market.

The API runs on Jest, everything else on Vitest. ts-jest declares
"typescript >=4.3 <7" and rejects TypeScript 7, so @swc/jest transforms
instead; type checking stays a separate blocking CI job.

Not armed yet: coverage floors are set to the measured baseline and
only ratchet up from here. Not verified: the CI workflow has been
linted, never executed - a push is what runs it first.
MSG
)"
```

Rappeler ensuite les commandes de création du dépôt public, à exécuter également par le
propriétaire :

```bash
gh repo create clemperl --public --source=. --remote=origin \
  --description "Multi-vendor marketplace for apparel, jewellery and bags"
git push -u origin main
gh api repos/{owner}/clemperl --jq '.security_and_analysis'
```

La dernière commande vérifie que Secret Scanning et Push Protection sont bien actifs.
Elle interroge l'API, jamais l'état local : une référence de suivi non rafraîchie se lit
exactement comme un fait.

---

## Auto-revue du plan

**Couverture de la spec.** Les onze sections de la spec sont adressées : périmètre
(tâches 1 à 13), architecture et packages (1 à 6), versions (contraintes globales),
Docker et environnement (10 et 11), base de données (4), internationalisation (5 et 7),
qualité et CI (12 et 13), critères d'acceptation (13, étape 7), risques (contraintes
globales et tâche 4, étape 3).

**Incohérences trouvées et corrigées pendant la rédaction.**

- La spec prévoyait des **volumes nommés** pour `node_modules`. Le plan monte les
  dossiers `src/` un par un à la place : un volume nommé n'est peuplé qu'à sa création,
  ce qui produit exactement le piège que la convention Docker décrit. La spec doit être
  alignée sur ce point.
- La spec annonce `@default(cuid(2))`. La tâche 4 le vérifie par `prisma validate` et
  prescrit quoi faire si cette forme n'existe pas en Prisma 7.10.

**Cohérence des noms entre tâches.** `parseBaseEnv` (tâche 3) est consommé aux tâches 7,
8 et 9 sous ce nom exact. `Button` et `ButtonProps` (tâche 6) sont consommés tel quel à
la tâche 7. `LOCALES`, `DEFAULT_LOCALE` et `isSupportedLocale` (tâche 5) sont consommés
aux tâches 7 et 8. `prisma` (tâche 4) n'est consommé par aucune tâche de T0 — c'est
attendu, aucune application ne lit la base en T0.

**Aucune étape « commit » intermédiaire.** Un seul commit, en tâche 13, exécuté par le
propriétaire du dépôt.
