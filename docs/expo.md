# Expo dans ClemPerl

**Portée : `apps/vendor-mobile`.** Ce guide grandit avec T8, comme `docs/graphql.md` : chaque
marche y ajoute les notions d'Expo et de React Native qu'elle fait entrer dans le code, avec le
fichier qui les montre. La mise en route de l'application est dans son `README.md`.

---

## 1. Expo Go, et le SDK unique qu'il accepte

### Pourquoi

Pour essayer une application React Native sur un iPhone, il faut d'ordinaire la compiler,
la signer, l'installer. Expo Go évite tout cela : c'est une application de l'App Store qui
contient déjà le code natif d'Expo, et qui charge le JavaScript de notre application depuis
le poste de développement. Le compte développeur Apple n'est pas nécessaire.

La contrepartie : Expo Go embarque le code natif d'**une** version du SDK d'Expo, la plus
récente. Notre application doit suivre cette version.

### Exemple

| Ce qui fixe la version | Valeur au 2026-10-26 |
| --- | --- |
| `expo` dans `apps/vendor-mobile/package.json` | 58.0.17 |
| React Native, imposé par le SDK 58 | 0.88.0 |
| React, imposé par React Native 0.88 | 19.3.0, celui des fronts Next |

Les autres modules Expo (`expo-router`, `expo-secure-store`...) prennent les versions que le
SDK 58 inscrit dans `bundledNativeModules.json`, celles que `expo install` choisirait.

### Trois choses à retenir

1. **Quand Expo Go passe au SDK suivant, l'application doit suivre**, sinon Expo Go refuse de
   l'ouvrir. La montée se fait par `expo install --fix`, qui réaligne les modules.
2. **Expo Go ne sait pas tout faire.** Il ne contient que les modules natifs d'Expo, et pas les
   notifications envoyées par un serveur sur Android depuis le SDK 53. C'est pourquoi T8f écrit
   ces notifications sans pouvoir les prouver sur un appareil.
3. **Un seul React dans le monorepo** : React Native 0.88 demande React 19.3, la version des
   fronts web. Sans cette coïncidence, deux React cohabiteraient.

### Le piège

Mettre à jour un module Expo seul, à la main, à sa dernière version : il peut viser un SDK plus
récent que celui d'Expo Go, et l'application plante au démarrage sur un module natif absent.

---

## 2. Expo Router : un écran par fichier

### Pourquoi

Une application a plusieurs écrans, et il faut passer de l'un à l'autre. Expo Router reprend
l'idée de l'App Router de Next : **chaque fichier de `src/app/` est un écran**, et son chemin
est son adresse.

### Exemple

| Fichier | Écran | Adresse |
| --- | --- | --- |
| `src/app/_layout.tsx` | L'enveloppe de tous les écrans | aucune |
| `src/app/index.tsx` | L'accueil | `/` |
| `src/app/sign-in.tsx` | La connexion | `/sign-in` |

`_layout.tsx` fournit à tous les écrans le client GraphQL (`ApolloProvider`) et une pile de
navigation (`Stack`). Un écran change de page par `router.replace("/sign-in")`.

### Trois choses à retenir

1. **`replace` et non `push`** après une connexion ou une déconnexion : l'écran quitté ne doit
   pas rester derrière le bouton retour.
2. **Les écrans de route restent minces.** `src/app/index.tsx` ne fait que poser `HomeScreen`
   et lui passer la déconnexion ; la logique vit dans `src/features/`, où les tests la
   trouvent sans routeur.
3. **`src/app/` est réservé aux routes.** Un composant rangé là deviendrait un écran.

### Le piège

Oublier qu'un fichier de `src/app/` est une route : un utilitaire posé à côté des écrans y
devient une page, accessible par son adresse.

---

## 3. Les variables `EXPO_PUBLIC_*`

### Pourquoi

L'application doit savoir où joindre l'API et la boutique. Ces adresses changent d'un poste à
l'autre, donc elles ne s'écrivent pas dans le code. Elles vivent dans `apps/vendor-mobile/.env`,
ignoré par Git, et seules les variables qui commencent par `EXPO_PUBLIC_` arrivent jusqu'à
l'application.

### Exemple

`.env` contient `EXPO_PUBLIC_API_URL=http://<adresse du poste>:3003`. Dans le code,
`src/lib/runtime.ts` écrit :

