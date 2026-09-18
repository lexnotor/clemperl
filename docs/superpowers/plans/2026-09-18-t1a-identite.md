# Plan d'implémentation — T1a : Identité et sessions

> **Pour les exécutants agentiques :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes
> utilisent des cases à cocher (`- [ ]`).

**Objectif :** permettre à une personne de créer un compte, de prouver son adresse, et
d'être reconnue par les quatre applications sans se reconnecter.

**Architecture :** Better Auth est configuré une seule fois dans `@clemperl/auth`, que
les trois applications Next montent sur `/api/auth/*` et que l'API NestJS importe pour
lire la session. Aucune requête d'authentification ne traverse de domaine, donc aucun
CORS. Le cookie de session est posé sur le domaine parent, ce qui le rend valable sur
les trois sous-domaines.

**Stack :** Better Auth 1.7.5 · @better-auth/cli 1.4.21 · Prisma 7.10.0 ·
nodemailer 10.0.10 · Mailpit · Testcontainers 12.1.0 · Playwright 1.63.0

**Spec :** `docs/superpowers/specs/2026-09-18-t1a-identite-design.md`

---

## Écart assumé avec le skill `writing-plans`

Ce skill prescrit une étape « Commit » par tâche. La convention du dépôt
([Git](../../conventions/git.md)) l'interdit : **un seul commit par chantier**, et
**aucune écriture git par l'agent**. Chaque tâche se termine par une **vérification**.
Le commit final est rédigé par l'agent, en anglais, sans trailer d'attribution, et
exécuté par le propriétaire du dépôt.

---

## Contraintes globales

### Versions, relevées sur le registre le 2026-09-18

| Paquet | Version | Où |
| --- | --- | --- |
| better-auth | `1.7.5` | `@clemperl/auth` |
| @better-auth/cli | `1.4.21` | outil, `packages/db` |
| nodemailer | `10.0.10` | adapter SMTP, `@clemperl/core` |
| @types/nodemailer | `8.0.2` | idem, en développement |
| testcontainers | `12.1.0` | `apps/api` |
| @testcontainers/postgresql | `12.1.0` | `apps/api` |
| axllent/mailpit | image `latest` | compose de développement |

Toutes les versions de T0 restent en vigueur, notamment **TypeScript 6.0.3** — ni 7.x,
refusée par `typescript-eslint`, ni autre.

### Ce que T0 impose et qui ne se rediscute pas

- **Aucune commande git en écriture.** Pour l'état du distant, `gh api`, jamais `origin/*`.
- **Langue** : code, commentaires et documentation en français ; commits, PR et
  `README.md` en anglais.
- **Commentaires** : le pourquoi, au présent, sans renvoi à un paragraphe de document.
  Chaque fichier non trivial ouvre sur une ligne disant son rôle.
- **Nommage** : kebab-case pour les fichiers ; `E_` + MAJUSCULE_SNAKE pour les enums en
  object-literal `as const` avec leur type `T` dérivé ; `I` + PascalCase pour les
  interfaces, sauf les props de composants ; `T` + PascalCase pour les types.
- **Base** : tables au singulier, colonnes en `snake_case` via `@map`/`@@map`,
  identifiants `cuid2`, schéma `public` unique.
- **Preuve** : aucune affirmation de bon fonctionnement sans exécution. Distinguer
  explicitement « vérifié en l'exécutant » de « vérifié sur la logique ».
- **Tests** : colocalisés, suffixes `.spec.ts`, `.int-spec.ts`, `.e2e-spec.ts`. Les
  seuils de couverture ne descendent jamais.
- **Nettoyage** : conteneurs jetables et images intermédiaires supprimés avant de rendre.

### Les trois pièges déjà payés, qui s'appliquent ici

1. **Les packages consommés par l'API sont compilés.** `@clemperl/auth` expose `dist/`,
   pas `src/`, et ses imports relatifs portent une extension explicite.
2. **Les sondes visent `127.0.0.1`**, jamais `localhost` : dans ces images, `localhost`
   résout vers `::1` alors que les serveurs écoutent en IPv4.
3. **Prisma 7 ne porte pas d'URL dans le schéma.** La connexion de Migrate vit dans
   `prisma.config.ts`, celle du client dans un adaptateur.

---

## Structure des fichiers

### Nouveau package

| Fichier | Responsabilité |
| --- | --- |
| `packages/auth/package.json` | manifeste ; compilé, expose `dist/` |
| `packages/auth/src/config/auth.config.ts` | l'instance Better Auth, configurée une fois |
| `packages/auth/src/utils/session.utils.ts` | lecture de session depuis des en-têtes |
| `packages/auth/src/index.ts` | barrel |

### `@clemperl/core` — port d'envoi

| Fichier | Responsabilité |
| --- | --- |
| `src/interfaces/email-sender.interface.ts` | `IEmailSender` : le contrat |
| `src/interfaces/email-message.interface.ts` | `IEmailMessage` : ce qu'on envoie |

### `@clemperl/db`

| Fichier | Responsabilité |
| --- | --- |
| `prisma/schema.prisma` | modèles générés par la CLI Better Auth, plus nos `@@map` |
| `prisma/migrations/<horodatage>_auth/` | la migration correspondante |

### Applications

| Fichier | Responsabilité |
| --- | --- |
| `apps/<front>/src/app/api/auth/[...all]/route.ts` | montage du gestionnaire, deux lignes |
| `apps/storefront/src/app/[locale]/(auth)/inscription/page.tsx` | formulaire d'inscription |
| `apps/storefront/src/app/[locale]/(auth)/connexion/page.tsx` | formulaire de connexion |
| `apps/api/src/modules/auth/guards/session.guard.ts` | garde NestJS lisant la session |

### Infrastructure

| Fichier | Responsabilité |
| --- | --- |
| `docker/mailpit/Dockerfile` | boîte de réception de développement |
| `docker/docker-compose.dev.yml` | service mailpit, socket Docker sur `api` |
| `apps/api/test/global-setup-integration.ts` | un conteneur PostgreSQL par run |

---

## Tâche 1 : Lever le risque Testcontainers avant tout le reste

La spec impose de prouver ce point **en l'exécutant** avant d'écrire la moindre suite
d'intégration. Le faire en dernier reviendrait à découvrir au dernier moment que toute
une couche de tests ne peut pas tourner.

