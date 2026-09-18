# Tests

## Pyramide de tests

**Portée : `apps/api`.** Les quatre couches supposent supertest, une base réelle et un client externe — rien de tout cela n'existe sur les fronts Next.

Une API backend a quatre couches. Le « E2E » ici est **HTTP**, pas navigateur.

```
            ╱  E2E API (supertest)        ╲   ~10 %  parcours critiques bout-en-bout
           ╱   Integration (DB réelle)      ╲  ~25 %  services + repositories + DB
          ╱     Contract / External           ╲ ~5 %  services tiers (HTTP figé)
         ╱________ Unit (purs, mockés)__________╲ ~60 % mappers, utils, parsers, logique
```

| Couche          | Frontière testée                       | I/O réel ?                    | Vitesse |
| --------------- | -------------------------------------- | ----------------------------- | ------- |
| **Unit**        | une classe / fonction isolée           | ❌ tout mocké                 | ⚡⚡⚡  |
| **Integration** | service + repository + DB              | ✅ base réelle (jetable)      | ⚡      |
| **Contract**    | client externe vs réponses figées      | ⚠️ HTTP intercepté            | ⚡⚡    |
| **E2E API**     | l'app complète + le pipeline global    | ✅ DB réelle, externes mockés | 🐢      |

### Nommage et emplacement

| Type        | Suffixe             | Emplacement | Config                       | Script                     |
| ----------- | ------------------- | ----------- | ---------------------------- | -------------------------- |
| Unit        | `.spec.ts`          | colocalisé  | `jest.config.ts`             | `npm test`                 |
| Integration | `.int-spec.ts`      | colocalisé  | `jest.config.integration.ts` | `npm run test:integration` |
| Contract    | `.contract-spec.ts` | colocalisé  | `jest.config.contract.ts`    | `npm run test:contract`    |
| E2E API     | `.e2e-spec.ts`      | `test/`     | `jest.config.e2e.ts`         | `npm run test:e2e`         |

Les quatre configurations sont à la racine de l'application. **Aucune clé `jest` dans
`package.json`**, aucun fichier de config ailleurs : un seul endroit où chercher.

Les suffixes s'excluent mutuellement par construction — `*.spec.ts` ne peut pas attraper
`*.int-spec.ts` — donc rien n'est exécuté deux fois et chaque couche a son compte de
tests exact.

### Pourquoi quatre configurations et pas une

**Les tests unitaires doivent rester rapides et tourner sur chaque push.** Les mettre
dans le même run que des conteneurs et une app bootée les rend lents, donc on les lance
moins, donc ils cessent de servir.

**La couche contrat a sa PROPRE configuration, distincte de l'intégration.** Ce n'est pas
de l'esthétique : la bibliothèque qui intercepte le HTTP sortant monkey-patche le module
`http` **pour tout le processus**, et Testcontainers parle au démon Docker sur une
connexion HTTP-sur-socket. Les faire cohabiter dans un même processus Jest casse la
connexion Docker, avec une erreur qui n'évoque en rien la cause. Les deux couches ne
doivent jamais partager un run.

**Les suites lourdes tournent en `--runInBand`.** Un conteneur de base de données est
partagé par le run ; le parallélisme change l'isolation et les modes de défaillance.

## Colocation + file nesting

**Portée : tout le dépôt.** Les suffixes `.int-spec.ts` et `.contract-spec.ts` n'apparaissent toutefois que dans `apps/api`.

Les tests unitaires, d'intégration et de contrat sont **colocalisés** :
`order.service.spec.ts` vit **à côté** de `order.service.ts`, dans le même dossier-type
(`services/`, `repositories/`…). Seul l'E2E est centralisé dans `test/`, parce qu'il ne
teste aucun fichier en particulier.

**Un sous-dossier `__tests__` a été délibérément écarté.** La colocation garde le test
solidaire de son fichier — impossible de l'orpheliner lors d'un déplacement ou d'un
refactor — et rend visible d'un coup d'œil si un fichier est couvert. Un dossier de tests
séparé répond « peut-être, va voir » à cette question.

L'encombrement visuel se règle dans l'éditeur, pas dans l'arborescence : le **file
nesting** replie automatiquement le `.spec.ts` sous son `.ts`.

```jsonc
// .vscode/settings.json — versionné
"explorer.fileNesting.enabled": true,
"explorer.fileNesting.patterns": {
    "*.ts": "${capture}.spec.ts, ${capture}.int-spec.ts, ${capture}.contract-spec.ts"
}
```

La phrase à retenir s'il faut défendre le choix : un dossier de tests séparé est une
arborescence à maintenir en double, et elle diverge à la première réorganisation.
Personne ne déplace un test parce qu'il a déplacé le fichier testé.