```typescript
readEnv({
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_STOREFRONT_URL: process.env.EXPO_PUBLIC_STOREFRONT_URL,
});
```

Quand Metro assemble l'application, il remplace chaque `process.env.EXPO_PUBLIC_API_URL` par
sa valeur. L'adresse est alors inscrite dans le JavaScript que le téléphone reçoit.

### Trois choses à retenir

1. **L'accès doit être statique.** `process.env.EXPO_PUBLIC_API_URL` est remplacé ;
   `process.env[nom]`, ou `process.env` passé à une fonction, ne l'est pas, et l'application
   ne lit rien.
2. **Pas de `localhost`** : sur le téléphone, `localhost` désigne le téléphone. Il faut
   l'adresse du poste sur le réseau local.
3. **Ce n'est pas un secret.** Tout ce qui est `EXPO_PUBLIC_` finit dans l'application, lisible
   par qui l'a. N'y mettre que des adresses.

### Le piège

Changer `.env` sans relancer Metro : l'application garde l'ancienne adresse, puisqu'elle a été
inscrite à l'assemblage, et non lue au démarrage.

---

## 4. La session sur le téléphone

### Pourquoi

Sur le web, la session est un cookie que le navigateur garde et renvoie tout seul. Un
téléphone n'a pas de navigateur pour cela. Le client Expo de Better Auth s'en charge : il garde
le cookie dans le **stockage sécurisé** du téléphone (le trousseau sur iPhone), et l'application
le joint elle-même à chaque requête.

### Exemple

1. Connexion : `authClient.signIn.email(...)` appelle le gestionnaire de la boutique, avec un
   en-tête `expo-origin: clemperl-vendor://` (`src/lib/auth-client.ts`).
2. Côté serveur, `mobileOriginPlugin` (`packages/auth/src/plugins/mobile-origin.plugin.ts`)
   recopie `expo-origin` en `Origin`, et Better Auth vérifie cette origine.
3. La réponse porte le cookie de session, que le client range dans le stockage sécurisé.
4. Chaque requête GraphQL part avec `Cookie: <ce cookie>`, que `createApolloClient` lit par
   `authClient.getCookie()`.

### Trois choses à retenir

1. **Le téléphone n'envoie pas d'`Origin`**, ni à Better Auth, ni à `/graphql`. C'est pourquoi
   le serveur lit `expo-origin`, et pourquoi `/graphql` admet une requête sans origine.
2. **`credentials: "omit"`** sur les requêtes GraphQL : le cookie part par l'en-tête, et iOS ne
   doit pas y mêler son propre bocal à cookies.
3. **Le schéma `clemperl-vendor` est écrit deux fois**, dans `app.json` et dans les origines de
   confiance du serveur, et deux tests les tiennent d'accord.

### Le piège

Croire qu'Expo Go s'annonce sous le schéma de l'application. Dans Expo Go, l'origine est
`exp://<adresse>:<port>`, à laquelle le serveur ne fait confiance qu'en développement.

---

## 5. Metro dans un monorepo pnpm

### Pourquoi

Metro est l'assembleur de React Native : il part de `expo-router/entry` et suit chaque import.
Dans un monorepo, les paquets vivent à la racine, et pnpm range chacun sous
`node_modules/.pnpm/<paquet>@<version>/`, relié par des liens. Metro doit savoir suivre ces
liens.

### Exemple

L'application n'a ni `metro.config.js`, ni réglage de pnpm : Expo configure Metro tout seul
dans un monorepo depuis le SDK 52, et accepte l'installation isolée de pnpm depuis le SDK 54.
La preuve : `expo export --platform ios` assemble l'application sans erreur.

### Trois choses à retenir

1. **L'application n'importe aucun paquet serveur du monorepo**, seulement les catalogues JSON
   de `packages/i18n`. Metro n'a ainsi ni Prisma, ni Nest, ni `node:net` à assembler.
2. **Ses dépendances restent hors des images Docker**, par deux réglages qui vont ensemble :
   `.dockerignore` ne laisse passer que son `package.json`, et le stage `dev` des Dockerfiles
   installe avec `--filter "!@clemperl/vendor-mobile"`.