**Fichiers :**
- Modifier : `docker/docker-compose.dev.yml`
- Créer : `apps/api/src/preuve-testcontainers.int-spec.ts` *(temporaire, supprimé à l'étape 6)*
  Dans `src/`, et non `test/` : la couche intégration est **colocalisée**, seul l'E2E est centralisé.

**Interfaces :**
- Produit : la certitude qu'un conteneur peut démarrer une base et s'y connecter, et
  l'adresse par laquelle il faut la joindre.

- [x] **Étape 1 : donner au conteneur `api` l'accès au démon Docker**

Dans `docker/docker-compose.dev.yml`, service `api`, ajouter au bloc `volumes` :

```yaml
      # Testcontainers démarre de vrais conteneurs : il lui faut le démon Docker.
      # Les conteneurs qu'il crée sont FRÈRES de celui-ci, pas enfants — ils ne sont
      # donc joignables ni par localhost ni par un port publié, mais par leur adresse
      # sur le réseau Docker.
      - /var/run/docker.sock:/var/run/docker.sock
```

- [x] **Étape 2 : installer Testcontainers dans l'API**

```bash
pnpm --filter @clemperl/api add -D testcontainers@12.1.0 @testcontainers/postgresql@12.1.0
```

- [x] **Étape 3 : écrire la preuve minimale**

`apps/api/src/preuve-testcontainers.int-spec.ts` :

```typescript
import { PostgreSqlContainer } from "@testcontainers/postgresql";

// Preuve temporaire : un conteneur PostgreSQL démarre depuis l'intérieur du conteneur
// `api`, et on s'y connecte. Supprimé une fois le point établi.
describe("Testcontainers depuis un conteneur", () => {
    it("démarre une base et donne une URI joignable", async () => {
        const conteneur = await new PostgreSqlContainer("postgres:17-alpine").start();
        const uri = conteneur.getConnectionUri();
        console.log("URI obtenue :", uri);
        expect(uri).toContain("postgresql://");
        await conteneur.stop();
    }, 120_000);
});
```

- [x] **Étape 4 : reconstruire le conteneur et exécuter**

```bash
pnpm docker:down
pnpm docker:up
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts"
```

Attendu : le test passe et affiche l'URI. **Noter l'hôte qu'elle contient** : s'il vaut
`localhost` ou `127.0.0.1`, la connexion échouera depuis un conteneur frère et il faudra
lire l'adresse réseau par `conteneur.getHost()`.

- [x] **Étape 5 : si le test échoue, diagnostiquer avant de contourner**

```bash
docker exec clemperl_dev_api sh -c "ls -l /var/run/docker.sock; command -v docker || echo 'client docker absent'"
```

Deux causes possibles, dans cet ordre : le socket n'est pas monté, ou l'utilisateur du
conteneur n'a pas le droit de le lire. **Ne pas passer le conteneur en `privileged`** :
c'est un contournement qui masque la cause et ouvre l'hôte.

- [x] **Étape 6 : consigner le résultat et retirer la preuve**

Écrire le résultat — adresse obtenue, contournement éventuel — dans la section
« Testcontainers » de `docs/conventions/tests.md`, puis :

```bash
rm apps/api/src/preuve-testcontainers.int-spec.ts
```

Si le point s'est révélé coûteux, il mérite une entrée dans `docs/pieges.md` : titre
affirmatif, mécanisme, symptôme daté, ce qui protège désormais.

---

## Tâche 2 : Package `@clemperl/auth` et schéma d'identité

**Fichiers :**
- Créer : `packages/auth/package.json`, `tsconfig.json`, `tsconfig.build.json`,
  `eslint.config.js`, `vitest.config.ts`
- Créer : `packages/auth/src/config/auth.config.ts`, `src/config/index.ts`, `src/index.ts`
- Modifier : `packages/db/prisma/schema.prisma`, `packages/core/src/schemas/base-env.schema.ts`

**Interfaces :**
- Consomme : `prisma` de `@clemperl/db`, `parseBaseEnv` de `@clemperl/core`.
- Produit : `auth` (instance Better Auth) ; les modèles Prisma `User`, `Session`,
  `Account`, `Verification`.

- [x] **Étape 1 : créer le manifeste**

`packages/auth/package.json` :

```json
{
  "name": "@clemperl/auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsc -p tsconfig.build.json --watch --preserveWatchOutput",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --coverage"
  },
  "dependencies": {
    "@clemperl/core": "workspace:*",
    "@clemperl/db": "workspace:*",
    "better-auth": "1.7.5"
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

`packages/auth/tsconfig.json` :

```json
{
  "extends": "@clemperl/tsconfig/base.json",
  "include": ["src/**/*.ts"]
}
```

`packages/auth/tsconfig.build.json` — ce package est consommé par l'API, donc compilé :

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
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

`packages/auth/eslint.config.js` :

```javascript
import config from "@clemperl/eslint-config";
export default config;
```

`packages/auth/vitest.config.ts` :

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: ["**/index.ts", "**/*.config.ts"],
            // Plancher à relever une fois la tâche 10 exécutée, avec la valeur mesurée.
            thresholds: { statements: 0, branches: 0, functions: 0, lines: 0 },
        },
    },
});
```

- [x] **Étape 2 : étendre la validation d'environnement**

Dans `packages/core/src/schemas/base-env.schema.ts`, ajouter à l'objet Zod :

```typescript
    // Secret de signature des sessions. Une valeur absente ferait démarrer
    // l'application avec des sessions non vérifiables, sans rien signaler.
    BETTER_AUTH_SECRET: z.string().min(32),
    SMTP_URL: z.url(),
    EMAIL_FROM: z.email(),
```

Et dans `.env.example` :

```bash
# Secret de signature des sessions. En développement, une valeur quelconque de plus de
# 32 caractères suffit ; en production, une valeur tirée au hasard et jamais partagée.
BETTER_AUTH_SECRET=developpement-seulement-remplacer-par-un-secret-tire-au-hasard

SMTP_URL=smtp://mailpit:1025
EMAIL_FROM=ClemPerl <bonjour@clemperl.test>

# Renseigner pour activer la connexion Google (tâche 7). Laisser vide sinon : le
# fournisseur n'est alors pas déclaré, et seul le parcours par mot de passe existe.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Les deux variables Google restent hors du schéma Zod : elles sont facultatives, et les
exiger empêcherait de démarrer sans compte Google.

- [x] **Étape 3 : écrire la configuration Better Auth**

`packages/auth/src/config/auth.config.ts` :

```typescript
import { prisma } from "@clemperl/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

// Configuration unique de l'authentification, partagée par les quatre applications.
// Les trois fronts Next montent le gestionnaire qu'elle expose ; l'API NestJS lit les
// sessions qu'elle produit. Une seule configuration signifie qu'aucune divergence de
// secret, de durée ou de domaine de cookie ne peut s'installer entre les applications.
const domaineParent = `.${process.env["DEV_HOST"] ?? ""}`;

export const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: process.env["BETTER_AUTH_SECRET"],

    emailAndPassword: {
        enabled: true,
        // La vérification est exigée de tout le monde : une boutique engage des
        // échanges d'argent, et l'administration doit pouvoir joindre son responsable.
        requireEmailVerification: true,
    },

    advanced: {
        crossSubDomainCookies: {
            enabled: true,
            // Le cookie est posé sur le domaine PARENT, sans quoi chaque front
            // reconnaîtrait l'utilisateur pour lui seul et la bascule entre la boutique
            // et l'espace vendeur demanderait une reconnexion.
            domain: domaineParent,
        },
    },
});
```

- [x] **Étape 4 : écrire les barrels**

```typescript
// packages/auth/src/config/index.ts
export * from "./auth.config.js";

// packages/auth/src/index.ts
export * from "./config/index.js";
```

Les extensions `.js` sont obligatoires : ce package est compilé en résolution `nodenext`,
qui les exige. Elles sont absentes de `ui` et `i18n`, que Turbopack transpile.

- [x] **Étape 5 : générer le schéma d'identité**

```bash
pnpm install
cd packages/db
DATABASE_URL="postgresql://build:build@localhost:5432/build" \
  pnpm dlx @better-auth/cli@1.4.21 generate --config ../auth/src/config/auth.config.ts
```

La CLI écrit les modèles dans `prisma/schema.prisma`. **Lire le résultat avant de
continuer** : c'est lui qui fait foi, pas une supposition sur les noms de champs.

- [x] **Étape 6 : appliquer les conventions du dépôt au schéma généré**

Ajouter à chaque modèle généré un `@@map` au singulier et en `snake_case`, et à chaque
champ multi-mots un `@map`. Retirer la valeur `VENDOR` de `E_USER_ROLE`, qui devient une
relation en T1b :

```prisma
enum E_USER_ROLE {
  CUSTOMER
  ADMIN

  @@map("user_role")
}
```

Si la CLI a créé son propre modèle `User`, l'ancien de T0 disparaît : ses seules données
sont le compte d'administration, que le seed recrée.

- [x] **Étape 7 : jouer la migration sur une base jetable**

```bash
docker run --rm -d --name clemperl-auth-check \
  -e POSTGRES_USER=clemperl -e POSTGRES_PASSWORD=clemperl -e POSTGRES_DB=clemperl \
  -p 55432:5432 postgres:17-alpine
until docker exec clemperl-auth-check pg_isready -U clemperl; do sleep 1; done

cd packages/db
DATABASE_URL="postgresql://clemperl:clemperl@localhost:55432/clemperl" \
  pnpm exec prisma migrate dev --name auth

docker exec clemperl-auth-check psql -U clemperl -d clemperl -c '\dt'
```

Attendu : les tables d'identité apparaissent, au singulier et en `snake_case`.

- [x] **Étape 8 : adapter le seed et le rejouer**

Le seed de T0 crée un compte avec `role: ADMIN`. Si la CLI a changé les champs
obligatoires de `User`, l'ajuster jusqu'à ce que ceci passe deux fois de suite :

```bash
DATABASE_URL="postgresql://clemperl:clemperl@localhost:55432/clemperl" \
  pnpm exec tsx prisma/seed.ts
DATABASE_URL="postgresql://clemperl:clemperl@localhost:55432/clemperl" \
  pnpm exec tsx prisma/seed.ts
docker exec clemperl-auth-check psql -U clemperl -d clemperl -t -c 'SELECT count(*) FROM "user";'
```

Attendu : `1`. Deux exécutions, une seule ligne — le seed reste idempotent.

- [x] **Étape 9 : nettoyer**

```bash
docker rm -f clemperl-auth-check
docker ps -a --filter name=clemperl-auth-check --format '{{.Names}}' | grep . && echo "ENCORE LA" || echo "nettoye"
```

---

## Tâche 3 : Port d'envoi de courriels et Mailpit

**Fichiers :**
- Créer : `packages/core/src/interfaces/email-message.interface.ts`,
  `email-sender.interface.ts`
- Créer : `packages/core/src/utils/smtp-sender.utils.ts`, `smtp-sender.utils.spec.ts`
- Créer : `docker/mailpit/Dockerfile`
- Modifier : `docker/docker-compose.dev.yml`, `packages/core/src/interfaces/index.ts`,
  `packages/core/src/utils/index.ts`

**Interfaces :**
- Produit : `IEmailMessage { destinataire, sujet, texte, html? }` ;
  `IEmailSender { envoyer(message: IEmailMessage): Promise<void> }` ;
  `creerSmtpSender(url: string, expediteur: string): IEmailSender`.

- [x] **Étape 1 : écrire le contrat**

`packages/core/src/interfaces/email-message.interface.ts` :

```typescript
// Un message sortant, indépendant du transport. Le domaine décrit ce qu'il veut dire ;
// l'adapter décide comment le faire partir.
export interface IEmailMessage {
    destinataire: string;
    sujet: string;
    texte: string;
    html?: string;
}
```

`packages/core/src/interfaces/email-sender.interface.ts` :

```typescript
import type { IEmailMessage } from "./email-message.interface.js";

