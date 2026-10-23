# T8a, GraphQL entre dans l'API : plan d'implémentation

> **Pour les agents :** sous-skill requis : superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans, tâche par tâche. Les étapes se cochent
> (`- [ ]`).

**Objectif :** l'API sert un point d'entrée GraphQL, `/graphql`, avec un terrain de jeu en
développement, un fichier de schéma versionné, et une seule requête, `me`, qui rend le compte
connecté et sa boutique.

**Architecture :** `@nestjs/graphql` et le pilote Apollo, schéma décrit par des classes. Le
module `graphql` configure le point d'entrée et filtre les origines ; le résolveur `me` vit
dans le module `auth`, à côté de `GET /me`, et réutilise `SessionGuard`, rendu capable de lire
une requête GraphQL. Le fichier de schéma est produit et vérifié par un test de bout en bout
qui monte l'application entière.

**Pile :** NestJS 12.0.3, `@nestjs/graphql` et `@nestjs/apollo` 14.0.3, `@apollo/server`
5.5.1, `@as-integrations/express5` 1.1.2, `graphql` 16.14.2, Better Auth 1.7.5, Jest.

**Spec :** `docs/superpowers/specs/2026-10-23-t8-mobile-vendeur-design.md`, sections 2, 3
(T8a) et 4. Lire les deux.

## Contraintes globales

- Versions exactes, sans `^` : `@nestjs/graphql@14.0.3`, `@nestjs/apollo@14.0.3`,
  `@apollo/server@5.5.1`, `@as-integrations/express5@1.1.2`, `graphql@16.14.2`.
  `@apollo/server` 5 demande `graphql` `^16.11.0` : pas la 17.
- Le web garde son accès direct à la base. Aucun front n'appelle `/graphql`.
- `/graphql` accepte une requête **sans** en-tête `Origin` ; refuse toute origine présente,
  `null` et chaîne vide compris ; n'admet, hors production, que l'origine de
  `NEXT_PUBLIC_API_URL`, celle du terrain de jeu. Égalité stricte, jamais un préfixe.
- Terrain de jeu (GraphiQL du pilote ; remplacé en cours d'exécution par Apollo Sandbox, à la
  demande du propriétaire, télémétrie coupée) et introspection : allumés si et seulement si
  `NODE_ENV !== "production"`, par un seul prédicat.
- La protection CSRF d'Apollo reste à sa valeur par défaut, active. Ne pas la désactiver.
- Schéma décrit par le code, trié (`sortSchema: true`), tenu en mémoire à l'exécution
  (`autoSchemaFile: true`) ; le fichier versionné est
  `apps/api/src/modules/graphql/schema.gql`, dans `src/` parce que ce dossier est monté dans
  le conteneur de développement et que le fichier doit s'y écrire comme s'y lire.
- Descriptions GraphQL (`description` des types et des champs) en français : un humain les lit
  dans le terrain de jeu. Identifiants, noms de types et de champs en anglais.
- `apps/api` garde 100 % de couverture unitaire (`apps/api/jest.config.ts`).
- Aucun `index.ts` à la racine d'un module (`docs/conventions/nestjs.md`) ; un `index.ts` par
  sous-dossier.
- Pas de tiret quadratin ni demi-cadratin, nulle part (`docs/conventions/redaction.md`).
- Un seul commit pour toute la marche, à la fin, avec la spec et ce plan
  (`docs/conventions/git.md`). Aucune écriture Git sans l'accord du propriétaire, demandé à
  chaque fois ; la branche, `feat/graphql-foundations`, est créée par lui depuis `main` avant
  la tâche 1.

## Points de vigilance

Les cas que la spec implique et qu'aucun test d'une tâche n'éprouverait sans qu'on les nomme.
Chacun a son test dans la tâche indiquée.

1. **Un cookie forgé ou expiré** sur `/graphql` rend `UNAUTHENTICATED`, jamais une erreur
   interne ni des données : tâche 4, e2e.
2. **L'origine `null`**, qu'envoie un document isolé dans une iframe, est refusée comme une
   inconnue : tâche 3, unitaire et e2e.
3. **En production**, l'origine de l'API est refusée et le terrain de jeu comme
   l'introspection sont éteints : tâches 2 et 3, unitaires.
