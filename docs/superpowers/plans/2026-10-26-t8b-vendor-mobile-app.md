# T8b, l'application naît : plan d'implémentation

> **Pour les agents :** sous-skill requis : superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans, tâche par tâche. Les étapes se cochent
> (`- [ ]`).

**Objectif :** l'application vendeur existe dans `apps/vendor-mobile`, tourne dans Expo Go sur
l'iPhone du propriétaire, s'y connecte avec le compte du web, affiche le nom de la boutique
par la requête GraphQL `me`, et se déconnecte.

**Architecture :** une application Expo SDK 58 avec Expo Router, dans le monorepo, qui
n'importe aucun paquet serveur. La connexion passe par le gestionnaire Better Auth de la
boutique, rendu capable de servir le téléphone par le module `@better-auth/expo` ; la session
vit dans le stockage sécurisé du téléphone et accompagne chaque requête vers `/graphql` en
en-tête `Cookie`. Les types du client sont générés depuis le fichier de schéma de T8a.

**Pile :** Expo SDK 58 (`expo` 58.0.17, React Native 0.88.0, React 19.3.0, Expo Router
58.0.25), `@better-auth/expo` 1.7.5 et `better-auth` 1.7.5, `@apollo/client` 4.3.5,
`graphql` 16.14.2, `@graphql-codegen/cli` 7.4.6 et `@graphql-codegen/client-preset` 6.2.3,
`jest-expo` 58.0.12, `@testing-library/react-native` 14.1.0.

**Spec :** `docs/superpowers/specs/2026-10-23-t8-mobile-vendeur-design.md`, sections 2, 3
(T8b), 4, 7 et 8. Lire aussi `docs/graphql.md`, `docs/conventions/monorepo.md` et
`docs/conventions/code.md` avant la tâche 2.

## Contraintes globales

- L'application n'importe **aucun** paquet du monorepo, sauf les catalogues JSON de
  `packages/i18n`. Ni `@clemperl/db`, ni `domain`, ni `core`, ni `auth`.
- Expo Go n'accepte que le SDK le plus récent : **58**. Versions exactes, sans `^` ni `~`,
  celles que `expo install` choisit pour ce SDK : `expo-router` 58.0.25, `expo-secure-store`
  58.0.2, `expo-localization` 58.0.5, `expo-linking` 58.0.14, `expo-constants` 58.0.13,
  `expo-web-browser` 58.0.6, `expo-network` 58.0.4, `expo-status-bar` 58.0.4,
  `react-native-safe-area-context` 5.10.1, `react-native-screens` 4.30.0.
- React reste à **19.3.0**, la version des fronts : un seul React dans le monorepo.
- Le schéma d'adresse de l'application est **`clemperl-vendor`**, écrit à deux endroits que deux
  tests tiennent d'accord : `app.json` et les `trustedOrigins` de `packages/auth`.
- Connexion par courriel et mot de passe seulement. Ni inscription, ni Google, ni ouverture de
  boutique sur le téléphone : un compte sans boutique voit l'écran qui renvoie au web.
- L'application est en français et en anglais selon la langue du téléphone, le français pour
  toute autre langue. Aucun libellé en dur dans un composant : tout passe par le catalogue,
  et les deux catalogues ont les mêmes clés.
- L'installation isolée de pnpm reste celle du dépôt : on ne touche pas à `node-linker`.
  Expo la prend en charge depuis le SDK 54.
- L'application n'entre dans aucune image Docker, et n'a pas de script `dev` : `turbo run dev`
  ne doit pas lancer Metro.
- Rien qui décrive un poste particulier dans ce qui se commite : ni adresse IP, ni chemin, ni
  nom de machine. Les adresses du téléphone vivent dans `apps/vendor-mobile/.env`, ignoré par
  Git, avec un `.env.example`.
- Pas de tiret quadratin ni demi-cadratin (`docs/conventions/redaction.md`). Code en anglais,
  commentaires et documentation en français.
- Un seul commit pour toute la marche, à la fin, avec ce plan. Aucune écriture Git sans
  l'accord du propriétaire ; la branche, `feat/vendor-mobile-app`, est créée par lui depuis
  `main` avant la tâche 1.

## Points de vigilance

Les cas que la spec implique et qu'aucun test ne verrait sans qu'on les nomme. Chacun a son
test dans la tâche indiquée.

1. **Un mauvais mot de passe, ou un courriel jamais vérifié**, rend un message lisible sur
   l'écran de connexion, jamais un plantage ni un écran vide : tâche 5.