## Un test à chaque changement

**Portée : tout le dépôt.** La ligne Unit vaut partout ; Integration, Contract et E2E API ne concernent que `apps/api`.

Toute nouvelle fonction, classe ou modification de code existant **est accompagnée d'au
moins un test** dans le même commit ou la même PR.

| Couche                            | Quand l'ajouter                                                    |
| --------------------------------- | ------------------------------------------------------------------ |
| **Unit** (`*.spec.ts`)            | **Toujours** — pour toute logique pure (service, mapper, util, parser) |
| **Integration** (`*.int-spec.ts`) | Dès qu'une requête DB, une transaction ou une contrainte de l'ORM est impliquée |
| **Contract** (`*.contract-spec.ts`) | Dès qu'on parle à un service externe                             |
| **E2E** (`*.e2e-spec.ts`)         | Dès qu'un nouveau endpoint ou un parcours HTTP critique est ajouté |

Règles pratiques :

- Le test est **colocalisé** avec le fichier testé (sauf E2E, centralisé).
- Ne pas merger une PR dont les nouveaux fichiers ne sont pas couverts.
- Un correctif de bug commence par **reproduire le bug en échec**. Un test qui n'a jamais
  échoué ne prouve rien.

La couche E2E ci-dessus désigne les parcours **HTTP de l'API**, joués contre l'application
NestJS. Les parcours **navigateur** des trois fronts Next relèvent de Playwright et vivent
dans son propre dossier : deux outils, deux emplacements, aucun recouvrement.

## Couverture : stratégie « ratchet »

**Portée : tout le dépôt**, avec une configuration par exécuteur.

Sur une base existante peu couverte, un seuil global ambitieux est ignoré dès le premier
jour : soit il bloque tout le monde, soit on le désactive. On fait l'inverse — on
**interdit la régression** et on **monte le plancher** au fil des PR.

### Le principe

- Le seuil global initial vaut la couverture **actuelle**, quelle qu'elle soit.
- Chaque PR doit **maintenir ou augmenter** ce plancher.
- Quand la couverture a monté durablement, on relève le chiffre dans la configuration —
  c'est un cliquet : il ne redescend jamais.
- Sur les zones à risque, on ne négocie pas : seuil élevé **par fichier**, dès que le
  fichier est couvert.

### À quoi ça ressemble en vrai

```typescript
coverageThreshold: {
    // Plancher global : la valeur mesurée, pas la valeur souhaitée.
    global: { statements: 8, branches: 4, functions: 3, lines: 9 },

    // Zones à risque : exigence par fichier, sans rapport avec le plancher global.
    "./src/modules/shared/response-mapping/services/permission-parser.service.ts": {
        statements: 100, lines: 100, functions: 100, branches: 90,
    },
    "./src/modules/shared/translation/utils/map-translation-field.utils.ts": {
        statements: 100, lines: 100, functions: 100, branches: 95,
    },
}
```

Un plancher global à 9 % et du 100 % sur le parseur de permissions ne se contredisent
pas : le chiffre global mesure une dette historique, les entrées par fichier expriment
une exigence. Mélanger les deux dans une seule moyenne détruit l'information.

### Deux choses à savoir avant de l'adopter

**Exclure ce qui n'est pas du code à tester** de `collectCoverageFrom` — modules de
câblage, barrels, entités, point d'entrée, CLI. Les inclure fait chuter le pourcentage
sans qu'aucun test puisse le relever, et un chiffre qu'on ne peut pas faire bouger cesse
d'être un objectif.

**Une entrée par fichier qui ne correspond à rien fait échouer le run** :
`Jest: Coverage data for <chemin> was not found`. Donc renommer ou supprimer un fichier
listé casse la CI tant que l'entrée n'est pas mise à jour. C'est un garde-fou plus qu'une
gêne — ça empêche une exigence de disparaître en silence avec un renommage — mais il faut
le savoir avant de le découvrir sur une PR pressée.