4. **Une boutique supprimée en douceur** (`deletedAt`) ne s'affiche pas : `shop` vaut `null`,
   comme sur le web où `readVendorForMember` la filtre : tâche 4, e2e.
5. **Une requête `POST` en `text/plain` sans origine**, la forme d'une requête forgée qui
   échapperait au contrôle préalable du navigateur, est refusée par Apollo : tâche 4, e2e.

---

### Tâche 1 : `SessionGuard` lit aussi une requête GraphQL

**Fichiers :**
- Modifier : `apps/api/src/modules/auth/guards/session.guard.ts`
- Modifier : `apps/api/src/modules/auth/guards/session.guard.spec.ts`
- Créer : `apps/api/src/modules/auth/interfaces/session-request.interface.ts`, et
  `apps/api/src/modules/auth/interfaces/index.ts`
- Modifier : `apps/api/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`

**Interfaces :**
- Produit : `SessionGuard.canActivate(context)` accepte un contexte `http` ou `graphql`, et
  attache `session` à la requête dans les deux cas.
- Produit : `interface ISessionRequest { session: { user: { id: string; email: string; name: string } } }`.

- [ ] **Étape 1 : installer les dépendances**

```bash
pnpm --filter @clemperl/api add -E @nestjs/graphql@14.0.3 @nestjs/apollo@14.0.3 \
  @apollo/server@5.5.1 @as-integrations/express5@1.1.2 graphql@16.14.2
```

Attendu : l'installation échoue sur un script bloqué de `@apollo/protobufjs` (un
`postinstall` qui ne sert qu'à sa ligne de commande). L'ajouter à `allowBuilds` de
`pnpm-workspace.yaml` avec `false`, et une ligne au commentaire qui dit pourquoi, puis
relancer. Tout autre script bloqué se tranche de la même façon, après avoir lu ce qu'il fait.

- [ ] **Étape 2 : écrire les tests qui échouent**

Dans `session.guard.spec.ts`, le faux contexte HTTP gagne `getType: () => "http"`, et un
second fabrique un contexte GraphQL : `getType: () => "graphql"`, `getArgs` et
`getArgByIndex` rendant `[{}, {}, { req }, {}]`, la requête Express étant au troisième rang,
et `getClass`, `getHandler`, que `GqlExecutionContext.create` lit aussi.

- `it("accepte une requête GraphQL dont la session est valide, et l'y attache")` : la
  session rendue par `getSession` se retrouve dans `req.session`, et `canActivate` rend `true`.
- `it("refuse une requête GraphQL sans session")` : rejette `UnauthorizedException`.

- [ ] **Étape 3 : vérifier l'échec**

Run : `pnpm --filter @clemperl/api exec jest src/modules/auth/guards`
Attendu : les deux nouveaux cas échouent, les anciens passent.

- [ ] **Étape 4 : implémenter**

Dans `SessionGuard`, une fonction privée qui choisit la requête :
`context.getType<GqlContextType>() === "graphql"` donne
`GqlExecutionContext.create(context).getContext<{ req: ... }>().req`, sinon
`context.switchToHttp().getRequest()`. Le reste du garde ne change pas. Le commentaire dit
pourquoi un seul garde pour deux transports : la règle « une session, demandée à la même
instance Better Auth » reste écrite une fois.

- [ ] **Étape 5 : vérifier**

Run : `pnpm --filter @clemperl/api test`
Attendu : tout passe, couverture 100 %.

---

### Tâche 2 : le point d'entrée GraphQL et la requête `me`

**Fichiers :**
- Créer : `apps/api/src/modules/graphql/graphql.module.ts`
- Créer : `apps/api/src/modules/graphql/utils/graphql-playground.utils.ts`, son `.spec.ts`,
  `utils/index.ts`
- Créer : `apps/api/src/modules/auth/dto/response/account.dto.ts`, `shop.dto.ts`, `me.dto.ts`,
  `dto/response/index.ts`
- Créer : `apps/api/src/modules/auth/resolvers/me.resolver.ts`, son `.spec.ts`,
  `resolvers/index.ts`
- Modifier : `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/app.module.ts`
- Modifier : `docs/conventions/nestjs.md`, `docs/conventions/code.md`

