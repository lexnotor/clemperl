# Passation

> **Portée** : tout le dépôt. Ce document dit **où en est le travail** et **ce qu'il
> faut pour le reprendre ailleurs**. Il ne répète ni les conventions
> (`docs/conventions/`), ni les faits du dépôt (`CLAUDE.md`), ni la mise en route
> (`README.md`, `docker/README.md`).

Dernière mise à jour : 2026-09-19.

## Où en est le projet

Le travail avance par tranches. Chacune a son cycle propre : idéation, spécification,
plan, exécution, un commit.

| Tranche | Objet | État |
| --- | --- | --- |
| T0 | Fondations du monorepo | **Livrée** — commit `776f3d6` |
| T1a | Identité et sessions | **Livrée** — ce commit |
| T1b | Vendeurs : demande d'ouverture et validation | **Livrée** |
| T2 | Catalogue et médias | non commencée |
| T3 | Panier et commande | non commencée |
| T4 | Paiement, point d'extension | non commencée |
| T5 | Abonnements vendeurs | non commencée |
| T6 | Administration | non commencée |
| T7 | Temps réel | non commencée |
| T8 | API GraphQL pour le mobile | à cadrer |

**L'API passera en GraphQL, et ce sera sa propre tranche.** La raison n'est pas une
préférence de style : une application mobile React Native (Expo) est prévue, donc l'API
aura un consommateur hétérogène — ce qui n'est pas le cas aujourd'hui, où les trois
fronts Next attaquent PostgreSQL directement par leurs server actions, comme T0 l'a
décidé.

Cette tranche devra trancher une question de niveau T0 : les fronts Next cessent-ils de
parler à la base pour passer par l'API ? Deux chemins de lecture sur les mêmes données,
c'est exactement le risque que T0 nommait — la même règle écrite à deux endroits, qui
divergent en silence. La réponse conditionne le périmètre de la tranche, pas l'inverse.

T1b dépend entièrement de T1a : le rôle vendeur y sera une **relation**, jamais une
colonne du compte. La spécification T1a, section 1, porte cette décision et sa raison.

## Reprendre sur une autre machine

Le dépôt ne suffit pas : trois choses n'y sont pas, volontairement.

**`.env` n'est pas versionné.** Le partir de `.env.example`, puis :

- `DEV_HOST` porte l'adresse locale **de la machine**, au format sslip.io
  (`10-0-10-176.sslip.io` désigne `10.0.10.176`). Elle change avec le réseau. Elle ne
  sert qu'à joindre la stack depuis un autre appareil — un téléphone, pour vérifier la
  réactivité de l'interface. Le développement sur la machine elle-même passe par
  `localhost` et l'ignore.
- `BETTER_AUTH_SECRET` peut rester la valeur d'exemple en développement. Changer de
  secret invalide toutes les sessions ouvertes, rien de plus.
- `COOKIE_DOMAIN` reste **vide** en développement. Les applications sont sur `localhost`
  à des ports différents, et les navigateurs n'isolent pas les cookies par port : le
  partage de session est déjà acquis. Cette variable n'a de sens qu'en production.

**Les identifiants Google n'existent pas.** `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`
sont vides, et le bouton « Continuer avec Google » n'apparaît que si
`NEXT_PUBLIC_GOOGLE_ACTIF` vaut `1`. Sans eux, le parcours par mot de passe est entier :
rien n'est bloqué. `docker/README.md` donne les URL de rappel à déclarer dans la console
Google le jour où on les crée.

**Les volumes Docker sont locaux.** La base de la nouvelle machine part vide. Le service
`migrate` du compose déploie les migrations avant que les applications démarrent, et
celles-ci l'attendent : `pnpm docker:up` suffit. Les comptes créés sur l'ancienne machine
ne suivent pas, et c'est sans conséquence — ce sont des comptes d'essai.

## Ce qui reste ouvert

Rien de tout cela ne bloque T1b.

**Le tour complet de Google n'a jamais été joué**, faute d'identifiants. La
configuration est écrite et le bouton se monte, mais aucun aller-retour réel n'a eu
lieu. C'est le seul critère d'acceptation de T1a resté ouvert.