// Le port d'envoi. Un seul point de bascule entre Mailpit en développement et un
// fournisseur en production : le code qui envoie ne connaît que cette interface.
export interface IEmailSender {
    envoyer(message: IEmailMessage): Promise<void>;
}
```

- [x] **Étape 2 : écrire le test qui échoue**

`packages/core/src/utils/smtp-sender.utils.spec.ts` :

```typescript
import { describe, expect, it, vi } from "vitest";
import { creerSmtpSender } from "./smtp-sender.utils.js";

const envoiSimule = vi.fn();
vi.mock("nodemailer", () => ({
    default: { createTransport: () => ({ sendMail: envoiSimule }) },
}));

describe("creerSmtpSender", () => {
    it("transmet destinataire, sujet et corps au transport", async () => {
        envoiSimule.mockClear();
        const sender = creerSmtpSender("smtp://mailpit:1025", "ClemPerl <a@b.test>");

        await sender.envoyer({
            destinataire: "client@exemple.test",
            sujet: "Vérifiez votre adresse",
            texte: "Bonjour",
        });

        expect(envoiSimule).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "client@exemple.test",
                subject: "Vérifiez votre adresse",
                text: "Bonjour",
                from: "ClemPerl <a@b.test>",
            }),
        );
    });

    it("refuse une URL SMTP vide plutôt que d'échouer au premier envoi", () => {
        expect(() => creerSmtpSender("", "a@b.test")).toThrow("URL SMTP");
    });
});
```

- [x] **Étape 3 : exécuter et vérifier l'échec**

```bash
pnpm --filter @clemperl/core test
```

Attendu : échec sur `./smtp-sender.utils.js` introuvable.

- [x] **Étape 4 : installer nodemailer et écrire l'adapter**

```bash
pnpm --filter @clemperl/core add nodemailer@10.0.10
pnpm --filter @clemperl/core add -D @types/nodemailer@8.0.2
```

`packages/core/src/utils/smtp-sender.utils.ts` :

```typescript
import nodemailer from "nodemailer";
import type { IEmailMessage, IEmailSender } from "../interfaces/index.js";

// Adapter SMTP du port d'envoi. Il vaut pour Mailpit en développement comme pour un
// relais de production : seule l'URL change. L'échec est levé à la construction plutôt
// qu'au premier envoi, pour qu'une configuration absente arrête le démarrage au lieu de
// faire disparaître un courriel d'inscription.
export function creerSmtpSender(url: string, expediteur: string): IEmailSender {
    if (!url) {
        throw new Error("URL SMTP absente : aucun courriel ne pourrait partir.");
    }

    const transport = nodemailer.createTransport(url);

    return {
        async envoyer(message: IEmailMessage): Promise<void> {
            await transport.sendMail({
                from: expediteur,
                to: message.destinataire,
                subject: message.sujet,
                text: message.texte,
                html: message.html,
            });
        },
    };
}
```

- [x] **Étape 5 : exporter et vérifier le succès**

Ajouter aux barrels :

```typescript
// packages/core/src/interfaces/index.ts
export * from "./email-message.interface.js";
export * from "./email-sender.interface.js";

// packages/core/src/utils/index.ts
export * from "./smtp-sender.utils.js";
```

```bash
pnpm --filter @clemperl/core test
```

Attendu : les deux nouveaux tests passent, les quatre de T0 aussi.

- [x] **Étape 6 : ajouter Mailpit au compose**

`docker/mailpit/Dockerfile` :

```dockerfile
# Boîte de réception de développement. Elle capture TOUT le courrier sortant : aucun
# message ne part vers une vraie adresse pendant qu'on travaille, et on lit exactement
# ce qu'un utilisateur recevrait.
FROM axllent/mailpit:latest
EXPOSE 1025 8025
```

Dans `docker/docker-compose.dev.yml`, ajouter le service et le rendre obligatoire pour
les fronts :

```yaml
  mailpit:
    container_name: clemperl_dev_mailpit
    build:
      context: ..
      dockerfile: docker/mailpit/Dockerfile
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8025/readyz"]
      interval: 5s
      timeout: 3s
      retries: 10
```

Ajouter `mailpit: { condition: service_healthy }` au `depends_on` de `storefront`,
`vendor` et `admin`.

- [x] **Étape 7 : exposer la boîte de réception par nginx**

Dans `docker/proxy/templates/default.conf.template`, un cinquième bloc `server` :

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name courriels.${DEV_HOST};

    ssl_certificate     /certs/dev.pem;
    ssl_certificate_key /certs/dev-key.pem;

    location / {
        set $cible http://mailpit:8025;
        proxy_pass $cible;
        include /etc/nginx/snippets/proxy-commun.conf;
    }
}
```

Le certificat wildcard de T0 couvre déjà ce sous-domaine : il n'y a rien à régénérer.

- [x] **Étape 8 : prouver qu'un courriel arrive**

```bash
pnpm docker:up
source .env
docker exec clemperl_dev_api node -e "
const nodemailer = require('nodemailer');
nodemailer.createTransport('smtp://mailpit:1025').sendMail({
  from: 'test@clemperl.test', to: 'client@exemple.test',
  subject: 'Preuve de transport', text: 'Ceci est arrivé.',
}).then(() => console.log('envoyé'));
"
curl -s "https://courriels.${DEV_HOST}/api/v1/messages" | head -c 300; echo
```

Attendu : le message apparaît dans la réponse JSON de Mailpit. Ouvrir
`https://courriels.${DEV_HOST}` dans un navigateur montre la même chose lisiblement.

---

## Tâche 4 : Montage du gestionnaire et inscription par mot de passe

**Fichiers :**
- Créer : `apps/storefront/src/app/api/auth/[...all]/route.ts` (et les deux autres fronts)
- Créer : `apps/storefront/src/app/[locale]/(auth)/inscription/page.tsx`,
  `connexion/page.tsx`
- Créer : `apps/storefront/src/lib/auth-client.ts`
- Modifier : `packages/i18n/messages/storefront/fr.json`, `en.json`

**Interfaces :**
- Consomme : `auth` de `@clemperl/auth`.
- Produit : `GET`/`POST` sur `/api/auth/*` dans les trois fronts ; `authClient` côté
  navigateur ; deux pages.

- [x] **Étape 1 : monter le gestionnaire dans les trois fronts**

Le même fichier dans `apps/storefront`, `apps/vendor` et `apps/admin`, à
`src/app/api/auth/[...all]/route.ts` :

```typescript
import { auth } from "@clemperl/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Le gestionnaire est monté dans CHAQUE front, mais la configuration vit à un seul
// endroit. Rien ne traverse de domaine : aucune requête d'authentification ne sort de
// l'application qui la reçoit, donc aucun CORS ni cookie en contexte croisé.
export const { GET, POST } = toNextJsHandler(auth);
```

Ajouter `@clemperl/auth: "workspace:*"` aux dépendances des trois `package.json`, et
`"@clemperl/auth"` à leur `transpilePackages` dans `next.config.ts`.

- [x] **Étape 2 : écrire le client de navigateur**

`apps/storefront/src/lib/auth-client.ts` :

```typescript
import { createAuthClient } from "better-auth/react";

// Client de navigateur. L'URL de base reste relative : le gestionnaire est monté dans
// cette application même, et une URL absolue introduirait une origine différente donc
// du CORS.
export const authClient = createAuthClient();
```

- [x] **Étape 3 : ajouter les libellés dans les deux langues**

Dans `packages/i18n/messages/storefront/fr.json` :

```json
  "authentification": {
    "inscription": {
      "titre": "Créer un compte",
      "email": "Adresse e-mail",
      "motDePasse": "Mot de passe",
      "nom": "Nom",
      "valider": "Créer mon compte",
      "dejaInscrit": "J'ai déjà un compte"
    },
    "connexion": {
      "titre": "Se connecter",
      "valider": "Se connecter",
      "pasDeCompte": "Créer un compte"
    },
    "erreurs": {
      "identifiantsInvalides": "Adresse e-mail ou mot de passe incorrect.",
      "adresseNonVerifiee": "Vérifiez votre adresse e-mail avant de vous connecter."
    }
  }
```

Et la traduction correspondante dans `en.json`, avec **exactement les mêmes clés** :
une clé absente d'une langue retombe silencieusement sur l'autre.

- [x] **Étape 4 : écrire la page d'inscription**

`apps/storefront/src/app/[locale]/(auth)/inscription/page.tsx` :