**Interfaces :**
- Consomme : `SessionGuard`, `ISessionRequest` (tâche 1) ;
  `readVendorForMember(prisma, userId)` de `@clemperl/db`.
- Produit : `graphqlPlaygroundEnabled(env: NodeJS.ProcessEnv): boolean`.
- Produit : `class ApiGraphqlModule` ; le nom évite de se confondre avec `GraphQLModule` de
  `@nestjs/graphql`, qu'il configure.
- Produit : le contrat, tel que le schéma trié l'imprimera (descriptions omises ici) :

```graphql
type Account { email: String!  id: ID!  name: String! }
type Me { shop: Shop  user: Account! }
type Query { me: Me! }
type Shop { id: ID!  name: String!  slug: String!  suspended: Boolean! }
```

Les classes : `AccountDto` (`@ObjectType("Account")`), `ShopDto` (`@ObjectType("Shop")`),
`MeDto` (`@ObjectType("Me")`). `Shop.name` vient de `Vendor.shopName`, `Shop.suspended` de
`Vendor.suspendedAt !== null`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`graphql-playground.utils.spec.ts` :
- `it("allume le terrain de jeu hors production")` : `{ NODE_ENV: "development" }` et `{}`
  donnent `true` ;
- `it("l'éteint en production")` : `{ NODE_ENV: "production" }` donne `false`.

`me.resolver.spec.ts`, `@clemperl/db` simulé par `jest.mock` :
- `it("rend le compte, et aucune boutique quand il n'en a pas")` : `readVendorForMember`
  rend `null` ; le résultat vaut exactement
  `{ user: { id: "u1", email: "a@b.test", name: "Awa" }, shop: null }`, et
  `readVendorForMember` a reçu `"u1"` ;
- `it("rend la boutique du compte")` : un vendeur
  `{ id: "v1", shopName: "Atelier", slug: "atelier", suspendedAt: null, ... }` donne
  `shop: { id: "v1", name: "Atelier", slug: "atelier", suspended: false }` ;
- `it("dit qu'une boutique est suspendue")` : `suspendedAt: new Date()` donne
  `suspended: true`.

`toEqual` sur l'objet entier : un champ de plus de la session ne doit pas passer.

- `it("se publie dans le schéma sous les noms du contrat")` : le schéma construit par
  `GraphQLSchemaFactory` (monté par `GraphQLSchemaBuilderModule`) pour `[MeResolver]` a une
  requête `me` de type `Me!`, un `Me.shop` de type `Shop` nullable et un `Me.user` de type
  `Account!`. Ce cas n'est pas décoratif : les fonctions de type des décorateurs,
  `() => MeDto` ou `() => ShopDto`, ne s'exécutent qu'à la construction du schéma, et sans lui
  la couverture des fonctions tombe sous 100 %.

- [ ] **Étape 2 : vérifier l'échec**

Run : `pnpm --filter @clemperl/api exec jest src/modules/graphql src/modules/auth/resolvers`
Attendu : échec, modules introuvables.

- [ ] **Étape 3 : implémenter**

- `graphqlPlaygroundEnabled` : `env["NODE_ENV"] !== "production"`, la même règle que le
  pilote applique par défaut, rendue explicite pour qu'un seul prédicat décide du terrain de
  jeu, de l'introspection et de l'origine admise (tâche 3).
- `ApiGraphqlModule` importe `GraphQLModule.forRoot<ApolloDriverConfig>` avec
  `driver: ApolloDriver`, `path: "/graphql"`, `autoSchemaFile: true`, `sortSchema: true`,
  `graphiql` et `introspection` valant `graphqlPlaygroundEnabled(process.env)`.
- `MeResolver` : `@Resolver(() => MeDto)`, une méthode `me` décorée
  `@Query(() => MeDto, { name: "me", description: ... })` et `@UseGuards(SessionGuard)`, qui
  reçoit la requête par `@Context("req") request: ISessionRequest` et rend
  `Promise<MeDto>`. Il est déclaré dans les `providers` d'`AuthModule`.
- `AppModule` importe `ApiGraphqlModule`.
- Chaque type et chaque champ porte sa `description`, en français.