2. **Une session que le serveur ne reconnaît plus** (expirée, révoquée) alors que le téléphone
   la garde : `me` rend `UNAUTHENTICATED`, l'application revient à l'écran de connexion sans
   message technique : tâche 5.
3. **L'API injoignable** (téléphone hors du réseau, serveur arrêté) : un écran le dit et
   propose de réessayer, au lieu d'une attente sans fin : tâche 5.
4. **Une variable `EXPO_PUBLIC_*` absente** : le démarrage s'arrête sur un message qui nomme la
   variable, au lieu d'une requête vers `undefined/graphql` : tâche 4.
5. **Un téléphone réglé dans une autre langue** que le français ou l'anglais s'affiche en
   français, sans clé brute à l'écran : tâche 3.

---

### Tâche 1 : le serveur accepte la connexion du téléphone

**Fichiers :**
- Modifier : `packages/auth/package.json`, `packages/auth/src/config/auth.config.ts`
- Créer : `apps/api/test/mobile-session.e2e-spec.ts`
- Modifier : `pnpm-lock.yaml`

**Interfaces :**
- Produit : la configuration unique de Better Auth porte le plugin `expo()` de
  `@better-auth/expo` et compte `clemperl-vendor://` parmi ses `trustedOrigins`.
- Consomme : `auth.handler` de `@clemperl/auth`, et non `openSession` de T8a : la connexion doit
  passer par la même route HTTP que celle du téléphone, avec ses en-têtes.

- [ ] **Étape 1 : écrire les tests qui échouent**

`mobile-session.e2e-spec.ts`, sur le modèle de `graphql.e2e-spec.ts` (compte créé par
`auth.api.signUpEmail`, adresse vérifiée en base, application montée par `AppModule`). Une
fonction locale envoie `POST {NEXT_PUBLIC_STOREFRONT_URL}/api/auth/sign-in/email` à
`auth.handler(new Request(...))`, corps JSON `{ email, password }`, avec l'en-tête
`expo-origin` donné et SANS `Origin`, exactement comme le client Expo :

- `it("connecte le téléphone dans Expo Go")` : `expo-origin: exp://192.0.2.20:8081` rend 200
  et un `set-cookie` de session ;
- `it("connecte l'application sous son propre schéma")` : `expo-origin: clemperl-vendor://`
  rend 200 ;
- `it("refuse une origine Expo inconnue")` : `expo-origin: https://ailleurs.test` rend 403 ;
- `it("ouvre /graphql au cookie que le téléphone a reçu")` : le cookie du premier cas, posé en
  `Cookie` sur `POST /graphql` sans `Origin`, fait rendre à `{ me { user { email } } }`
  l'adresse du compte.

- [ ] **Étape 2 : vérifier l'échec**

Run : `docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.e2e.ts --runInBand test/mobile-session.e2e-spec.ts"`
Attendu : au moins « refuse une origine Expo inconnue » échoue, 200 au lieu de 403 : sans le
plugin, `expo-origin` n'est lu par personne. Si d'autres cas passent déjà, le noter au registre :
Better Auth laisse alors passer une connexion sans origine, et le plugin n'apporte que la
vérification d'`expo-origin`.

- [ ] **Étape 3 : implémenter**

`pnpm --filter @clemperl/auth add -E @better-auth/expo@1.7.5`. Si `@better-auth/core` ne se
résout pas (`autoInstallPeers: false`), l'ajouter à la même version que celle que `better-auth`
installe, et le dire au registre. Dans `auth.config.ts` : `plugins: [expo()]`, et
`"clemperl-vendor://"` ajouté aux `trustedOrigins`, avec un commentaire : le plugin fait
confiance à `exp://` de lui-même en développement, pour Expo Go ; le schéma de l'application
sert à toute version construite, et n'est écrit qu'une fois côté serveur.

Puis `pnpm turbo run build --filter=@clemperl/auth` et `pnpm docker:up` : le conteneur ne monte
pas les `package.json`.

- [ ] **Étape 4 : vérifier**

Run : la commande de l'étape 2, puis toute la couche e2e de l'API, puis
`pnpm --filter @clemperl/auth test && pnpm --filter @clemperl/api test`
Attendu : tout passe ; les tests unitaires de l'API restent à 100 %.

---

### Tâche 2 : l'application entre dans le monorepo