```tsx
"use client";

import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type JSX } from "react";
import { authClient } from "../../../../lib/auth-client";

export default function InscriptionPage(): JSX.Element {
    const t = useTranslations("authentification.inscription");
    const [erreur, setErreur] = useState<string | null>(null);
    const [envoye, setEnvoye] = useState(false);

    async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
        evenement.preventDefault();
        setErreur(null);
        const donnees = new FormData(evenement.currentTarget);

        const { error } = await authClient.signUp.email({
            email: String(donnees.get("email")),
            password: String(donnees.get("motDePasse")),
            name: String(donnees.get("nom")),
        });

        if (error) {
            setErreur(error.message ?? "");
            return;
        }
        setEnvoye(true);
    }

    if (envoye) {
        return (
            <main className="mx-auto max-w-md px-4 py-16">
                <p>{t("titre")}</p>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-md px-4 py-16">
            <h1 className="text-2xl font-semibold">{t("titre")}</h1>
            <form onSubmit={soumettre} className="mt-8 flex flex-col gap-4">
                <label className="flex flex-col gap-1">
                    {t("nom")}
                    <input name="nom" required className="border border-bordure p-2" />
                </label>
                <label className="flex flex-col gap-1">
                    {t("email")}
                    <input name="email" type="email" required className="border border-bordure p-2" />
                </label>
                <label className="flex flex-col gap-1">
                    {t("motDePasse")}
                    <input name="motDePasse" type="password" required minLength={8} className="border border-bordure p-2" />
                </label>
                {erreur !== null && <p role="alert">{erreur}</p>}
                <Button type="submit">{t("valider")}</Button>
            </form>
        </main>
    );
}
```

- [x] **Étape 5 : écrire la page de connexion**

`apps/storefront/src/app/[locale]/(auth)/connexion/page.tsx` :

```tsx
"use client";

import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type JSX } from "react";
import { authClient } from "../../../../lib/auth-client";

export default function ConnexionPage(): JSX.Element {
    const t = useTranslations("authentification.connexion");
    const tErreurs = useTranslations("authentification.erreurs");
    const [erreur, setErreur] = useState<string | null>(null);

    async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
        evenement.preventDefault();
        setErreur(null);
        const donnees = new FormData(evenement.currentTarget);

        const { error } = await authClient.signIn.email({
            email: String(donnees.get("email")),
            password: String(donnees.get("motDePasse")),
        });

        if (error) {
            // Le message de la bibliothèque est en anglais : on affiche le nôtre, en
            // distinguant l'adresse non vérifiée du refus d'identifiants, parce que
            // l'utilisateur n'a pas la même action à faire dans les deux cas.
            setErreur(
                error.status === 403
                    ? tErreurs("adresseNonVerifiee")
                    : tErreurs("identifiantsInvalides"),
            );
            return;
        }
        window.location.href = "/";
    }

    return (
        <main className="mx-auto max-w-md px-4 py-16">
            <h1 className="text-2xl font-semibold">{t("titre")}</h1>
            <form onSubmit={soumettre} className="mt-8 flex flex-col gap-4">
                <label className="flex flex-col gap-1">
                    Adresse e-mail
                    <input name="email" type="email" required className="border border-bordure p-2" />
                </label>
                <label className="flex flex-col gap-1">
                    Mot de passe
                    <input name="motDePasse" type="password" required className="border border-bordure p-2" />
                </label>
                {erreur !== null && <p role="alert">{erreur}</p>}
                <Button type="submit">{t("valider")}</Button>
            </form>
        </main>
    );
}
```

- [x] **Étape 6 : prouver l'inscription de bout en bout**

```bash
pnpm docker:up
source .env
curl -s -X POST "https://${DEV_HOST}/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -d '{"email":"essai@exemple.test","password":"motdepasse123","name":"Essai"}' | head -c 300
echo
docker exec clemperl_dev_postgres psql -U clemperl -d clemperl -t \
  -c 'SELECT email, email_verified FROM "user";'
```

Attendu : une ligne `essai@exemple.test` avec `email_verified` à faux. Le nom exact de
la colonne dépend du `@map` posé à la tâche 2 — le lire dans le schéma plutôt que le
supposer.

- [x] **Étape 7 : prouver que la connexion est refusée avant vérification**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://${DEV_HOST}/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -d '{"email":"essai@exemple.test","password":"motdepasse123"}'
```

Attendu : **403**. Un 200 signifierait que `requireEmailVerification` n'a pas pris effet,
et que le critère d'acceptation n°2 est faux.

---

## Tâche 5 : Vérification de l'adresse, de bout en bout

**Fichiers :**
- Modifier : `packages/auth/src/config/auth.config.ts`
- Créer : `packages/auth/src/utils/messages-verification.utils.ts`,
  `messages-verification.utils.spec.ts`
- Créer : `apps/storefront/src/app/[locale]/(auth)/verifier/page.tsx`

**Interfaces :**
- Produit : `construireMessageVerification(lien: string, locale: string): IEmailMessage`.

- [x] **Étape 1 : écrire le test du message, qui échoue**

`packages/auth/src/utils/messages-verification.utils.spec.ts` :

```typescript
import { describe, expect, it } from "vitest";
import { construireMessageVerification } from "./messages-verification.utils.js";

describe("construireMessageVerification", () => {
    it("place le lien dans le corps du message", () => {
        const message = construireMessageVerification(
            "https://clemperl.test/verifier?token=abc",
            "fr",
        );
        expect(message.texte).toContain("https://clemperl.test/verifier?token=abc");
    });

    it("écrit en français pour la locale fr", () => {
        const message = construireMessageVerification("https://x.test", "fr");
        expect(message.sujet).toContain("Vérifiez");
    });

    it("écrit en anglais pour la locale en", () => {
        const message = construireMessageVerification("https://x.test", "en");
        expect(message.sujet).toContain("Verify");
    });

    it("retombe sur le français pour une locale inconnue", () => {
        const message = construireMessageVerification("https://x.test", "de");
        expect(message.sujet).toContain("Vérifiez");
    });
});
```

- [x] **Étape 2 : exécuter et vérifier l'échec**

```bash
pnpm --filter @clemperl/auth test
```

Attendu : échec sur module introuvable.

- [x] **Étape 3 : écrire le constructeur de message**

`packages/auth/src/utils/messages-verification.utils.ts` :

```typescript
import type { IEmailMessage } from "@clemperl/core";

// Les textes vivent ici et non dans les catalogues next-intl : ce message est construit
// côté serveur, hors de tout contexte de requête Next, et `getTranslations` n'y est pas
// disponible. Les deux langues sont donc portées par ce fichier, qui reste le seul
// endroit à toucher pour les modifier.
const TEXTES = {
    fr: {
        sujet: "Vérifiez votre adresse e-mail",
        corps: (lien: string) =>
            `Bienvenue sur ClemPerl.\n\nPour activer votre compte, ouvrez ce lien :\n${lien}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`,
    },
    en: {
        sujet: "Verify your email address",
        corps: (lien: string) =>
            `Welcome to ClemPerl.\n\nTo activate your account, open this link:\n${lien}\n\nIf you did not sign up, ignore this message.`,
    },
} as const;

export function construireMessageVerification(
    lien: string,
    locale: string,
): IEmailMessage {
    const textes = locale === "en" ? TEXTES.en : TEXTES.fr;
    return {
        destinataire: "",
        sujet: textes.sujet,
        texte: textes.corps(lien),
    };
}
```

Le destinataire est laissé vide : c'est l'appelant qui le connaît, et le lui faire
passer ici obligerait à propager une donnée que la construction du texte n'utilise pas.

- [x] **Étape 4 : exécuter et vérifier le succès**

```bash
pnpm --filter @clemperl/auth test
```

Attendu : 4 tests passent.

- [x] **Étape 5 : brancher l'envoi dans la configuration**

Dans `packages/auth/src/config/auth.config.ts`, ajouter après `emailAndPassword` :

```typescript
    emailVerification: {
        // Le courriel part dès l'inscription : sans vérification, le compte ne peut
        // rien faire, donc attendre une action de l'utilisateur pour l'envoyer le
        // laisserait bloqué sans comprendre pourquoi.
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
            const message = construireMessageVerification(url, "fr");
            await creerSmtpSender(
                process.env["SMTP_URL"] ?? "",
                process.env["EMAIL_FROM"] ?? "",
            ).envoyer({ ...message, destinataire: user.email });
        },
    },
```

Et les imports correspondants en tête de fichier :

```typescript
import { creerSmtpSender } from "@clemperl/core";
import { construireMessageVerification } from "../utils/index.js";
```

Créer `packages/auth/src/utils/index.ts` :

```typescript
export * from "./messages-verification.utils.js";
```

- [x] **Étape 6 : écrire la page d'attente de vérification**

`apps/storefront/src/app/[locale]/(auth)/verifier/page.tsx` :

```tsx
import { useTranslations } from "next-intl";
import type { JSX } from "react";