`docs/conventions/nestjs.md` : l'arborescence gagne `resolvers/`, avec une phrase : un
résolveur est l'entrée GraphQL d'un module comme un contrôleur en est l'entrée REST, et les
types GraphQL sont des DTO de réponse, dans `dto/response/`, nommés `<Nom>Dto` et publiés
sous `<Nom>` par `@ObjectType("<Nom>")`. `docs/conventions/code.md` : la table de nommage
gagne la ligne « Résolveur GraphQL | PascalCase + `Resolver` | `MeResolver` | `apps/api` ».

- [ ] **Étape 4 : vérifier**

Run : `pnpm --filter @clemperl/api test && pnpm --filter @clemperl/api typecheck && pnpm --filter @clemperl/api lint`
Attendu : tout passe, couverture 100 %.

---

### Tâche 3 : `/graphql` filtre les origines

**Fichiers :**
- Créer : `apps/api/src/modules/graphql/utils/graphql-origin.utils.ts` et son `.spec.ts`
- Créer : `apps/api/src/modules/graphql/middlewares/graphql-origin.middleware.ts`, son
  `.spec.ts`, `middlewares/index.ts`
- Créer : `apps/api/src/modules/graphql/constants/graphql.constants.ts`, `constants/index.ts`
- Modifier : `apps/api/src/modules/graphql/graphql.module.ts`, `docs/conventions/nestjs.md`

**Interfaces :**
- Consomme : `graphqlPlaygroundEnabled` (tâche 2), `toOrigin(name, value)` de
  `apps/api/src/modules/payments/utils`.
- Produit : `graphqlOriginAllowed(origin: string | undefined, env: NodeJS.ProcessEnv): boolean`.
- Produit : `ERROR_GRAPHQL_ORIGIN_REFUSED = "GRAPHQL_ORIGIN_REFUSED"`, et
  `class GraphqlOriginMiddleware implements NestMiddleware`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`graphql-origin.utils.spec.ts`, avec `NEXT_PUBLIC_API_URL: "http://localhost:3003"` :
- `it("accepte une requête sans origine, celle du téléphone")` : `undefined` donne `true`, en
  développement comme en production ;
- `it("accepte l'origine du terrain de jeu hors production")` : `"http://localhost:3003"`
  donne `true` en développement ;
- `it("refuse l'origine du terrain de jeu en production")` ;
- `it("refuse l'origine d'un front, qui n'appelle pas GraphQL")` :
  `"http://localhost:3000"` donne `false` ;
- `it("refuse null, une chaîne vide et un préfixe trompeur")` : `"null"`, `""`,
  `"http://localhost:3003.ailleurs.test"` donnent `false` ;
- `it("refuse toute origine quand l'adresse de l'API est absente")` : sans
  `NEXT_PUBLIC_API_URL`, `"http://localhost:3003"` donne `false`, sans lever.

`graphql-origin.middleware.spec.ts` : une origine admise appelle `next()` une fois ; une
origine refusée lève `ForbiddenException` portant `ERROR_GRAPHQL_ORIGIN_REFUSED`, sans
appeler `next()`.

- [ ] **Étape 2 : vérifier l'échec**

Run : `pnpm --filter @clemperl/api exec jest src/modules/graphql`
Attendu : échec, modules introuvables.

- [ ] **Étape 3 : implémenter**

`graphqlOriginAllowed` : une origine absente passe ; une origine présente ne passe que si le
terrain de jeu est allumé et qu'elle vaut exactement `toOrigin("NEXT_PUBLIC_API_URL", ...)`.
Le commentaire dit les deux raisons : React Native n'envoie pas d'origine sur `fetch`, et un
navigateur en envoie toujours une sur un `POST`, donc une requête forgée par un site tiers
porte la sienne.

`ApiGraphqlModule` implémente `NestModule` et applique `GraphqlOriginMiddleware` à la route
`graphql`, toutes méthodes. `docs/conventions/nestjs.md` : l'arborescence gagne
`middlewares/`.

- [ ] **Étape 4 : vérifier**

Run : `pnpm --filter @clemperl/api test && pnpm --filter @clemperl/api typecheck && pnpm --filter @clemperl/api lint`
Attendu : tout passe, couverture 100 %.

---

### Tâche 4 : le schéma versionné, et `/graphql` éprouvé de bout en bout

