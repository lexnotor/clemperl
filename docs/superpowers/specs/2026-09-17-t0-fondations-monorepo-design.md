# ClemPerl — T0 : Fondations du monorepo

**Date** : 2026-09-17
**Statut** : design validé, en attente de plan d'implémentation
**Tranche** : T0 (première d'une série — voir « Tranches suivantes »)

---

## 1. Contexte

ClemPerl est une **marketplace multi-vendeurs** destinée à la vente de fournitures
diverses : habillement en premier lieu, puis joaillerie, sacs et accessoires.
Des vendeurs indépendants s'y inscrivent, gèrent leur catalogue, leurs stocks et
leurs commandes. La plateforme arbitre : validation des vendeurs, modération des
produits, taxonomie globale.

Le dépôt est vide au moment d'écrire ce document. T0 met en place les fondations
techniques sur lesquelles toutes les tranches fonctionnelles s'appuieront.

### Référence d'expérience

Sephora sert de référence pour la **qualité visuelle** : densité d'information,
typographie, grilles produits, soin de la fiche produit. Elle ne sert pas de
référence pour le **modèle de navigation** : Sephora est mono-marchand et
fortement éditorialisé, là où une marketplace doit composer avec des fiches
hétérogènes, plusieurs vendeurs pour un même type de produit, et une confiance
qui repose sur la réputation vendeur.

---

## 2. Décisions de cadrage produit

Ces décisions dépassent T0 mais conditionnent ses fondations. Elles sont
consignées ici pour servir de référence aux tranches suivantes.

| Sujet | Décision |
|---|---|
| Modèle | Marketplace multi-vendeurs. Chaque vendeur gère son catalogue et ses commandes. |
| Revenus | **Abonnement vendeur**. Aucune commission prélevée sur les ventes : ni split, ni ledger, ni payout. |
| Flux d'argent | La plateforme **ne détient jamais les fonds des tiers**. Chaque vendeur encaisse avec ses propres comptes (son PSP, son compte mobile money). ClemPerl orchestre et trace. |
| Paiement | Point d'extension, pas une intégration. Chaque vendeur active les méthodes qu'il accepte : carte, mobile money, espèces, paiement à la livraison, virement. Certaines transactions se règlent **hors plateforme** et sont seulement enregistrées. |
| Traçabilité paiement | Pour tout paiement en ligne, le **payload brut du provider est stocké chiffré**, tel qu'il a été reçu. Un adapter par source l'interprète et le normalise. Le domaine commande ne connaît que le statut normalisé. |
| Devises | **Multi-devises dès le départ.** Montants en entiers dans l'unité mineure + code ISO 4217. Jamais de flottant pour un prix, jamais de division par 100 codée en dur (XOF et XAF ont un exposant de 0). |
| Langues | Français par défaut, anglais en second. Interface traduite. |
| Auth | **Révisé en T1a** : Better Auth 1.7.5, indépendante du framework, montée dans chaque application Next avec une configuration unique. Le cookie de session est partagé sur le domaine parent, et NestJS lit la session par le même package. Auth.js v5, retenu ici à l'origine, était toujours en beta neuf mois plus tard. |
| Supabase | **Stockage des médias uniquement.** Ni auth, ni base, ni realtime. Prisma reste seul maître du schéma. |

---

## 3. Périmètre de T0

### Inclus

- Monorepo Turborepo + pnpm, structuré et outillé
- Les quatre applications démarrent et répondent
- Les packages partagés fondamentaux
- Un `Dockerfile` par application, multi-stage, cibles `dev` et `runner`
- Un `docker-compose` de développement complet (tout tourne en conteneur)
- Schéma Prisma initial minimal, migration et seed fonctionnels
- Internationalisation câblée, français par défaut
- Harnais de tests (Jest sur l'API, Vitest ailleurs, Testing Library, Playwright) et CI

### Exclu explicitement

- Toute fonctionnalité métier : pas de produit, pas de panier, pas de commande
- L'authentification réelle (T1) — aucune page de connexion en T0
- Le pipeline médias (T2) — ni Supabase Storage, ni sharp, ni worker BullMQ
- Les packages `@clemperl/domain` et `@clemperl/auth` : leurs **frontières sont
  décidées** (section 4.3) mais ils ne sont **pas créés vides** en T0. Ils
  naissent en T1, avec la première règle métier et la première session.

---

## 4. Architecture

### 4.1 Applications

| App | Package | Techno | Port | Rôle |
|---|---|---|---|---|
| `apps/storefront` | `@clemperl/storefront` | Next 16 | 3000 | Boutique publique, espace client |
| `apps/vendor` | `@clemperl/vendor` | Next 16 | 3001 | Back-office vendeur |
| `apps/admin` | `@clemperl/admin` | Next 16 | 3002 | Back-office plateforme |
| `apps/api` | `@clemperl/api` | NestJS 12 | 3003 | Socket.IO, workers BullMQ, webhooks |

Ces ports ne sont pas exposés à l'extérieur : un reverse proxy nginx est le seul
point d'entrée, en 443 (voir §5.3).

NestJS ne remplace pas Next : il prend en charge ce que Next ne sait pas faire —
connexions persistantes, traitements de fond, réception de webhooks. Les trois
applications Next accèdent à Postgres directement via leurs server actions et
route handlers.

### 4.2 Arborescence

```
clemperl/
├── apps/
│   ├── storefront/
│   ├── vendor/
│   ├── admin/
│   └── api/
├── packages/
│   ├── db/                 @clemperl/db
│   ├── core/               @clemperl/core
│   ├── ui/                 @clemperl/ui
│   ├── i18n/               @clemperl/i18n
│   ├── eslint-config/      @clemperl/eslint-config
│   └── tsconfig/           @clemperl/tsconfig
├── .vscode/
│   └── settings.json       file nesting : replie les tests sous leur fichier
├── docker/
│   └── proxy/              nginx : Dockerfile + configuration nginx
├── docs/superpowers/specs/
├── .github/workflows/
├── turbo.json
├── pnpm-workspace.yaml
├── docker/docker-compose.dev.yml
├── .dockerignore
├── .env.example
├── README.md
└── package.json
```

### 4.3 Frontières des packages

**`@clemperl/core`** — Le vocabulaire métier partagé. **Ne dépend de rien** : ni
Prisma, ni React, ni Nest. Contient les types, les schémas Zod, les erreurs
typées, la validation d'environnement, et `Money`.

`Money` est créé dès T0, avant tout prix affiché, parce que le multi-devises est
impossible à rattraper après coup :

```ts
type Money = {
  amount: number   // entier, unité mineure (centimes, francs CFA…)
  currency: string // ISO 4217 : "EUR", "XOF", "XAF", "CDF"
}
```

L'exposant décimal se déduit de la devise via une table, jamais d'un `/ 100`
codé en dur. Les opérations arithmétiques passent par les helpers du package,
qui refusent d'additionner deux devises différentes.

**`@clemperl/db`** — Le schéma Prisma, les migrations, le seed et un client
singleton. **Exporte le client et les types générés, rien d'autre.** Aucune
logique métier n'y entre. Consommé par les quatre applications.

**`@clemperl/ui`** — Composants shadcn/ui, design tokens, thème. Sans état,
sans accès réseau, sans import de `@clemperl/db`. Partagé par les trois fronts.
Les composants spécifiquement marchands (fiche produit, grille catalogue)
restent dans `apps/storefront` tant qu'une seule application les utilise ; ils
ne descendent dans `ui` qu'au deuxième consommateur.

**`@clemperl/i18n`** — Configuration next-intl et catalogues de traduction,
découpés par application pour éviter d'envoyer les libellés de l'admin dans le
bundle public.

**`@clemperl/domain`** *(créé en T1, décidé ici)* — Les règles métier : stock,
tarification, transitions de statut, permissions. Framework-agnostique, importé
aussi bien par les server actions Next que par les services Nest. C'est la
réponse au risque principal de cette architecture : la même règle écrite deux
fois, à deux endroits, qui divergent silencieusement. Toute règle métier y vit ;
les applications ne portent que le transport.

**`@clemperl/auth`** *(créé en T1, décidé ici)* — Contrat de session partagé et
vérification du JWT côté Nest.

### 4.4 Règles de dépendance

```
apps/*        → core, db, ui, i18n, (domain, auth)
domain        → core, db
db            → core
ui            → core
i18n          → —
core          → —
```

Toute dépendance en sens inverse est un défaut de conception. La CI ne
l'automatise pas en T0, mais la règle est explicite et vérifiable en revue.

### 4.5 Versions retenues

Vérifiées sur le registre npm le 2026-09-17.

| Paquet | Version | Remarque |
|---|---|---|
| Node | 24 LTS | image `node:24-alpine` |
| pnpm | via `corepack` | jamais installé globalement |
| Turborepo | 2.10.13 | |
| Next.js | 16.3.5 | App Router, sortie `standalone` |
| NestJS | 12.0.3 | |
| React | 19.3.0 | |
| Prisma, @prisma/client | 7.10.0 | la 8.0 est en RC — écartée |
| @prisma/adapter-pg | 7.10.0 | Prisma 7 exige un adaptateur de pilote |
| pg | 8.23.0 | pilote PostgreSQL sous l'adaptateur |
| zod | 4.6.5 | `@clemperl/core` |
| TypeScript | 6.0.3 | **repli appliqué** — la 7.0.2 est refusée par l'outillage, voir §10 |
| Tailwind CSS | 4.3.3 | configuration en CSS, pas de fichier JS |
| ESLint | 10.10.0 | configuration plate |
| Prettier | 3.9.7 | |
| Vitest | 5.0.1 | fronts Next et packages |
| Jest | 30.5.1 | `apps/api` uniquement |
| @swc/jest | 0.2.39 | transformeur de Jest — voir §10 |
| supertest | 7.2.2 | E2E HTTP de l'API |
| Testcontainers | 12.1.0 | base jetable des tests d'intégration |
| Playwright | 1.63.0 | |
| next-intl | 4.14.5 | |
| PostgreSQL | 17-alpine | |
| Redis | 7-alpine | |

Les packages sont traités selon leur consommateur, et non uniformément.

`@clemperl/ui` et `@clemperl/i18n` restent du TypeScript brut, sans étape de
compilation : seules les applications Next les consomment, et elles les
transpilent par `transpilePackages`. Moins d'outillage, `turbo dev` instantané.

`@clemperl/core` et `@clemperl/db` sont **compilés** et exposent `dist/`. Ils sont
consommés par `apps/api`, qui compile avec `tsc` puis exécute du JavaScript sur
Node : un import pointant vers un `.ts` y échoue au démarrage du binaire, pas à la
compilation. Turbo ordonne les builds par `dependsOn: ["^build"]`.

Les imports relatifs des packages internes portent une extension explicite
(`./utils/index.js`), exigence de la résolution `nodenext` utilisée par l'API.

---

## 5. Docker et environnement de développement

### 5.1 Stratégie de build

Chaque application possède son propre `Dockerfile` multi-stage. **Aucune image
n'est déclarée directement dans le `docker-compose` pour nos applications** —
seuls Postgres et Redis utilisent les images officielles amont, qu'il n'y aurait
aucun intérêt à reconstruire.

Le `Dockerfile` expose deux cibles :

- **`dev`** — monorepo complet, dépendances installées dans le conteneur,
  `pnpm dev` en watch. Utilisée par le compose de développement.
- **`runner`** — issue de `turbo prune --docker`, qui isole le sous-graphe de
  dépendances de l'application avant l'installation. L'image finale ne contient
  que le code de cette application et ses dépendances réelles.

**Un `.dockerignore` à la racine est obligatoire.** Le contexte de build étant la racine
du dépôt, c'est le seul que Docker lit : un `.dockerignore` placé dans `apps/storefront/`
est ignoré. Sans lui, chaque build transfère au démon l'intégralité du dépôt — les
`node_modules`, `.git`, les trois autres applications. La taille du contexte est à mesurer
au premier build, avec et sans le fichier, et le chiffre à consigner.

Le gain de `turbo prune` est double : des images de l'ordre de 180 Mo au lieu de
900 Mo, et un cache Docker qui ne s'invalide que lorsque l'application ou ses
dépendances changent réellement — et non à chaque commit dans n'importe quelle
autre application.

Patron du stage `runner` pour une application Next :

```dockerfile
FROM node:24-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune @clemperl/storefront --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@clemperl/storefront

FROM base AS runner
WORKDIR /app
USER node
COPY --from=installer /app/apps/storefront/.next/standalone ./
COPY --from=installer /app/apps/storefront/.next/static ./apps/storefront/.next/static
CMD ["node", "apps/storefront/server.js"]
```

L'application NestJS suit le même patron, avec une sortie `dist/` au lieu de
`.next/standalone`.

Son arborescence applique dès T0 la structure de module attendue — le seul fichier à la
racine d'un dossier module est son `.module.ts`, et la racine du module ne porte pas
d'`index.ts` :

```
apps/api/src/
├── main.ts
├── app.module.ts
└── modules/
    └── health/
        ├── health.module.ts
        └── controllers/
            ├── health.controller.ts
            └── index.ts
```

### 5.2 Développement : tout en conteneur

Le développement quotidien se fait intégralement dans Docker. Deux contraintes
en découlent, spécifiques à cet environnement (WSL2), et traitées dès T0 :

1. **Seuls les dossiers de sources sont montés**, jamais la racine d'un package.
   Monter le répertoire de travail masquerait les dépendances installées dans le
   conteneur, et les binaires natifs — moteurs Prisma, puis sharp en T2 — seraient
   ceux de l'hôte, compilés pour une autre bibliothèque C. Un volume nommé sur
   `node_modules` résoudrait aussi le problème, mais il n'est peuplé qu'à sa
   création : ajouter une dépendance imposerait de le détruire, et l'oublier
   produit une erreur de module introuvable sans rapport apparent avec la cause.
   Contrepartie assumée du montage par dossier : modifier un `package.json` impose
   `pnpm docker:up --build`.
2. **Repli `WATCHPACK_POLLING=true` documenté** dans `.env.example`, commenté
   par défaut. Le code vivant sur le système de fichiers Linux natif et non sur
   `/mnt/c`, inotify devrait fonctionner ; l'option est là si le watch décroche.

Chaque service déclare un `healthcheck`. Les applications attendent que Postgres
et Redis soient sains (`depends_on: condition: service_healthy`) avant de
démarrer, ce qui évite les échecs de connexion au premier lancement.

### 5.3 Accès réseau, domaines et TLS en développement

Trois exigences se combinent ici : les trois fronts doivent partager un cookie de
session sur un domaine parent (T1), l'environnement doit être joignable depuis un
**smartphone du réseau local** pour tester la réactivité de l'interface, et le
tout doit être en HTTPS — un cookie de session marqué `Secure` ne se teste pas en
clair.

#### Exposition sur le réseau local

Docker Desktop est le moteur utilisé (contexte `desktop-linux`, vérifié le
2026-09-17). Il publie les ports des conteneurs **côté Windows sur `0.0.0.0`**,
et non sur l'adresse NAT de WSL2. Le port 443 de nginx est donc directement
joignable depuis n'importe quel appareil du réseau local, sans `.wslconfig`,
sans réseau en miroir et sans `netsh portproxy`.

Deux conséquences :

- Cela ne vaut que pour les ports **publiés par Docker**. Un processus lancé
  directement dans WSL, hors conteneur, resterait injoignable depuis le réseau.
  Le choix du tout-conteneur (§5.2) rend ce cas sans objet.
- Windows demande l'autorisation du pare-feu au premier démarrage ; elle doit
  être accordée pour les réseaux privés.

L'adresse utilisée est celle de la machine sur le réseau local. Elle n'a pas
besoin d'être réservée dans le routeur : si le bail DHCP change, il suffit de
mettre `DEV_HOST` à jour dans le fichier d'environnement **et** de relancer
`pnpm dev:certs` — le certificat étant émis pour un nom précis, le seul `.env`
ne suffit pas.

#### Résolution de noms : sslip.io

`*.localhost` est écarté : ce n'est pas un vrai DNS, chaque appareil le résout
vers lui-même. Un smartphone chercherait le storefront sur son propre système.

`sslip.io` est un service DNS public qui résout tout nom contenant une adresse IP
vers cette adresse, y compris avec un préfixe arbitraire. Aucune configuration
DNS, aucun fichier `hosts`, et cela fonctionne depuis n'importe quel appareil du
réseau.

La notation à tirets est retenue (un seul label, donc un unique certificat
wildcard suffit, et elle reste valide si un wildcard `*.sslip.io` était un jour
ajouté à la Public Suffix List) :

| Application | Nom de développement |
|---|---|
| storefront | `192-168-1-42.sslip.io` |
| vendor | `vendeur.192-168-1-42.sslip.io` |
| admin | `admin.192-168-1-42.sslip.io` |
| api | `api.192-168-1-42.sslip.io` |

Vérifié le 2026-09-17 : `sslip.io` **n'est pas** dans la Public Suffix List. Un
cookie posé sur `.192-168-1-42.sslip.io` est donc bien partagé par les trois
fronts — ce qui est précisément ce que T1 exige, et ce que ce choix doit garantir.

L'adresse n'est écrite qu'à un seul endroit, la variable `DEV_HOST`. Toutes les
URL en dérivent, et un futur basculement vers un vrai domaine
(`*.dev.clemperl.com`) ne coûte que le changement de cette variable et la
régénération du certificat.

#### Terminaison TLS : nginx et mkcert

Un reverse proxy **nginx** devient le point d'entrée unique en 443 et route par
nom d'hôte vers les quatre applications. Les ports 3000 à 3003 ne sont plus
publiés : ils restent internes au réseau Docker. L'intérêt dépasse le
développement — c'est la topologie réelle de la production, éprouvée dès T0 au
lieu d'être découverte au déploiement.

Le proxy a son propre `Dockerfile` dans `docker/proxy/`, qui part de l'image
nginx amont et intègre le `configuration nginx` : la règle « une image se construit, elle
ne se déclare pas » s'applique à lui comme aux applications.

**mkcert** (déjà installé, v1.4.4) génère l'autorité locale et un certificat
wildcard couvrant `192-168-1-42.sslip.io` et `*.192-168-1-42.sslip.io`. Un script
`pnpm dev:certs` encapsule la génération pour qu'elle soit reproductible.

Conséquence assumée : le smartphone doit faire confiance à l'autorité mkcert.
Le fichier `rootCA.pem` (localisable via `mkcert -CAROOT`) s'installe une fois
sur l'appareil — sur Android comme autorité utilisateur, que le navigateur
respecte pour la navigation web ; sur iOS via un profil, avec activation
explicite dans Réglages → Général → Informations → Certificats. La procédure est
documentée dans le README, avec la commande servant le fichier sur le réseau
local pour le récupérer depuis le téléphone.

### 5.4 Environnement

Les valeurs vivent dans des fichiers d'environnement, jamais en dur dans le code
ni dans le `docker-compose` :

| Fichier | Versionné | Usage |
|---|---|---|
| `.env.example` | oui | Modèle documenté, valeurs factices. Référence de ce qui existe. |
| `.env` | non | Développement local. Lu par défaut par `docker compose`. |
| `.env.prod` | non | Production, via `docker compose --env-file .env.prod`. |

Le `.gitignore` ignore `.env*` en ne conservant que `.env.example`, afin qu'un
nouveau fichier d'environnement soit exclu par défaut plutôt qu'à la main.

Le `.env.example` documente chaque variable. Les variables
consommées pendant les builds sont déclarées dans `globalEnv` de `turbo.json` —
faute de quoi le cache Turbo sert des artefacts construits avec d'anciennes
valeurs, ce qui produit des bugs particulièrement difficiles à diagnostiquer.

Chaque application valide son environnement **au démarrage** via un schéma Zod
exposé par `@clemperl/core/env` : une variable absente ou malformée fait échouer
le boot avec un message explicite, plutôt qu'un `undefined` qui se propage.

Variables de T0 :

```
NODE_ENV
DATABASE_URL
REDIS_URL

# Adresse locale réservée de la machine, notation à tirets.
# Unique source de vérité : toutes les URL ci-dessous en dérivent.
DEV_HOST=192-168-1-42.sslip.io

NEXT_PUBLIC_STOREFRONT_URL=https://${DEV_HOST}
NEXT_PUBLIC_VENDOR_URL=https://vendeur.${DEV_HOST}
NEXT_PUBLIC_ADMIN_URL=https://admin.${DEV_HOST}
NEXT_PUBLIC_API_URL=https://api.${DEV_HOST}

# WATCHPACK_POLLING=true   # décommenter si le hot reload ne réagit pas
```

---

## 6. Base de données

Prisma vit dans `@clemperl/db`. Le client généré atterrit dans
`packages/db/generated/`, qui n'est pas versionné : il se reconstruit par
`prisma generate`. Les migrations sont versionnées via `prisma migrate` ; `db push` est réservé au prototypage local et n'est jamais
employé sur une base partagée.

Conventions posées dès T0, parce qu'elles sont coûteuses à changer ensuite :

- Identifiants **cuid2** — non devinables, triables, sûrs à exposer dans une URL
- **camelCase** en TypeScript, **snake_case** en base, via `@map` / `@@map`
> **Renversé par T1b le 2026-09-19** : les tables sont désormais au **pluriel**
> (`users`, `vendor_applications`), les types enum restant au singulier. Les deux
> migrations de T0 ont été régénérées en une seule. Voir
> `2026-09-19-t1b-vendeurs-design.md`, section 4.

- Noms de tables au **singulier** (`user`, `product_variant`), toutes dans le schéma
  `public` : pas de schémas par domaine
- `createdAt` et `updatedAt` sur toutes les tables
- Suppression logique (`deletedAt`) sur les entités que l'admin devra pouvoir
  restaurer — vendeurs, produits, commandes. Appliquée dès qu'elles existent.
- Les montants sont stockés en **entier** (unité mineure) accompagnés d'une
  colonne devise. Jamais de `Float`, jamais de `Decimal` pour un prix.

Schéma initial de T0, réduit au strict nécessaire pour prouver que migration,
génération du client et seed fonctionnent de bout en bout :

Prisma 7 a retiré le moteur natif du chemin SQL : la `datasource` ne porte plus d'URL.
Celle de Migrate vit dans `packages/db/prisma.config.ts`, et le client reçoit un
adaptateur `@prisma/adapter-pg` construit avec la chaîne de connexion.

```prisma
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
  id        String    @id @default(cuid(2))
  email     String    @unique
  name      String?
  role      E_USER_ROLE @default(CUSTOMER)
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  @@map("user")
}
```

T1a remplace ce modèle par celui que génère Better Auth (`user`, `session`,
`account`, `verification`) et retire la valeur `VENDOR` de l'énumération : être
vendeur y devient une relation, pas une colonne. Le seed crée un compte
administrateur de test.

---

## 7. Internationalisation

`next-intl`, avec `fr` en locale par défaut et `en` en seconde locale.

Le storefront utilise un préfixe d'URL `as-needed` : le français reste sur
`/produits/...` et l'anglais passe par `/en/produits/...`. C'est le meilleur
compromis SEO pour un marché principalement francophone.

L'administration et l'espace vendeur sont câblés sur la même infrastructure mais
livrés en français seul : la traduction d'un back-office interne n'apporte rien
tant qu'aucun utilisateur non francophone ne l'emploie.

Aucune chaîne de caractères visible par l'utilisateur n'est écrite en dur dans
un composant, dès T0. C'est une habitude qui ne se rattrape pas.

---

## 8. Qualité, tests et intégration continue

**Tests.** Deux exécuteurs, une frontière nette. **Jest** dans `apps/api` : c'est
l'exécuteur par défaut de NestJS, et les conventions de test du dépôt — pyramide à quatre
couches, quatre configurations, cliquet de couverture — sont écrites pour lui, pièges
compris. **Vitest** partout ailleurs, sur les trois fronts Next et les packages, où il
demande nettement moins de configuration avec React 19 et où les tests de packages
tournent en millisecondes. Testing Library pour les composants, Playwright pour les
parcours navigateur.

La frontière suit une application entière, jamais un dossier : aucun répertoire ne
mélange les deux.

En T0 les tests restent un harnais : un test unitaire sur les helpers `Money`
(qui a une vraie valeur — l'arithmétique multi-devises est un nid à erreurs), un
test de rendu sur un composant `ui`, et un smoke test Playwright vérifiant que
chaque front répond et affiche son écran d'accueil.

**Discipline.** TypeScript `strict` avec `noUncheckedIndexedAccess`. Hooks de
pré-commit exécutant lint et typecheck sur les fichiers modifiés. Conventional
Commits.

Les tests sont **colocalisés** avec le fichier qu'ils couvrent. L'encombrement visuel se
règle dans l'éditeur : `.vscode/settings.json`, versionné, active le *file nesting* pour
replier chaque `.spec.ts` sous son fichier source. Sans ce réglage, la colocation est
vécue comme du bruit et finit contournée.

**Dépôt public.** Le dépôt est public sur GitHub dès le premier commit. Ce choix
donne des exécutions GitHub Actions gratuites et illimitées — indispensable, la
construction de quatre images Docker et la suite Playwright à chaque proposition
de modification épuiseraient rapidement le quota d'un dépôt privé.

Il impose en retour trois garde-fous, mis en place en T0 et non après :

1. **Push Protection** et **Secret Scanning** activés sur le dépôt (par défaut
   sur les dépôts publics, à vérifier explicitement)
2. **`gitleaks` en pré-commit** — le scan côté GitHub intervient après coup, le
   pré-commit empêche le secret d'entrer dans l'historique
3. **Aucun fichier `.env` versionné**, jamais ; seul `.env.example` l'est, avec
   des valeurs factices

La raison d'être de ces garde-fous est que l'historique git est définitif : un
secret commité puis « supprimé » reste lisible dans l'historique public. Le
seul remède est de ne jamais l'y mettre.

**Intégration continue.** GitHub Actions, avec les tâches suivantes :

1. `lint` — ESLint et Prettier
2. `typecheck` — `tsc --noEmit` sur tout l'espace de travail
3. `test` — Jest sur l'API, Vitest ailleurs, orchestrés par Turbo
4. `build` — `turbo run build`
5. `docker` — construction en matrice des quatre images, cible `runner`
6. `e2e` — Playwright contre le compose

Le cache Turborepo est partagé entre les exécutions pour éviter de reconstruire
ce qui n'a pas changé.

---

## 9. Critères d'acceptation

T0 est terminée quand, et seulement quand, ces sept points sont vérifiés :

1. `pnpm docker:up` démarre Postgres, Redis et les quatre applications ;
   tous les healthchecks passent au vert
2. Les quatre applications répondent en HTTPS derrière nginx sur leurs noms de
   développement, certificat mkcert accepté ; aucun port applicatif n'est publié
3. `docker build` de chaque application produit **isolément** une image `runner`
   fonctionnelle, sans dépendre d'un build préalable hors Docker
4. La migration initiale et le seed s'exécutent ; un compte administrateur de
   test existe en base
5. Un même composant `@clemperl/ui` s'affiche à l'identique dans les trois
   fronts
6. Le storefront bascule entre français et anglais
7. `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm test:e2e` passent en
   local **et** en intégration continue
8. Le storefront s'affiche correctement **depuis un smartphone du réseau local**,
   autorité mkcert installée, sans avertissement de sécurité

---

## 10. Risques

| Risque | Impact | Traitement |
|---|---|---|
| ~~Auth.js v5 toujours en beta~~ | — | **Réalisé et traité.** Relevé le 2026-09-18 : toujours `5.0.0-beta.32`, trois préversions en neuf mois. La bascule vers Better Auth 1.7.5 stable a été décidée en T1a, avant qu'une seule session n'existe en base |
| **TypeScript 7 rejeté par l'outillage** | Blocage | **Avéré deux fois, vérifié le 2026-09-17 sur le registre npm** : `ts-jest` 29.4.12 exige `typescript >=4.3 <7`, et `typescript-eslint` 8.70.0 — version la plus haute publiée, sans v9 ni v10 — exige `>=4.8.4 <6.1.0`. Le repli prévu est **appliqué** : TypeScript **6.0.3**, plus haute stable compatible. `pnpm peers check` ne signale plus aucun conflit. À réévaluer quand `typescript-eslint` acceptera la 7 |
| **`@swc/jest` ne vérifie pas les types** | Une erreur de typage ne fait pas échouer la suite de tests | Le job `typecheck` (`tsc --noEmit`) est un job de CI distinct et bloquant ; la vérification n'est pas perdue, elle est déplacée |
| **Hot reload en conteneur sous WSL2** | Confort de développement dégradé | Volumes nommés pour `node_modules` et `.next` ; repli `WATCHPACK_POLLING` documenté |
| **Logique métier dupliquée entre Next et Nest** | Divergence silencieuse des règles | `@clemperl/domain` créé dès T1 ; règle de dépendance explicite |
| **Prisma 8 en RC** | Migration ultérieure à prévoir | Rester en 7.10.0, versions épinglées |
| **Dockerfiles `turbo prune` plus denses** | Coût d'entrée à la lecture | Patron identique pour les quatre applications, commenté ; écrit une seule fois |
| **Adresse locale variable (DHCP)** | Les URL et le certificat cessent de fonctionner | Mineur : mettre `DEV_HOST` à jour et relancer `pnpm dev:certs`. Réservation d'adresse dans le routeur possible mais non requise. |
| **Autorité mkcert à installer sur le mobile** | Friction au premier test, à refaire par appareil | Procédure documentée dans le README ; basculement ultérieur vers un vrai domaine et un certificat publiquement valide possible sans changer l'architecture |
| **Dépendance à un service DNS tiers (sslip.io)** | Développement interrompu si le service disparaît | Repli documenté : entrées `hosts` sur la machine et bascule vers un vrai domaine, pilotées par la seule variable `DEV_HOST` |
| **Dépôt public dès le premier commit** | Un secret commité reste dans l'historique | Push Protection, Secret Scanning et `gitleaks` en pré-commit, en place dès T0 |

---

## 11. Tranches suivantes

T0 → T3 se suivent nécessairement, chaque tranche s'appuyant sur la précédente.
T4, T5 et T6 sont permutables selon les priorités.

| # | Tranche | Livrable vérifiable |
|---|---|---|
| **T0** | **Fondations monorepo** | *le présent document* |
| T1 | Identité et comptes | Inscription et connexion client et vendeur, rôles, session partagée entre sous-domaines, validation d'un vendeur par l'administration |
| T2 | Catalogue et médias | Un vendeur publie un produit à variantes avec images optimisées (Supabase Storage → BullMQ → sharp) ; le storefront le liste, le filtre et l'affiche |
| T3 | Panier et commande | Panier multi-vendeurs scindé en sous-commandes par vendeur, adresses, livraison, cycle de statuts |
| T4 | Paiement extensible | Registre d'adapters (carte, mobile money, espèces, paiement à la livraison, hors plateforme), payload brut chiffré, webhooks, réconciliation |
| T5 | Abonnements vendeurs | Offres, souscription, quotas, facturation |
| T6 | Administration | Modération des vendeurs et des produits, taxonomie globale, tableau de bord, litiges |
| T7 | Temps réel et notifications | Socket.IO, courriels transactionnels, messagerie acheteur-vendeur |

Chaque tranche fait l'objet de son propre cycle : design, spécification, plan
d'implémentation, réalisation.