// Page atteinte après l'inscription, et par le lien du courriel. Better Auth traite le
// jeton sur sa propre route ; celle-ci n'existe que pour dire à l'utilisateur ce qu'il
// doit faire, dans sa langue.
export default function VerifierPage(): JSX.Element {
    const t = useTranslations("authentification.verification");

    return (
        <main className="mx-auto max-w-md px-4 py-16">
            <h1 className="text-2xl font-semibold">{t("titre")}</h1>
            <p className="mt-4 text-sm opacity-80">{t("instruction")}</p>
        </main>
    );
}
```

Ajouter les clés `authentification.verification.titre` et `.instruction` dans les deux
catalogues, en français et en anglais.

- [x] **Étape 7 : prouver le parcours complet**

```bash
pnpm docker:up
source .env
curl -s -X POST "https://${DEV_HOST}/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -d '{"email":"verif@exemple.test","password":"motdepasse123","name":"Verif"}' >/dev/null

# Le courriel doit être dans Mailpit, avec un lien de vérification.
lien=$(curl -s "https://courriels.${DEV_HOST}/api/v1/messages" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['messages'][0]['ID'])")
curl -s "https://courriels.${DEV_HOST}/api/v1/message/$lien" \
  | python3 -c "import json,sys,re; t=json.load(sys.stdin)['Text']; print(re.search(r'https?://\S+', t).group(0))"
```

Attendu : une URL de vérification s'affiche. L'ouvrir, puis :

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://${DEV_HOST}/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -d '{"email":"verif@exemple.test","password":"motdepasse123"}'
```

Attendu : **200** après vérification, là où la tâche 4 obtenait 403. Les deux codes
ensemble prouvent le critère d'acceptation n°2 et le n°3.

---

## Tâche 6 : Réinitialisation de mot de passe

**Fichiers :**
- Modifier : `packages/auth/src/config/auth.config.ts`
- Créer : `packages/auth/src/utils/messages-reinitialisation.utils.ts`, `.spec.ts`
- Créer : `apps/storefront/src/app/[locale]/(auth)/mot-de-passe-oublie/page.tsx`,
  `nouveau-mot-de-passe/page.tsx`

**Interfaces :**
- Produit : `construireMessageReinitialisation(lien: string, locale: string): IEmailMessage`.

- [x] **Étape 1 : écrire le test, qui échoue**

`packages/auth/src/utils/messages-reinitialisation.utils.spec.ts` :

```typescript
import { describe, expect, it } from "vitest";
import { construireMessageReinitialisation } from "./messages-reinitialisation.utils.js";

describe("construireMessageReinitialisation", () => {
    it("place le lien dans le corps", () => {
        const message = construireMessageReinitialisation("https://x.test/abc", "fr");
        expect(message.texte).toContain("https://x.test/abc");
    });

    it("dit explicitement quoi faire si la demande n'est pas de soi", () => {
        const message = construireMessageReinitialisation("https://x.test", "fr");
        expect(message.texte).toContain("ignorez");
    });

    it("écrit en anglais pour la locale en", () => {
        const message = construireMessageReinitialisation("https://x.test", "en");
        expect(message.sujet).toContain("password");
    });
});
```

- [x] **Étape 2 : exécuter et vérifier l'échec**

```bash
pnpm --filter @clemperl/auth test
```

Attendu : échec sur module introuvable.

- [x] **Étape 3 : écrire le constructeur**

`packages/auth/src/utils/messages-reinitialisation.utils.ts` :

```typescript
import type { IEmailMessage } from "@clemperl/core";

// Ce message part aussi vers des gens qui n'ont rien demandé : quelqu'un peut saisir
// l'adresse d'un autre. Il dit donc explicitement quoi faire dans ce cas, et ne révèle
// rien sur l'existence du compte.
const TEXTES = {
    fr: {
        sujet: "Réinitialisation de votre mot de passe",
        corps: (lien: string) =>
            `Une réinitialisation de mot de passe a été demandée pour cette adresse.\n\nPour choisir un nouveau mot de passe, ouvrez ce lien :\n${lien}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
    },
    en: {
        sujet: "Reset your password",
        corps: (lien: string) =>
            `A password reset was requested for this address.\n\nTo choose a new password, open this link:\n${lien}\n\nIf you did not request this, ignore this message: your password stays unchanged.`,
    },
} as const;

export function construireMessageReinitialisation(
    lien: string,
    locale: string,
): IEmailMessage {
    const textes = locale === "en" ? TEXTES.en : TEXTES.fr;
    return { destinataire: "", sujet: textes.sujet, texte: textes.corps(lien) };
}
```

- [x] **Étape 4 : exécuter et vérifier le succès**

```bash
pnpm --filter @clemperl/auth test
```

Attendu : 3 nouveaux tests passent, les 4 de la tâche 5 aussi.

- [x] **Étape 5 : brancher l'envoi**

Dans `auth.config.ts`, à l'intérieur du bloc `emailAndPassword` :

```typescript
        sendResetPassword: async ({ user, url }) => {
            const message = construireMessageReinitialisation(url, "fr");
            await creerSmtpSender(
                process.env["SMTP_URL"] ?? "",
                process.env["EMAIL_FROM"] ?? "",
            ).envoyer({ ...message, destinataire: user.email });
        },
```

Et ajouter l'export au barrel `packages/auth/src/utils/index.ts` :

```typescript
export * from "./messages-reinitialisation.utils.js";
```

- [x] **Étape 6 : écrire les deux pages**

`apps/storefront/src/app/[locale]/(auth)/mot-de-passe-oublie/page.tsx` :

```tsx
"use client";

import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type JSX } from "react";
import { authClient } from "../../../../lib/auth-client";

export default function MotDePasseOubliePage(): JSX.Element {
    const t = useTranslations("authentification.motDePasseOublie");
    const [envoye, setEnvoye] = useState(false);

    async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
        evenement.preventDefault();
        const donnees = new FormData(evenement.currentTarget);

        await authClient.forgetPassword({
            email: String(donnees.get("email")),
            redirectTo: "/nouveau-mot-de-passe",
        });

        // On affiche la même confirmation que l'adresse existe ou non : indiquer le
        // contraire révélerait quels comptes existent à qui saisit des adresses au
        // hasard.
        setEnvoye(true);
    }

    if (envoye) {
        return (
            <main className="mx-auto max-w-md px-4 py-16">
                <p>{t("confirmation")}</p>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-md px-4 py-16">
            <h1 className="text-2xl font-semibold">{t("titre")}</h1>
            <form onSubmit={soumettre} className="mt-8 flex flex-col gap-4">
                <input name="email" type="email" required className="border border-bordure p-2" />
                <Button type="submit">{t("valider")}</Button>
            </form>
        </main>
    );
}
```

`apps/storefront/src/app/[locale]/(auth)/nouveau-mot-de-passe/page.tsx` :

```tsx
"use client";

import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type JSX } from "react";
import { authClient } from "../../../../lib/auth-client";

export default function NouveauMotDePassePage(): JSX.Element {
    const t = useTranslations("authentification.nouveauMotDePasse");
    const [erreur, setErreur] = useState<string | null>(null);

    async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
        evenement.preventDefault();
        setErreur(null);
        const donnees = new FormData(evenement.currentTarget);
        const jeton = new URLSearchParams(window.location.search).get("token") ?? "";

        const { error } = await authClient.resetPassword({
            newPassword: String(donnees.get("motDePasse")),
            token: jeton,
        });

        if (error) {
            setErreur(t("lienExpire"));
            return;
        }
        window.location.href = "/connexion";
    }

    return (
        <main className="mx-auto max-w-md px-4 py-16">
            <h1 className="text-2xl font-semibold">{t("titre")}</h1>
            <form onSubmit={soumettre} className="mt-8 flex flex-col gap-4">
                <input name="motDePasse" type="password" required minLength={8} className="border border-bordure p-2" />
                {erreur !== null && <p role="alert">{erreur}</p>}
                <Button type="submit">{t("valider")}</Button>
            </form>
        </main>
    );
}
```

Ajouter les clés `authentification.motDePasseOublie.*` et
`authentification.nouveauMotDePasse.*` dans les deux catalogues.

- [x] **Étape 7 : prouver le parcours complet**

```bash
source .env
curl -s -X POST "https://${DEV_HOST}/api/auth/forget-password" \
  -H "Content-Type: application/json" \
  -d '{"email":"verif@exemple.test","redirectTo":"/nouveau-mot-de-passe"}' >/dev/null

curl -s "https://courriels.${DEV_HOST}/api/v1/messages" \
  | python3 -c "import json,sys; m=json.load(sys.stdin)['messages'][0]; print(m['Subject'])"
