# L'application vendeur

**Portée : `apps/vendor-mobile`.** Le commerçant y suit ses commandes depuis son téléphone. Elle
tourne dans Expo Go, parle à l'API par GraphQL, et se connecte avec le compte du web.

Pour comprendre ce qu'elle utilise, lire `docs/expo.md` et `docs/graphql.md`. Pour ce qu'elle
doit faire, la spec T8 : `docs/superpowers/specs/2026-10-23-t8-mobile-vendeur-design.md`.

## Mise en route

1. Dans le `.env` racine, `DEV_HOST` vaut l'adresse de la machine sur le réseau local, au
   format sslip.io : `192-0-2-10.sslip.io` désigne `192.0.2.10`. Pas `localhost` : sur le
   téléphone, `localhost` désigne le téléphone.
2. Dans le même `.env`, `EXPO_TOKEN` porte un jeton d'accès **personnel** du compte Expo
   connecté dans Expo Go (expo.dev, paramètres du compte, « Access tokens »). Sur un iPhone,
   Expo Go n'ouvre que les projets servis par une CLI connectée au même compte ; dans le
   conteneur, la CLI ne se connecte que par ce jeton. Un jeton robot ne convient pas.
3. Le téléphone et la machine sont sur le même réseau. Vérifier depuis le navigateur du
   téléphone que la boutique s'ouvre à `http://<DEV_HOST>:3000` : si elle ne s'ouvre pas,
   l'application ne la joindra pas davantage.
4. `pnpm mobile:up` à la racine : la pile, plus Metro dans le conteneur `clemperl_dev_mobile`,
   publié sur le port 8082 (`METRO_PORT`).
5. `docker attach clemperl_dev_mobile` affiche le code QR et les raccourcis de Metro ; Ctrl+P
   puis Ctrl+Q s'en détache sans l'arrêter. `pnpm mobile:logs` suit les journaux.
6. Scanner le code QR avec l'appareil photo du téléphone, qui ouvre Expo Go.

Se connecter avec un compte vendeur dont l'adresse est vérifiée. Après un changement de
`DEV_HOST` ou de `EXPO_TOKEN`, relancer `pnpm mobile:up` : les adresses sont inscrites dans l'application au moment
où Metro l'assemble. `pnpm docker:down` arrête Metro avec le reste.

### Sans Docker

Metro peut aussi tourner sur la machine : copier `.env.example` en `.env` dans ce dossier, y mettre
les deux adresses, puis `pnpm --filter @clemperl/vendor-mobile start`. Selon l'environnement du
poste, un Metro lancé ainsi n'est pas toujours joignable depuis le téléphone, et `--tunnel` exige
un compte Expo depuis le SDK 58 : d'où le conteneur.

## Les commandes

| Commande | Effet |
| --- | --- |
| `pnpm mobile:up` | La pile et Metro, dans Docker |
| `pnpm --filter @clemperl/vendor-mobile codegen` | Régénère les types GraphQL depuis `apps/api/src/modules/graphql/schema.gql` |
| `pnpm --filter @clemperl/vendor-mobile lint` | ESLint, puis vérifie que les types générés suivent le schéma et les requêtes |
| `pnpm --filter @clemperl/vendor-mobile test` | Les tests, sous `jest-expo` |

## Ce qu'elle n'est pas

Elle n'a pas de script `dev` et n'entre dans aucune des quatre images de la pile : `turbo run dev`
ne lance pas Metro, et le stage `dev` de leurs Dockerfiles exclut ses dépendances
(`docs/pieges.md`). Elle a sa propre image, `apps/vendor-mobile/Dockerfile`, pour Metro seul.