**Fichiers :**
- Créer : `apps/api/src/modules/graphql/utils/graphql-schema.utils.ts` et son `.spec.ts`
- Créer : `apps/api/src/modules/graphql/schema.gql`, produit par l'étape 5, jamais écrit à la
  main
- Créer : `apps/api/test/helpers/open-session.ts`
- Modifier : `apps/api/test/session.e2e-spec.ts`, qui utilise désormais ce utilitaire
- Créer : `apps/api/test/graphql.e2e-spec.ts`, `apps/api/test/graphql-schema.e2e-spec.ts`
- Modifier : `apps/api/package.json` (script `schema:print`)

**Interfaces :**
- Consomme : tout ce qui précède ; `GraphQLSchemaHost` de `@nestjs/graphql`.
- Produit : `printApiSchema(schema: GraphQLSchema): string`, l'en-tête
  `# Généré par pnpm --filter @clemperl/api schema:print : ne pas modifier à la main.`, une
  ligne vide, puis `printSchema(lexicographicSortSchema(schema))` et un saut de ligne final.
- Produit : `openSession(email: string): Promise<string>`, la fonction `ouvrirSession` de
  `session.e2e-spec.ts` déplacée telle quelle, renommée en anglais.

- [ ] **Étape 1 : écrire les tests qui échouent**

`graphql-schema.utils.spec.ts` : sur un petit schéma construit avec `buildSchema`, deux types
déclarés dans le désordre sortent triés, après l'en-tête, terminés par un saut de ligne.

`graphql.e2e-spec.ts`, l'application montée comme dans `session.e2e-spec.ts`, une boutique
créée par `prisma.vendor.create` avec les champs requis (le modèle de `createShop` dans
`test/realtime.int-spec.ts`) et un `prisma.vendorMember.create` de rôle `OWNER` ; tout ce
qui est créé est supprimé en `afterAll`. Requête `{ me { user { email } shop { name slug suspended } } }` :
- `it("refuse me sans session")` : statut 200, `data` nul,
  `errors[0].extensions.code === "UNAUTHENTICATED"` ;
- `it("refuse un cookie de session fabriqué")` : idem ;
- `it("rend le compte sans boutique")` : `data.me.user.email` vaut l'adresse, `shop` est nul ;
- `it("rend la boutique du membre")` : `name`, `slug`, `suspended: false` ;
- `it("dit qu'une boutique est suspendue")` : `suspendedAt` posé, `suspended: true` ;
- `it("ne montre pas une boutique supprimée")` : `deletedAt` posé, `shop` nul ;
- `it("refuse un site tiers, l'origine null et un front")` : `Origin` à
  `https://ailleurs.test`, `null`, puis la valeur de `NEXT_PUBLIC_STOREFRONT_URL` : 403 ;
- `it("accepte le terrain de jeu en développement")` : `Origin` à la valeur de
  `NEXT_PUBLIC_API_URL`, avec la session : 200 et des données ;
- `it("refuse une requête text/plain, que le navigateur enverrait sans contrôle préalable")` :
  sans origine, `Content-Type: text/plain` : 400.

`graphql-schema.e2e-spec.ts` : monte l'application, imprime
`printApiSchema(app.get(GraphQLSchemaHost).schema)`, dans un seul
`it("le fichier de schéma versionné est celui que le code produit")`. Si
`process.env["UPDATE_SCHEMA"] === "1"`, il écrit `src/modules/graphql/schema.gql` ; sinon il
compare au contenu du fichier, avec un message d'échec qui nomme
`pnpm --filter @clemperl/api schema:print`. Un seul `it` dans les deux modes : Jest refuse un
fichier de test qui n'en compte aucun.

- [ ] **Étape 2 : vérifier l'échec**

Le conteneur de l'API doit d'abord avoir les nouvelles dépendances : `pnpm docker:up`
(`docs/conventions/monorepo.md`).

Run : `pnpm --filter @clemperl/api exec jest src/modules/graphql/utils` puis
`docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.e2e.ts --runInBand"`
Attendu : l'utilitaire échoue, introuvable ; les deux fichiers e2e de GraphQL échouent,
`openSession` et le fichier de schéma étant absents ; `session.e2e-spec.ts` passe encore.