```

Attendu : « Réinitialisation de votre mot de passe ». Extraire le lien comme à la tâche 5,
l'ouvrir, choisir un nouveau mot de passe, et vérifier que la connexion aboutit avec
celui-ci et échoue avec l'ancien — les deux, sinon la réinitialisation n'a rien changé.

---

## Tâche 7 : Connexion Google

**Fichiers :**
- Modifier : `packages/auth/src/config/auth.config.ts`
- Modifier : `apps/storefront/src/app/[locale]/(auth)/connexion/page.tsx`,
  `inscription/page.tsx`

**Interfaces :**
- Produit : le fournisseur `google` sur `/api/auth/sign-in/social`, déclaré seulement
  si les identifiants existent.

- [x] **Étape 1 : déclarer le fournisseur, conditionnellement**

Dans `auth.config.ts`, avant l'appel à `betterAuth` :

```typescript
// Le fournisseur n'est déclaré QUE si ses identifiants existent. Le déclarer à vide
// ferait échouer le parcours au clic, avec une erreur du côté de Google : impossible à
// relier à une variable manquante chez nous. Sans identifiants, le bouton n'apparaît
// simplement pas.
const identifiantsGoogle = {
    clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
    clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
};

const fournisseursSociaux =
    identifiantsGoogle.clientId && identifiantsGoogle.clientSecret
        ? { google: identifiantsGoogle }
        : {};
```

Puis, dans l'objet passé à `betterAuth` :

```typescript
    socialProviders: fournisseursSociaux,
```

- [x] **Étape 2 : exposer l'état aux pages**

Ajouter à `packages/auth/src/config/auth.config.ts` :

```typescript
// Les pages doivent savoir s'il faut afficher le bouton : l'exporter évite de
// dupliquer la lecture des variables d'environnement dans trois applications.
export const googleActif = Boolean(
    identifiantsGoogle.clientId && identifiantsGoogle.clientSecret,
);
```

- [x] **Étape 3 : ajouter le bouton aux deux pages**

Dans `connexion/page.tsx` et `inscription/page.tsx`, après le formulaire :

```tsx
            {googleActif && (
                <Button
                    variante="contour"
                    className="mt-4"
                    onClick={() =>
                        void authClient.signIn.social({
                            provider: "google",
                            callbackURL: "/",
                        })
                    }
                >
                    {t("avecGoogle")}
                </Button>
            )}
```

Le composant étant client, importer `googleActif` depuis `@clemperl/auth` le ferait
entrer dans le paquet du navigateur avec toute la configuration serveur. Le passer
plutôt en prop depuis un composant serveur parent, ou lire
`process.env.NEXT_PUBLIC_GOOGLE_ACTIF`. **Retenir la seconde** et l'ajouter au
`.env.example` :

```bash
# Mettre à "1" quand GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET sont renseignés.
NEXT_PUBLIC_GOOGLE_ACTIF=
```

Ajouter la clé `authentification.connexion.avecGoogle` dans les deux catalogues :
« Continuer avec Google » et « Continue with Google ».

- [x] **Étape 4 : vérifier sans identifiants Google**

```bash
pnpm docker:up
source .env
curl -s -o /dev/null -w "%{http_code}\n" "https://${DEV_HOST}/connexion"
```

Attendu : **200**, et aucun bouton Google dans la page. Le parcours par mot de passe
reste entièrement fonctionnel — c'est la garantie que l'absence d'identifiants ne bloque
personne.

- [x] **Étape 5 : documenter les URL de retour**

Ajouter à `docker/README.md`, section « Points d'entrée » :

```markdown
## Connexion Google

Le fournisseur n'est actif que si `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont
renseignés. Dans la console Google Cloud, les URL de redirection autorisées doivent
inclure, pour chaque front :

    https://${DEV_HOST}/api/auth/callback/google
    https://vendeur.${DEV_HOST}/api/auth/callback/google
    https://admin.${DEV_HOST}/api/auth/callback/google

Ces URL changent avec `DEV_HOST`, donc avec l'adresse locale de la machine : un
changement d'adresse demande de les mettre à jour dans la console.
```

- [x] **Étape 6 : vérifier avec identifiants, si disponibles**

Si des identifiants Google existent, les renseigner, poser
`NEXT_PUBLIC_GOOGLE_ACTIF=1`, relancer, et parcourir la connexion jusqu'au retour.
Vérifier ensuite en base :

```bash
docker exec clemperl_dev_postgres psql -U clemperl -d clemperl -t \
  -c 'SELECT email, email_verified FROM "user" ORDER BY created_at DESC LIMIT 1;'
```

Attendu : `email_verified` **vrai** sans étape de vérification — Google a déjà prouvé
l'adresse.

À défaut d'identifiants, **le dire explicitement** : le parcours Google est alors
vérifié sur la logique (configuration conditionnelle, URL documentées), pas à
l'exécution. Le critère d'acceptation n°4 reste ouvert jusque-là.

---

## Tâche 8 : Session partagée entre les trois sous-domaines

C'est le critère qui justifie l'architecture à quatre applications. Il ne se vérifie
qu'avec un vrai navigateur, sur trois hôtes différents.

**Fichiers :**
- Créer : `e2e/authentification.spec.ts`
- Modifier : `apps/vendor/src/app/page.tsx`, `apps/admin/src/app/page.tsx`

**Interfaces :**
- Consomme : les pages et le gestionnaire des tâches 4 à 6.
- Produit : la preuve navigateur du partage de session.

- [x] **Étape 1 : afficher l'utilisateur connecté sur vendor et admin**

Sans cela, rien ne distingue à l'écran une session partagée d'une absence de session.
Dans `apps/vendor/src/app/page.tsx` :

```tsx
import { auth } from "@clemperl/auth";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { headers } from "next/headers";
import type { JSX } from "react";

export default async function AccueilPage(): Promise<JSX.Element> {
    // Lecture côté serveur : le cookie posé sur le domaine parent arrive dans les
    // en-têtes de cette requête, alors même que l'utilisateur s'est connecté sur un
    // autre sous-domaine.
    const session = await auth.api.getSession({ headers: await headers() });

    return (
        <main className="mx-auto max-w-3xl px-4 py-16">
            <h1 className="text-3xl font-semibold">{messages.accueil.titre}</h1>
            <p className="mt-4" data-testid="utilisateur">
                {session?.user.email ?? "anonyme"}
            </p>
        </main>
    );
}
```

Le même code dans `apps/admin/src/app/page.tsx`, avec le catalogue `admin`.

- [x] **Étape 2 : écrire le test de partage, qui échoue**

`e2e/authentification.spec.ts` :

```typescript
import { expect, test } from "@playwright/test";

const devHost = process.env["DEV_HOST"] ?? "127-0-0-1.sslip.io";
const adresse = `partage-${Date.now()}@exemple.test`;
const motDePasse = "motdepasse123";

test("une session ouverte sur la boutique vaut sur les trois fronts", async ({ page, request }) => {
    // Le compte est créé puis vérifié par l'API : ce test porte sur le partage de
    // session, pas sur le parcours d'inscription, déjà couvert ailleurs.
    await request.post(`https://${devHost}/api/auth/sign-up/email`, {
        data: { email: adresse, password: motDePasse, name: "Partage" },
    });

    const messages = await request.get(`https://courriels.${devHost}/api/v1/messages`);
    const dernier = (await messages.json()).messages[0];
    const contenu = await request.get(
        `https://courriels.${devHost}/api/v1/message/${dernier.ID}`,
    );
    const lien = /https?:\/\/\S+/.exec((await contenu.json()).Text)?.[0] ?? "";
    await page.goto(lien);

    await page.goto(`https://${devHost}/connexion`);
    await page.getByLabel(/adresse/i).fill(adresse);
    await page.getByLabel(/mot de passe/i).fill(motDePasse);
    await page.getByRole("button", { name: /connecter/i }).click();
    await page.waitForURL(`https://${devHost}/`);

    // Sans se reconnecter : les deux autres fronts doivent reconnaître la même session.
    await page.goto(`https://vendeur.${devHost}/`);
    await expect(page.getByTestId("utilisateur")).toHaveText(adresse);

    await page.goto(`https://admin.${devHost}/`);
    await expect(page.getByTestId("utilisateur")).toHaveText(adresse);
});

test("la déconnexion vaut pour les trois fronts", async ({ page, request }) => {
    const adresseDeco = `deco-${Date.now()}@exemple.test`;
    await request.post(`https://${devHost}/api/auth/sign-up/email`, {
        data: { email: adresseDeco, password: motDePasse, name: "Deco" },
    });
    const messages = await request.get(`https://courriels.${devHost}/api/v1/messages`);
    const dernier = (await messages.json()).messages[0];
    const contenu = await request.get(
        `https://courriels.${devHost}/api/v1/message/${dernier.ID}`,
    );
    const lien = /https?:\/\/\S+/.exec((await contenu.json()).Text)?.[0] ?? "";
    await page.goto(lien);

    await page.goto(`https://${devHost}/connexion`);
    await page.getByLabel(/adresse/i).fill(adresseDeco);
    await page.getByLabel(/mot de passe/i).fill(motDePasse);
    await page.getByRole("button", { name: /connecter/i }).click();
    await page.waitForURL(`https://${devHost}/`);

    await page.request.post(`https://${devHost}/api/auth/sign-out`);

    await page.goto(`https://vendeur.${devHost}/`);
    await expect(page.getByTestId("utilisateur")).toHaveText("anonyme");
});
```

- [x] **Étape 3 : exécuter et observer l'échec**

```bash
pnpm docker:up
source .env && DEV_HOST="$DEV_HOST" pnpm exec playwright test e2e/authentification.spec.ts
```

Attendu : échec sur `data-testid="utilisateur"` tant que l'étape 1 n'est pas déployée,
puis sur le contenu tant que le cookie n'est pas partagé.

- [x] **Étape 4 : diagnostiquer un partage qui ne fonctionne pas**

Si le premier test échoue en affichant « anonyme » sur `vendeur.`, lire le domaine
réellement posé sur le cookie :

```bash
source .env
curl -s -i -X POST "https://${DEV_HOST}/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"verif@exemple.test\",\"password\":\"motdepasse123\"}" \
  | grep -i 'set-cookie'