**Le partage de session est prouvé sur des ports, pas sur des sous-domaines.** En
développement, les cookies sont partagés parce que le port ne les isole pas. En
production, c'est `COOKIE_DOMAIN` qui devra le faire, et ce chemin-là n'a jamais tourné.
Le jour où un environnement à sous-domaines existe, c'est la première chose à vérifier.

**L'image de l'API pèse 1,11 Go.** La CLI Prisma et TypeScript arrivent comme pairs
optionnels et ne sont jamais retirés. Personne n'a encore cherché à les exclure.

**Next 16 déprécie `middleware` au profit de `proxy`.** Le dépôt utilise encore
`middleware`. La migration n'est pas urgente, mais elle viendra.

**`scripts/dev-certs.sh` et `docker/proxy/` ne servent plus à la stack de
développement.** Ils datent du proxy nginx retiré pendant T1a — les applications
publient désormais chacune leur port. Le proxy est conservé pour la production, mais son
gabarit est encore paramétré par `DEV_HOST`, qui est une variable de développement. À
requalifier quand la production se montera.

**T0, critère 8 : l'affichage sur téléphone n'a pas été constaté.** Il demande un
appareil réel sur le réseau local.

**Le premier administrateur naît par `/setup`, sans jeton.** La seule barrière est
l'absence d'administrateur en base : la page disparaît dès qu'il en existe un. La
fenêtre entre le déploiement et la première connexion est donc ouverte à qui connaît
l'URL. Décision explicite, prise en connaissance du risque — la refermer consiste à
ouvrir l'administration **immédiatement** après le déploiement, avant toute annonce
publique. Un jeton d'amorçage reste ajoutable sans toucher au reste.

**Le seed ne crée plus aucun utilisateur.** Le compte d'administration de T0 était une
ligne `users` sans ligne `accounts` : Better Auth n'avait aucun identifiant à vérifier,
donc personne ne pouvait ouvrir l'administration. Il a été retiré plutôt que doté d'un
mot de passe écrit dans le dépôt.

**Le chemin Supabase hébergé n'a jamais été joué.** Le développement fait tourner
`supabase/storage-api` en conteneur, donc le vrai client et les vraies routes — mais
aucun projet Supabase distant n'existe, et les clés de production restent à créer.

**Aucun balayage des objets orphelins.** Si une transaction échoue après un
téléversement, la compensation supprime les objets ; si cette suppression échoue à son
tour, l'objet reste. Un orphelin coûte de l'espace, pas de la correction. Le balayage
relève de T7, avec les traitements de fond.

**Aucun écran ne permet de modifier une boutique validée.** Un nom mal saisi se corrige
en base. C'est le premier écran que T2 devra livrer.

**`apps/vendor` est toujours une coquille.** On ne demande pas d'entrer dans l'espace
vendeur avant d'être vendeur ; son back-office est le sujet de T2.

**Le sélecteur de thème n'existe pas.** Le clair est le défaut et ne dépend pas du
système. `data-theme="dark"` et `data-theme="system"` fonctionnent déjà : il ne manque
que l'interface pour les poser, et la persistance du choix.

## Ce qui a été vérifié, et comment

`docs/conventions/verification.md` sépare « vérifié en exécutant » de « vérifié sur
pièce ». Pour T1a, tout ce qui est coché l'a été **en exécutant** :

    pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
    pnpm docker:up && pnpm test:e2e
    docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
    docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.e2e.ts --runInBand"

Les planchers de couverture valent la valeur **mesurée** ce jour-là, jamais une valeur
souhaitée : 100 % pour `api`, `auth`, `i18n` et `ui`, 61 % pour `core` — dont l'écart
est le schéma d'environnement hérité de T0, sans test. Le cliquet monte, il ne descend
jamais.

`docs/pieges.md` tient le registre des pièges déjà payés. Le lire avant de « corriger »
du code qui paraît bizarre : trois entrées y sont nées de T1a, et chacune a coûté une
séance de débogage.