- [ ] **Étape 3 : implémenter `printApiSchema` et `openSession`**

Puis `session.e2e-spec.ts` importe `openSession` au lieu de sa copie locale.

- [ ] **Étape 4 : ajouter le script**

`apps/api/package.json` : `"schema:print": "UPDATE_SCHEMA=1 jest --config jest.config.e2e.ts --runInBand test/graphql-schema.e2e-spec.ts"`.

- [ ] **Étape 5 : produire le fichier**

Run : `docker exec clemperl_dev_api sh -c "cd apps/api && pnpm schema:print"`
Attendu : `apps/api/src/modules/graphql/schema.gql` apparaît côté hôte, avec les quatre types
de la tâche 2 et leurs descriptions.

- [ ] **Étape 6 : vérifier**

Run : `pnpm --filter @clemperl/api test`, puis la couche e2e dans le conteneur, comme à
l'étape 2.
Attendu : tout passe. Pour prouver le test du schéma, ajouter un espace en fin de fichier :
il échoue avec le nom du script ; retirer l'espace : il repasse.

---

### Tâche 5 : le guide, la passation, la preuve du propriétaire

**Fichiers :**
- Créer : `docs/graphql.md`
- Modifier : `CLAUDE.md`, `docs/passation.md`, `docs/pieges.md` s'il y a lieu

- [ ] **Étape 1 : écrire `docs/graphql.md`**

Portée en tête (`apps/api` et, à venir, l'application mobile). Les notions de T8a, chacune
avec le fichier qui la montre :
- GraphQL et REST dans ce dépôt : pourquoi le téléphone passe par GraphQL et le web non ;
- le schéma, un type, un champ, `!` et `null` : `schema.gql`, `me.dto.ts` ;
- une requête et son résolveur : `me.resolver.ts` ;
- le contexte, et la session qu'y dépose `SessionGuard` ;
- le terrain de jeu : où l'ouvrir, s'y connecter par la boutique web, taper `me` ;
- le fichier de schéma, `schema:print`, et le test qui le garde ;
- une erreur GraphQL : `UNAUTHENTICATED`, et pourquoi le statut HTTP reste 200.

Pas de tiret quadratin. `docs/conventions/explanations.md` dit comment expliquer un
mécanisme : le lire avant.

- [ ] **Étape 2 : `CLAUDE.md`**

Une ligne dans le tableau « Lire le bon document en premier » : « Toucher au GraphQL de
l'API ou à l'application mobile » renvoie au design T8 et à `docs/graphql.md`.

- [ ] **Étape 3 : `docs/passation.md`**

Le tableau : T7 **Livrée**, PR #18 ; T8 « T8a exécutée, T8b à T8f à venir ». La section T7
cesse de dire « en pull request » et « Reprendre : pousser les corrections ». Une section
« Où en est T8 » : les six marches, ce que T8a livre, ce qu'elle n'a pas établi, comment
reprendre. Rien qui décrive un poste particulier.

- [ ] **Étape 4 : vérifier tout**

Run : `pnpm turbo run lint typecheck test`, puis la couche e2e de l'API dans le conteneur, puis
`grep -rn "—\|–" docs/graphql.md docs/passation.md docs/superpowers/specs/2026-10-23-t8-mobile-vendeur-design.md apps/api/src/modules/graphql apps/api/src/modules/auth`
Attendu : tout passe, aucun tiret. Ce plan est hors de la recherche : il porte la commande
elle-même.

- [ ] **Étape 5 : la preuve du propriétaire**

Le propriétaire se connecte sur la boutique web avec son compte vendeur, ouvre
`NEXT_PUBLIC_API_URL` suivi de `/graphql`, tape `{ me { user { email } shop { name } } }` et
lit son compte et sa boutique ; déconnecté, la même requête rend `UNAUTHENTICATED`. Ce qu'il a
vu entre dans la passation.

- [ ] **Étape 6 : le commit, avec son accord**

Demander au propriétaire : le commit unique de la marche, avec la spec et ce plan, message en
anglais sans signature d'attribution ; puis, sur nouvel accord, le push et la pull request,
corps de moins de 1500 caractères (`wc -m`), rien de local dedans.