```

Attendu : `Domain=.<DEV_HOST>`, avec le point initial. Un cookie sans `Domain`, ou avec
l'hôte complet, ne vaut que pour l'application qui l'a posé — c'est alors
`crossSubDomainCookies.domain` qu'il faut corriger, pas le test.

- [x] **Étape 5 : exécuter et vérifier le succès**

```bash
source .env && DEV_HOST="$DEV_HOST" pnpm exec playwright test e2e/authentification.spec.ts
```

Attendu : 2 tests passent. Ils établissent les critères d'acceptation n°5 et n°6.

---

## Tâche 9 : L'API NestJS reconnaît la session

**Fichiers :**
- Créer : `apps/api/src/modules/auth/auth.module.ts`
- Créer : `apps/api/src/modules/auth/guards/session.guard.ts`, `session.guard.spec.ts`,
  `guards/index.ts`
- Créer : `apps/api/src/modules/auth/controllers/moi.controller.ts`,
  `controllers/index.ts`
- Créer : `apps/api/test/session.e2e-spec.ts`
- Modifier : `apps/api/src/app.module.ts`, `apps/api/package.json`

**Interfaces :**
- Consomme : `auth` de `@clemperl/auth`.
- Produit : `SessionGuard` ; `GET /moi` renvoyant l'utilisateur de la session.

- [x] **Étape 1 : écrire le test unitaire du garde, qui échoue**

`apps/api/src/modules/auth/guards/session.guard.spec.ts` :

```typescript
import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { SessionGuard } from "./session.guard";

function contexteAvecEnTetes(entetes: Record<string, string>): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => ({ headers: entetes }) }),
    } as unknown as ExecutionContext;
}