**Fichiers :**
- Créer : `apps/vendor-mobile/` : `package.json`, `app.json`, `tsconfig.json`,
  `eslint.config.mjs`, `jest.config.js`, `metro.config.js` s'il faut, `.env.example`,
  `src/app/_layout.tsx`, `src/app/index.tsx`, `src/app-config.spec.ts`
- Modifier : `.dockerignore`, `pnpm-workspace.yaml` s'il faut trancher des scripts
  d'installation, `pnpm-lock.yaml`

**Interfaces :**
- Produit : le paquet `@clemperl/vendor-mobile`, scripts `start` (`expo start`), `lint`,
  `typecheck`, `test` ; point d'entrée `expo-router/entry` ; routes sous `src/app/`.

- [ ] **Étape 1 : poser l'application**

Partir du gabarit d'Expo pour le SDK 58 (`create-expo-app` avec le gabarit vide d'Expo
Router, ou les fichiers équivalents écrits à la main), dans `apps/vendor-mobile`, puis le
ramener au dépôt : nom `@clemperl/vendor-mobile`, `private`, versions exactes des contraintes
globales, React 19.3.0, TypeScript 6.0.3, `@clemperl/eslint-config` comme les autres paquets.
Pas de script `dev`. `app.json` : nom « ClemPerl Vendeur », `slug` `clemperl-vendor`,
`scheme` `clemperl-vendor`, plugins `expo-router`, `expo-secure-store`, `expo-localization`.
Supprimer du gabarit tout ce qui ne sert pas : écrans d'exemple, polices, images.

Les fichiers générés et non retouchés sont listés dans le registre : la pull request les
mettra à part.

- [ ] **Étape 2 : installer**