3. **Une dépendance serveur qui a des pairs facultatives est à lire avant de l'ajouter** : pnpm
   les résout dès qu'elles existent dans le workspace. Voir `docs/pieges.md`.

### Le piège

Ajouter `@better-auth/expo` à `packages/auth` pour le côté serveur : Expo et React Native
suivent alors l'API jusque dans son image de production.

### Metro dans Docker

Metro a sa propre image, `apps/vendor-mobile/Dockerfile`, et un service `mobile` dans le
compose, sous un profil : `pnpm mobile:up` le démarre, `pnpm docker:up` non.

Pourquoi un conteneur : Docker publie ses ports sur le réseau local, alors qu'un Metro lancé
hors conteneur n'y est pas toujours joignable, selon l'environnement du poste. Sinon, il
faudrait le tunnel d'Expo, qui exige un compte Expo depuis le SDK 58.

Trois réglages, tous dans le compose, tous tirés de `DEV_HOST` :

1. `REACT_NATIVE_PACKAGER_HOSTNAME` : l'adresse que Metro annonce dans son code QR. Sans elle,
   il annoncerait l'adresse interne du conteneur, injoignable depuis le téléphone.
2. `RCT_METRO_PORT`, et le port publié sous le même numéro : Metro annonce SON port.
3. `EXPO_PUBLIC_API_URL` et `EXPO_PUBLIC_STOREFRONT_URL` : les adresses de l'application.
4. `EXPO_TOKEN`, lu dans le `.env` racine : sur un iPhone physique, Expo Go n'ouvre un projet
   que si la CLI est connectée au même compte Expo que lui. La CLI inscrit son compte dans le
   manifeste (`extra.expoGo.username`), Expo Go le compare au sien. Un jeton personnel, pas un
   jeton robot, qui s'annonce `<nom> (robot)`.

Les sources sont montées en lecture seule, ce qui garde le rechargement à chaud ; le dossier
entier ne l'est pas, sinon Expo écrirait `.expo/` au nom de root sur la machine.

---

## 6. Tester l'application

### Pourquoi

Les écrans se testent sans téléphone, sous Jest, avec le préréglage `jest-expo`, qui simule les
modules natifs. `@testing-library/react-native` rend un composant et le manipule comme le
ferait une personne : par les libellés qu'elle lit.

### Exemple

`src/features/session/sign-in-form.spec.tsx` :

1. `await render(<SignInForm ... />)` : le rendu est asynchrone dans la version 14.
2. `await user.type(screen.getByLabelText("Adresse électronique"), "...")` : le champ est
   retrouvé par son libellé, que le lecteur d'écran annonce aussi.
3. `expect(await screen.findByText("Adresse ou mot de passe incorrect.")).toBeTruthy()`.

### Trois choses à retenir

1. **La langue est fixée dans les tests** par `jest.mock("expo-localization", ...)`, sinon les
   libellés dépendraient de la machine qui les lance.
2. **Les écrans reçoivent la connexion et la déconnexion en propriété** : les tests les
   remplacent sans simuler de module.
3. **`jest.config.js` étend le préréglage pour le client de Better Auth**, publié en ESM et en
   partie en `.mjs`, que le préréglage ne transforme pas.

### Le piège

Un test d'écran qui passe en anglais sur un poste et échoue en français sur un autre : c'est la
langue du système qui a fui dans le test, faute de l'avoir fixée.

---

## 7. Ce qui a changé dans Expo, et depuis quand

Ce qui surprend quand on revient à Expo après quelques versions. Chaque ligne dit la version où
c'est arrivé ; « constaté » veut dire vu dans ce dépôt, sur le SDK 58, sans en savoir la version
d'origine.

| Changement | Depuis |
| --- | --- |
| Metro se configure seul dans un monorepo | SDK 52 |
| Les notifications envoyées par un serveur ne marchent plus dans Expo Go sur Android | SDK 53 |
| L'installation isolée de pnpm est prise en charge | SDK 54 |
| `jest-expo` demande `@react-native/jest-preset`, paquet séparé de React Native | constaté |
| `expo start --tunnel` passe par le tunnel signé d'Expo, qui exige un compte Expo | constaté |
| Sur un iPhone physique, Expo Go exige une CLI connectée au même compte Expo que lui | constaté, SDK 58 |
| `render` de `@testing-library/react-native` est asynchrone | version 14 de la bibliothèque |