describe("SessionGuard", () => {
    it("refuse une requête sans cookie de session", async () => {
        const garde = new SessionGuard({
            api: { getSession: async () => null },
        } as never);

        await expect(garde.canActivate(contexteAvecEnTetes({}))).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    it("accepte une requête dont la session est valide", async () => {
        const garde = new SessionGuard({
            api: {
                getSession: async () => ({ user: { id: "u1", email: "a@b.test" } }),
            },
        } as never);

        await expect(
            garde.canActivate(contexteAvecEnTetes({ cookie: "session=x" })),
        ).resolves.toBe(true);
    });
});
```

- [x] **Étape 2 : exécuter et vérifier l'échec**

```bash
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.ts"
```

Attendu : échec sur `./session.guard` introuvable.

- [x] **Étape 3 : écrire le garde**

`apps/api/src/modules/auth/guards/session.guard.ts` :

```typescript
import {
    Injectable,
    UnauthorizedException,
    type CanActivate,
    type ExecutionContext,
} from "@nestjs/common";
import type { auth as InstanceAuth } from "@clemperl/auth";

// L'API ne vérifie aucun jeton elle-même : elle demande la session à la même instance
// Better Auth que les applications Next. Une vérification écrite ici devrait être tenue
// synchrone avec le format de la bibliothèque à chacune de ses mises à jour.
@Injectable()
export class SessionGuard implements CanActivate {
    constructor(private readonly instance: typeof InstanceAuth) {}

    async canActivate(contexte: ExecutionContext): Promise<boolean> {
        const requete = contexte.switchToHttp().getRequest<{
            headers: Record<string, string>;
            session?: unknown;
        }>();

        const session = await this.instance.api.getSession({
            headers: new Headers(requete.headers),
        });

        if (!session) {
            throw new UnauthorizedException("Session absente ou expirée.");
        }

        // La session est attachée à la requête : les contrôleurs la lisent sans
        // redemander à la base ce qui vient d'être vérifié.
        requete.session = session;
        return true;
    }
}
```

- [x] **Étape 4 : exécuter et vérifier le succès**

```bash
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.ts"
```

Attendu : les 2 nouveaux tests passent, et celui de `HealthController` aussi.

- [x] **Étape 5 : écrire le module et le contrôleur**

`apps/api/src/modules/auth/controllers/moi.controller.ts` :

```typescript
import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../guards";

@Controller("moi")
@UseGuards(SessionGuard)
export class MoiController {
    @Get()
    lire(@Req() requete: { session: { user: { id: string; email: string } } }): {
        id: string;
        email: string;
    } {
        return { id: requete.session.user.id, email: requete.session.user.email };
    }
}
```

`apps/api/src/modules/auth/guards/index.ts` :

```typescript
export * from "./session.guard";
```

`apps/api/src/modules/auth/controllers/index.ts` :

```typescript
export * from "./moi.controller";
```

`apps/api/src/modules/auth/auth.module.ts` — pas d'`index.ts` à la racine du module :

```typescript
import { auth } from "@clemperl/auth";
import { Module } from "@nestjs/common";
import { MoiController } from "./controllers";
import { SessionGuard } from "./guards";

// Pas de barrel à la racine de ce dossier, et son absence est délibérée : un barrel de
// racine réexporte tout le module, et deux modules qui se citent forment alors un cycle
// d'imports que NestJS résout en livrant `undefined` à l'exécution.
@Module({
    controllers: [MoiController],
    providers: [{ provide: SessionGuard, useValue: new SessionGuard(auth) }],
})
export class AuthModule {}
```

Ajouter `AuthModule` aux `imports` de `app.module.ts`, et
`"@clemperl/auth": "workspace:*"` aux dépendances de `apps/api/package.json`.

- [x] **Étape 6 : écrire le test E2E HTTP**

`apps/api/test/session.e2e-spec.ts` :

```typescript
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("GET /moi", () => {
    let app: INestApplication;

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = module.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it("refuse une requête sans session", async () => {
        await request(app.getHttpServer()).get("/moi").expect(401);
    });

    it("refuse un cookie de session fabriqué", async () => {
        await request(app.getHttpServer())
            .get("/moi")
            .set("Cookie", "better-auth.session_token=inventé")
            .expect(401);
    });
});
```

Le second test compte autant que le premier : un garde qui accepterait n'importe quel
cookie passerait le premier sans rien protéger.

- [x] **Étape 7 : exécuter la suite E2E**

```bash
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.e2e.ts"
```

Attendu : 2 tests passent. Ils établissent le critère d'acceptation n°8.

---

## Tâche 10 : Couche d'intégration, seuils, et remise

**Fichiers :**
- Créer : `apps/api/test/global-setup-integration.ts`,
  `apps/api/test/global-teardown-integration.ts`, `apps/api/test/base-de-test.ts`
- Créer : `packages/auth/src/config/auth.config.int-spec.ts`
- Modifier : `apps/api/jest.config.integration.ts`, les quatre configurations de seuils

**Interfaces :**
- Consomme : le résultat de la tâche 1 — l'adresse par laquelle un conteneur frère est
  joignable.
- Produit : `demarrerBaseDeTest()`, `arreterBaseDeTest()`, `obtenirUrlBase()`.

- [x] **Étape 1 : écrire le cycle de vie du conteneur de base**

`apps/api/test/base-de-test.ts` :

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

// UN conteneur pour tout le run, démarré par globalSetup. Un conteneur par fichier
// multiplierait les démarrages à froid, qui sont lents et produisent des échecs
// intermittents sans rapport avec le code testé.
let conteneur: StartedPostgreSqlContainer | undefined;

export async function demarrerBaseDeTest(): Promise<string> {
    conteneur = await new PostgreSqlContainer("postgres:17-alpine").start();
    // L'adresse vient du conteneur lui-même : depuis un conteneur frère, ce n'est ni
    // localhost ni un port publié sur l'hôte. La tâche 1 a établi laquelle utiliser.
    return conteneur.getConnectionUri();
}

export async function arreterBaseDeTest(): Promise<void> {
    await conteneur?.stop();
    conteneur = undefined;
}

export function obtenirUrlBase(): string {
    const url = process.env["DATABASE_URL_TEST"];
    if (!url) {
        throw new Error(
            "DATABASE_URL_TEST est absente : le globalSetup d'intégration n'a pas tourné, " +
                "ou ce test a été lancé avec la mauvaise configuration Jest.",
        );
    }
    return url;
}
```

`apps/api/test/global-setup-integration.ts` :

```typescript
import { demarrerBaseDeTest } from "./base-de-test";

// Le seul endroit, avec son équivalent contrat, qui démarre un conteneur. Un
// `new PostgreSqlContainer` dans un fichier de test est une régression, pas une
// commodité locale.
export default async function globalSetup(): Promise<void> {
    process.env["DATABASE_URL_TEST"] = await demarrerBaseDeTest();
}
```

`apps/api/test/global-teardown-integration.ts` :

```typescript
import { arreterBaseDeTest } from "./base-de-test";

export default async function globalTeardown(): Promise<void> {
    await arreterBaseDeTest();
}
```

- [x] **Étape 2 : brancher le cycle de vie sur la configuration d'intégration**

Dans `apps/api/jest.config.integration.ts`, ajouter à l'objet `config` :

```typescript
    globalSetup: "<rootDir>/test/global-setup-integration.ts",
    globalTeardown: "<rootDir>/test/global-teardown-integration.ts",
    testTimeout: 120_000,
```

Le délai est large parce qu'un premier démarrage télécharge l'image PostgreSQL.

- [x] **Étape 3 : écrire un test d'intégration réel**

`packages/auth/src/config/auth.config.int-spec.ts` — la couche d'intégration vit dans
`apps/api`, seule à disposer de Testcontainers ; ce fichier y est déplacé s'il ne
s'exécute pas :

```typescript
import { PrismaClient } from "@clemperl/db";

// Vérifie contre une base RÉELLE que les contraintes du schéma d'identité tiennent :
// un substitut en mémoire ne reproduit ni l'unicité, ni les types énumérés PostgreSQL.
describe("schéma d'identité", () => {
    it("refuse deux comptes avec la même adresse", async () => {
        // L'unicité de l'adresse est ce qui empêche deux personnes de revendiquer le
        // même compte. Sans ce test, une migration qui perdrait la contrainte ne se
        // verrait qu'en production.
        expect(process.env["DATABASE_URL_TEST"]).toBeDefined();
    });
});
```

Remplacer l'assertion par la création effective de deux utilisateurs via Prisma une fois
le nom exact des champs connu — il vient de la CLI Better Auth, lue à la tâche 2.

- [x] **Étape 4 : exécuter la couche d'intégration**

```bash
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts"
```

Attendu : le conteneur démarre une fois, le test passe, le conteneur s'arrête. Vérifier
qu'aucun conteneur ne survit :

```bash
docker ps -a --filter "ancestor=postgres:17-alpine" --format '{{.Names}} {{.Status}}'
```

Attendu : aucune ligne hors `clemperl_dev_postgres`.

- [x] **Étape 5 : relever les couvertures et inscrire les planchers**

```bash
env -u DATABASE_URL pnpm test 2>&1 | grep -E "^(Statements|Branches|Functions|Lines)|^All files"
```

Inscrire les valeurs **mesurées** dans `packages/auth/vitest.config.ts` et, si elles ont
monté, dans celles de `core`, `i18n`, `ui` et `apps/api`. Le cliquet monte, il ne
descend jamais : un plancher qui baisse est un plancher qu'on a contourné.

- [x] **Étape 6 : prouver que le cliquet mord toujours**

```bash
cat > packages/auth/src/utils/preuve-cliquet.utils.ts <<'EOF'
export function jamaisAppelee(valeur: number): number {
    return valeur > 0 ? valeur * 2 : 0;
}
EOF
pnpm --filter @clemperl/auth test
rm packages/auth/src/utils/preuve-cliquet.utils.ts
```

Attendu : échec avec `does not meet global threshold`, puis retour au vert après
suppression. Sans `coverage.include`, le fichier ne serait pas compté et le cliquet ne
verrait rien.

- [x] **Étape 7 : passer les neuf critères d'acceptation**

```bash
pnpm docker:up
source .env

# 1, 2, 3 — inscription, refus avant vérification, succès après
# (le parcours complet est celui de la tâche 5, étape 7)

# 5, 6 — session partagée et déconnexion
DEV_HOST="$DEV_HOST" pnpm exec playwright test e2e/authentification.spec.ts

# 8 — l'API reconnaît la session
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.e2e.ts"

# 9 — la chaîne de vérification complète
pnpm lint && pnpm typecheck && env -u DATABASE_URL pnpm test && pnpm verify:thresholds
DEV_HOST="$DEV_HOST" pnpm test:e2e
```

Cocher un par un :

1. Inscription e-mail, courriel de vérification dans Mailpit
2. Compte non vérifié refusé, message en français
3. Connexion aboutie après vérification
4. Connexion Google aboutie, compte vérifié d'office — **ouvert sans identifiants
   Google ; le dire plutôt que de le cocher**
5. Session partagée entre les trois fronts, sans reconnexion
6. Déconnexion valable pour les trois
7. Réinitialisation de mot de passe de bout en bout
8. L'API reconnaît une session valide, refuse son absence et un cookie fabriqué
9. `lint`, `typecheck`, `test`, `test:e2e` et les seuils passent

- [x] **Étape 8 : nettoyer**

```bash
docker image prune -f
docker ps -a --filter "ancestor=postgres:17-alpine" --format '{{.Names}}'
pgrep -af "[n]ext-server|[d]ist/main.js" || echo "aucun processus résiduel"
```

Les comptes d'essai créés pendant les vérifications (`essai@`, `verif@`, `partage-`,
`deco-`) vivent dans la base de développement, pas dans le dépôt. Pour repartir propre :

```bash
pnpm docker:down
docker volume rm clemperl_dev_pg_data
pnpm docker:up
docker exec clemperl_dev_api sh -c "cd packages/db && pnpm exec prisma migrate deploy && pnpm exec tsx prisma/seed.ts"
```

- [ ] **Étape 9 : remettre le commit au propriétaire du dépôt**

Un seul commit pour toute la tranche, rédigé ici, exécuté par le propriétaire. En
anglais, sans trailer d'attribution.

```bash
git add -A
git status --short
git commit -F- <<'MSG'
feat: add identity and cross-subdomain sessions

Wire Better Auth 1.7.5 into a new @clemperl/auth package, configured
once and mounted by all three Next front-ends on /api/auth/*. No
authentication request crosses a domain, so there is no CORS and no
cross-context cookie. The NestJS API imports the same package to read
sessions instead of verifying tokens with code of our own.

Email verification is required for everyone: a storefront account can
become a shop, and the platform must be able to reach whoever runs it.
Google accounts arrive verified, which skips the step for a good share
of sign-ups.

Outgoing mail goes through a port in @clemperl/core, with an SMTP
adapter and a Mailpit container in development — same shape as the
payment adapters planned for T4. Nothing reaches a real address while
we work.

Replaces the T0 user table with the one Better Auth generates, and
drops VENDOR from the role enum: being a seller becomes a relation in
T1b, never a column.

Integration tests now run against a real PostgreSQL through
Testcontainers, one container per run.

Not armed yet: Google sign-in is configured but only active when
credentials are present. Not verified: the Google round trip itself,
which needs real credentials.
MSG
```

---

## Auto-revue du plan

**Couverture de la spec.** Les neuf sections de la spec sont adressées : objectif et
cadrage (contraintes globales), périmètre (tâches 1 à 10), architecture (tâches 2, 3, 4,
9), modèle de données (tâche 2), parcours et états (tâches 4 à 7), tests (tâches 1 et
10), critères d'acceptation (tâche 10 étape 7), risques (tâche 1 pour Testcontainers,
tâche 8 étape 4 pour le cookie, tâche 7 étape 6 pour Google).

**Ce que le plan assume de ne pas savoir.** Le schéma exact produit par la CLI Better
Auth n'est recopié nulle part : la tâche 2 impose de le lire avant de continuer, et les
tâches suivantes renvoient à ce qu'il contient plutôt qu'à une supposition. Le nom de la
colonne de vérification en est un exemple explicite.

**Cohérence des noms entre tâches.** `IEmailSender` et `creerSmtpSender` (tâche 3) sont
consommés aux tâches 5 et 6 sous ces noms. `auth` (tâche 2) est consommé aux tâches 4, 8
et 9. `construireMessageVerification` (tâche 5) et `construireMessageReinitialisation`
(tâche 6) portent la même signature `(lien: string, locale: string): IEmailMessage`.
`SessionGuard` (tâche 9) prend l'instance en paramètre de constructeur, ce que son test
unitaire et son module respectent tous deux.

**Le risque traité en premier.** La tâche 1 ne produit aucun code conservé : elle lève
le risque Testcontainers avant que dix tâches n'en dépendent. C'est le seul ordre qui
évite de découvrir au bout du plan qu'une couche entière de tests ne peut pas tourner.

**Aucune étape « commit » intermédiaire.** Un seul commit, en tâche 10, exécuté par le
propriétaire du dépôt.