Outils de test : `jest` 30.5.1 (celui de l'API), `jest-expo` 58.0.12,
`@testing-library/react-native` 14.1.0 et `test-renderer`, sa dépendance de pair, en `^1`
résolu à une version exacte. Puis `pnpm install`. Chaque script d'installation que pnpm bloque
se tranche dans `allowBuilds`
après lecture de ce qu'il fait, comme `@apollo/protobufjs` en T8a, avec une ligne au
commentaire. Si `jest-expo` ne transforme pas les modules de `node_modules/.pnpm/`, élargir
son `transformIgnorePatterns` au chemin `.pnpm`, et le dire au registre.

- [ ] **Étape 3 : écrire le test qui échoue**

`src/app-config.spec.ts` : `it("déclare le schéma d'adresse que le serveur reconnaît")` lit
`app.json` et attend `expo.scheme === "clemperl-vendor"` et `expo.slug === "clemperl-vendor"`.
Son commentaire nomme le jumeau côté serveur, `trustedOrigins` dans `packages/auth`.

Avant d'écrire `app.json`, ou avec un schéma faux : le voir échouer.

- [ ] **Étape 4 : l'écran minimal**

`src/app/_layout.tsx` rend une `Stack` d'Expo Router ; `src/app/index.tsx` un texte fixe, à
remplacer en tâche 5.

- [ ] **Étape 5 : garder les images Docker hors de portée**

`apps/vendor-mobile` entre dans `.dockerignore`. Le stage `dev` des quatre Dockerfiles copie
tout le dépôt puis installe tout le workspace ; sans cette ligne, Expo et React Native
entreraient dans chaque image de développement. Si `pnpm install --frozen-lockfile` refuse
alors un importeur absent, filtrer l'installation du stage `dev` plutôt que retirer la ligne,
et le dire au registre.

Run : `pnpm docker:up`, puis `docker exec clemperl_dev_api sh -c "ls apps"`
Attendu : la pile démarre, et `vendor-mobile` est absent du conteneur.

- [ ] **Étape 6 : vérifier**

Run : `pnpm --filter @clemperl/vendor-mobile lint && pnpm --filter @clemperl/vendor-mobile typecheck && pnpm --filter @clemperl/vendor-mobile test`, puis `pnpm turbo run lint typecheck test`
Attendu : tout passe, et `turbo run dev --dry` ne liste pas l'application.

Puis, sur le téléphone : `pnpm --filter @clemperl/vendor-mobile start`, ouvrir le code dans
Expo Go. Attendu : l'écran minimal s'affiche. Si le téléphone ne joint pas Metro,
`expo start --tunnel`. Le constructeur demande au propriétaire de faire ce geste et note ce
qu'il a vu.

---

### Tâche 3 : les deux langues et le thème

**Fichiers :**
- Créer : `packages/i18n/messages/vendor-mobile/fr.json` et `en.json`
- Créer : `apps/vendor-mobile/src/i18n/locale.ts`, `translate.ts`, `use-t.ts`, leurs
  `.spec.ts`, `catalogs.spec.ts`
- Créer : `apps/vendor-mobile/src/ui/theme.ts`, `src/ui/use-theme.ts`

**Interfaces :**
- Produit : `type TMobileLocale = "fr" | "en"` ; `deviceLocale(languageCode: string | null): TMobileLocale` ;
  `type TMessageKey` dérivé des clés de `fr.json`, en chemins pointés (`"signIn.title"`) ;
  `translate(locale: TMobileLocale, key: TMessageKey, args?: Record<string, string>): string` ;
  `useT(): (key: TMessageKey, args?: Record<string, string>) => string`.
- Produit : `interface ITheme { background; text; muted; border; accent: string }`,
  `lightTheme`, `darkTheme`, `useTheme(): ITheme` selon `useColorScheme()`.

- [ ] **Étape 1 : écrire les tests qui échouent**

- `deviceLocale` : `"en"` donne `"en"`, `"fr"` donne `"fr"`, `"es"` et `null` donnent `"fr"`.
- `translate` : rend la phrase française et l'anglaise d'une même clé ; remplace `{shop}` par
  l'argument ; une clé de catalogue reste typée, donc pas de test de clé inconnue.
- `catalogs.spec.ts` : `it("les deux catalogues ont exactement les mêmes clés")` compare les
  ensembles de chemins de `fr.json` et `en.json`, et `it("aucune phrase n'est vide")`.

- [ ] **Étape 2 : vérifier l'échec**

Run : `pnpm --filter @clemperl/vendor-mobile test`
Attendu : échec, modules introuvables.

- [ ] **Étape 3 : implémenter**

Pas de bibliothèque d'internationalisation : une table, une recherche par chemin, un
remplacement des `{nom}`. `useT` lit la langue par `getLocales()[0]?.languageCode` de
`expo-localization`. Les catalogues portent les libellés des tâches 5 et 6, en français et en
anglais, dans le même changement. Le thème reprend les couleurs de
`packages/ui/src/styles/globals.css`, converties en hexadécimal puisque React Native ne lit pas
`oklch`, la valeur d'origine en commentaire.

- [ ] **Étape 4 : vérifier**

Run : `pnpm --filter @clemperl/vendor-mobile test && pnpm --filter @clemperl/vendor-mobile typecheck`
Attendu : tout passe.

---

### Tâche 4 : le client GraphQL et ses types

**Fichiers :**
- Créer : `apps/vendor-mobile/codegen.ts`, `src/lib/env.ts`, `src/lib/apollo-client.ts`, leurs
  `.spec.ts`, `src/graphql/generated/` (produit, jamais écrit à la main)
- Modifier : `apps/vendor-mobile/package.json` (scripts `codegen`, `lint`)

**Interfaces :**
- Produit : `interface IMobileEnv { apiUrl: string; storefrontUrl: string }` ;
  `readEnv(env: Record<string, string | undefined>): IMobileEnv`, qui lit
  `EXPO_PUBLIC_API_URL` et `EXPO_PUBLIC_STOREFRONT_URL` et lève une erreur qui nomme la
  variable absente.
- Produit : `createApolloClient(input: { apiUrl: string; getCookie: () => string | Promise<string>; fetch?: typeof fetch }): ApolloClient`.
- Produit : la fonction `graphql()` générée, d'où les écrans tirent leurs documents typés.

- [ ] **Étape 1 : écrire les tests qui échouent**

- `env.spec.ts` : un environnement complet rend les deux adresses, sans barre finale ;
  `it("nomme la variable absente")` pour chacune des deux.
- `apollo-client.spec.ts`, `fetch` simulé : une requête `me` part vers
  `{apiUrl}/graphql`, en `POST`, `Content-Type: application/json`, avec `Cookie` égal à ce que
  rend `getCookie`, `credentials: "omit"`, et SANS en-tête `Origin` ; un `getCookie` vide
  n'envoie pas d'en-tête `Cookie`.

- [ ] **Étape 2 : vérifier l'échec**

Run : `pnpm --filter @clemperl/vendor-mobile test`
Attendu : échec, modules introuvables.

- [ ] **Étape 3 : implémenter, puis générer**

Dépendances : `@apollo/client` 4.3.5, `graphql` 16.14.2, `rxjs`, dépendance de pair d'Apollo
Client 4 ; en développement, `@graphql-codegen/cli` 7.4.6 et `@graphql-codegen/client-preset`
6.2.3. Versions exactes.

`codegen.ts` : schéma `../api/src/modules/graphql/schema.gql`, documents `src/**/*.tsx` et
`src/**/*.ts` hors `generated`, préréglage `client` vers `src/graphql/generated/`. Scripts :
`"codegen": "graphql-codegen"`, et `lint` qui lance aussi `graphql-codegen --check`, pour que la
CI rougisse sur des types qui ne suivent plus le schéma ou les documents.
`credentials: "omit"` : le cookie part par l'en-tête que le client Better Auth fournit, et iOS
ne doit pas y mêler son propre bocal. Le commentaire de `createApolloClient` dit pourquoi le
téléphone n'envoie pas d'origine et pourquoi `/graphql` l'accepte (`docs/graphql.md`, section 6).

- [ ] **Étape 4 : vérifier**

Run : `pnpm --filter @clemperl/vendor-mobile codegen && pnpm --filter @clemperl/vendor-mobile lint && pnpm --filter @clemperl/vendor-mobile test && pnpm --filter @clemperl/vendor-mobile typecheck`
Attendu : tout passe. Puis changer une description dans un DTO de l'API sans réimprimer : rien
ne bouge côté téléphone ; réimprimer `schema.gql` sans relancer `codegen` : `lint` échoue.
Restaurer.

---

### Tâche 5 : la connexion et l'écran d'accueil

**Fichiers :**
- Créer : `apps/vendor-mobile/src/lib/auth-client.ts`
- Créer : `apps/vendor-mobile/src/features/session/me-state.ts` et son `.spec.ts`
- Créer : `apps/vendor-mobile/src/features/session/me.query.ts` (le document `me`)
- Créer : `apps/vendor-mobile/src/app/sign-in.tsx`, `src/features/session/sign-in-form.tsx` et
  son `.spec.tsx`
- Modifier : `apps/vendor-mobile/src/app/_layout.tsx`, `src/app/index.tsx`
- Créer : `apps/vendor-mobile/src/features/session/home-screen.tsx` et son `.spec.tsx`
- Créer : `apps/vendor-mobile/src/ui/` : les quelques composants dont les écrans ont besoin
  (`Screen`, `Button`, `TextField`, `Notice`)

**Interfaces :**
- Consomme : `readEnv`, `createApolloClient` (tâche 4) ; `useT`, `useTheme` (tâche 3).
- Produit : `authClient = createAuthClient({ baseURL: storefrontUrl, plugins: [expoClient({ scheme: "clemperl-vendor", storagePrefix: "clemperl-vendor", storage: SecureStore })] })`.
- Produit : `type TMeState = { kind: "loading" } | { kind: "signed-out" } | { kind: "unreachable" } | { kind: "no-shop"; email: string } | { kind: "ready"; email: string; shop: { name: string; suspended: boolean } }` ;
  `meState(result: { loading: boolean; error?: unknown; data?: TMeQuery }): TMeState`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`me-state.spec.ts` :
- `it("attend tant que la requête court")` ;
- `it("renvoie à la connexion sur UNAUTHENTICATED")` : une erreur GraphQL dont
  `extensions.code` vaut `UNAUTHENTICATED` donne `signed-out` ;
- `it("dit l'API injoignable sur une erreur réseau")` : une erreur réseau donne `unreachable` ;
- `it("distingue un compte sans boutique")` et `it("rend la boutique, suspendue ou non")`.

`sign-in-form.spec.tsx`, client Better Auth simulé, `@testing-library/react-native` :
- remplir le courriel et le mot de passe, presser « Se connecter » : `signIn.email` reçoit les
  deux, puis `onSignedIn` est appelé ;
- `it("dit un mot de passe faux sans planter")` : une réponse `{ error: { status: 401 } }`
  affiche le libellé du catalogue pour des identifiants refusés, et le formulaire reste rempli ;
- `it("dit un courriel jamais vérifié")` : `{ error: { status: 403 } }` affiche le libellé qui
  renvoie à la vérification par courriel ;
- le bouton est désactivé pendant l'envoi.

`home-screen.spec.tsx`, Apollo `MockedProvider`, routeur d'Expo simulé :
- `ready` : le nom de la boutique s'affiche ; une boutique suspendue affiche aussi l'avis ;
- `no-shop` : le libellé qui renvoie au web s'affiche, sans requête de boutique ;
- `unreachable` : le libellé et le bouton « Réessayer », qui relance la requête ;
- `signed-out` : le routeur remplace l'écran par `/sign-in` ;
- « Se déconnecter » appelle `signOut`, vide le cache d'Apollo, puis remplace par `/sign-in`.

- [ ] **Étape 2 : vérifier l'échec**

Run : `pnpm --filter @clemperl/vendor-mobile test`
Attendu : échec, modules introuvables.

- [ ] **Étape 3 : implémenter**

Dépendances : `better-auth` 1.7.5 et `@better-auth/expo` 1.7.5, les mêmes que le serveur, et
les modules Expo que son client demande, aux versions des contraintes globales. Le client vient
de `better-auth/react` et `@better-auth/expo/client`.

`meState` est une fonction pure ; les écrans ne lisent jamais `error` eux-mêmes. Le document
`me` demande `user { email }` et `shop { name suspended }`. `_layout.tsx` monte le
`ApolloProvider` avec `createApolloClient({ apiUrl, getCookie: authClient.getCookie })` ;
`readEnv(process.env)` y est appelé une fois. Aucune phrase en dur : tout vient de `useT`.

- [ ] **Étape 4 : vérifier**

Run : `pnpm --filter @clemperl/vendor-mobile codegen && pnpm --filter @clemperl/vendor-mobile lint && pnpm --filter @clemperl/vendor-mobile typecheck && pnpm --filter @clemperl/vendor-mobile test`
Attendu : tout passe.

---

### Tâche 6 : le téléphone joint les serveurs, le guide, la preuve

**Fichiers :**
- Créer : `docs/expo.md`, `apps/vendor-mobile/README.md`, en français : la règle de l'anglais
  ne vise que le `README.md` racine du dépôt (`docs/conventions/git.md`)
- Modifier : `apps/vendor-mobile/.env.example`, `docs/graphql.md` (section 8, le client),
  `docs/passation.md`, `CLAUDE.md` s'il faut, `docs/pieges.md` s'il y a lieu

- [ ] **Étape 1 : la mise en route**

`apps/vendor-mobile/README.md` dit comment le téléphone joint la pile : les deux variables
`EXPO_PUBLIC_*` valent l'adresse du poste sur le réseau local, ports de la boutique et de
l'API ; Metro se lance par `start`, et `--tunnel` quand le téléphone ne le joint pas ; le
téléphone et le poste partagent le même réseau. Aucune adresse réelle, aucun nom de poste.

- [ ] **Étape 2 : `docs/expo.md`**

Portée en tête. Une notion par section, au format de `docs/conventions/explanations.md` :
Expo Go et le SDK unique qu'il accepte ; Expo Router et ses routes par fichier ; les variables
`EXPO_PUBLIC_*`, lues au moment où Metro assemble ; la session dans le stockage sécurisé et
l'en-tête `Cookie` ; Metro dans un monorepo pnpm ; ce qui a changé depuis les SDK que le
propriétaire a connus, chaque fois avec la version où c'est arrivé. `docs/graphql.md` gagne une
section sur le client : `graphql()`, les types générés, `codegen` et son contrôle en `lint`.

- [ ] **Étape 3 : la passation**

T8a passe à **Livrée**, PR #19, fusionnée le 2026-10-24, arbre identique au commit poussé, CI
verte, aucune remarque de CodeRabbit. T8b à **Exécutée**, avec ce qu'elle livre, ce que la
vérification a établi et n'a pas établi, et comment reprendre.

- [ ] **Étape 4 : vérifier tout**

Run : `pnpm turbo run lint typecheck test`, `pnpm verify:thresholds`, la couche e2e de l'API
dans le conteneur, puis la recherche de tirets sur les fichiers touchés.
Attendu : tout passe, aucun tiret.

- [ ] **Étape 5 : la preuve du propriétaire**

Sur son iPhone, dans Expo Go : se connecter avec un compte vendeur, lire le nom de la boutique,
se déconnecter, revenir à l'écran de connexion. Puis, l'API arrêtée, rouvrir l'application :
l'écran « API injoignable » s'affiche, et « Réessayer » fonctionne quand l'API revient. Ce
qu'il a vu entre dans la passation.

- [ ] **Étape 6 : le commit, avec son accord**

Le commit unique de la marche, avec ce plan, message en anglais sans signature
d'attribution ; puis, sur nouvel accord, le push, et la pull request si le propriétaire la
demande, corps de moins de 1500 caractères (`wc -m`).