*Preuve de ce dernier point : lu dans la source de Jest installée (`@jest/reporters`, le
message est poussé dans la liste d'erreurs qui fait échouer le run). Preuve sur la
logique, pas sur l'exécution d'une suite complète.*

## Base de test jetable (Testcontainers)

**Portée : `apps/api`.**

### Pourquoi une base réelle et pas un moteur en mémoire

L'application repose sur des contraintes propres au moteur — types énumérés PostgreSQL,
contraintes d'unicité partielles, index, comportement transactionnel. Un substitut en
mémoire ne les reproduit pas. Tester un repository contre autre chose que le vrai moteur
teste le substitut. Donc : un conteneur jetable, démarré par le run.

### Un conteneur par run, pas un par fichier

**Chaque couche lourde démarre UN conteneur, via le `globalSetup` de Jest**, et chaque
fichier de test y crée sa propre **base logique** isolée. Pas un conteneur par fichier.

```typescript
// jest.config.integration.ts
globalSetup: "<rootDir>/test/global-setup-integration.ts",
globalTeardown: "<rootDir>/test/global-teardown-integration.ts",
```

Un helper partagé, paramétré par couche, expose ce dont les tests ont besoin :

- `startTestDb()` / `stopTestDb()` / `truncateAll()` — le cycle de vie usuel ;
- une base isolée avec schéma créé, pour le cas normal ;
- une base isolée vide, pour les rares tests qui jouent les migrations à froid.

> **Chiffres repris d'un dépôt antérieur, NON mesurés sur ClemPerl.**
> Au passage d'un conteneur par fichier à un conteneur par run : 56 conteneurs → 1,
> durée du run ~400 s → ~130-150 s, à nombre de tests identique. Et surtout, une
> instabilité a disparu : les 56 démarrages à froid provoquaient des échecs
> intermittents — une suite apparaissait avec ses tests listés deux fois (le harnais
> réessayait), était rapportée en échec, puis passait relancée seule.
>
> Ces valeurs donnent un ordre de grandeur, elles ne décrivent pas ce dépôt.
> **À remplacer par une mesure réelle dès que la couche d'intégration tourne ici**,
> sinon elles contreviennent à la règle « les chiffres sont mesurés, jamais estimés ».

### Trois règles qui en découlent

1. **Il ne doit exister que deux endroits qui démarrent un conteneur** : les deux
   `globalSetup`. Un `new PostgreSqlContainer` dans un fichier de test est une régression,
   pas une commodité locale — utiliser les helpers.
2. **Ne jamais lancer deux suites lourdes en même temps** sur la même machine (ni deux
   sessions d'agent en parallèle). Elles s'affament mutuellement, et ça ne ressemble pas
   à un timeout propre : ce sont des échecs fantômes dans des suites sans rapport avec le
   changement, ou une défaillance de masse où l'app de test ne se monte jamais et où
   chaque suite meurt dans son `afterAll`. Ça se lit exactement comme une régression de
   démarrage. Avant de croire un échec de masse, relancer UNE suite seule : si elle
   passe, c'était de la contention.
3. **Pendant un chantier, ne lancer que les tests des fichiers touchés** ; la suite
   complète avant le commit.

### Cycle de vie d'un fichier

- `beforeAll` : base isolée + source de données (une fois par fichier).
- `afterEach` : `TRUNCATE ... RESTART IDENTITY CASCADE` sur toutes les tables — rapide, et
  déterministe contrairement à un nettoyage sélectif qu'on oublie de mettre à jour.
- `afterAll` : fermeture de la source de données.

## Ce que ça donne dans ClemPerl

`apps/api` utilise **Jest** : tout ce qui précède s'applique à la lettre, aux scripts près
— `pnpm run test:integration` plutôt que `npm run test:integration`.

Les trois fronts Next et les packages utilisent **Vitest**, où aucune des quatre couches
ci-dessus n'a de sens : pas de conteneur de base, pas de client externe, pas de supertest.
Le cliquet de couverture s'y applique en revanche à l'identique, avec une configuration de
forme différente — les seuils sous `test.coverage.thresholds` dans `vitest.config.ts`,
l'exclusion sous `test.coverage.exclude` plutôt que `collectCoverageFrom`.

Le garde-fou de l'entrée de seuil orpheline est un comportement propre à Jest.
**Vérifié à l'exécution le 2026-09-18 : Vitest ne l'a pas.** Une entrée de seuil
désignant un fichier inexistant laisse le run passer sans rien signaler, donc une
exigence par fichier peut disparaître avec un simple renommage.

Le garde-fou est reconstitué par `scripts/verifier-seuils-par-fichier.mjs`, appelé en
intégration continue après la tâche `test`. Il échoue en nommant le fichier absent et
la configuration fautive.

**Sous Vitest, `coverage.include` est obligatoire.** Sans lui, le fournisseur v8 ne
mesure que les fichiers effectivement chargés par un test : un fichier source jamais
importé n'entre pas dans le rapport, et le plancher ne le voit pas. C'est précisément
le cas d'un nouveau fichier livré sans test — le seul que le cliquet doit attraper.
Mesuré sur `@clemperl/core` : 100 % sans `include`, 46 % avec.
