# Passation

> **Portée** : tout le dépôt. Ce document dit **où en est le travail** et **ce qu'il
> faut pour le reprendre ailleurs**. Il ne répète ni les conventions
> (`docs/conventions/`), ni les faits du dépôt (`CLAUDE.md`), ni la mise en route
> (`README.md`, `docker/README.md`).

Dernière mise à jour : 2026-09-21.

## Où en est le projet

Le travail avance par tranches. Chacune a son cycle propre : idéation, spécification,
plan, exécution, un commit.

| Tranche | Objet | État |
| --- | --- | --- |
| T0 | Fondations du monorepo | **Livrée** — commit `6918645` |
| T1a | Identité et sessions | **Livrée** — commit `15e276a` |
| T1b | Vendeurs : demande d'ouverture et validation | **Livrée** — `ef68c6c`..`c33188c` |
| T2a | Espace vendeur et boutique | **Livrée** |
| T2b | Produit et variantes | **Livrée** |
| T2c | Pipeline médias (BullMQ, sharp, worker) | non commencée |
| T2d | Catalogue public : liste, filtres, fiche | non commencée |
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

T1b a tenu la décision de T1a : le rôle vendeur est une **relation**
(`vendor_members`), jamais une colonne du compte. La spécification T1a, section 1, porte
cette décision et sa raison ; `docs/superpowers/specs/2026-09-19-t1b-vendeurs-design.md`
porte le modèle qui en découle.

## Reprendre sur une autre machine

Le dépôt ne suffit pas : quatre choses n'y sont pas.

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

**Un `.env` déjà présent peut être PÉRIMÉ.** Le document couvrait la machine neuve, pas
la machine qu'on retrouve après quelques tranches. Une tranche qui ajoute une variable
l'écrit dans `.env.example` seulement : le `.env` local, lui, ne bouge pas. Le symptôme
est un conteneur qui sort en erreur sur un nom de variable — `PGRST_JWT_SECRET is
undefined` pour le stockage. Comparer avant de chercher ailleurs :

    comm -23 <(grep -oE "^[A-Z_]+=" .env.example | sort -u) <(grep -oE "^[A-Z_]+=" .env | sort -u)

**Un volume PostgreSQL peut aussi être périmé.** T1b a écrasé l'historique des migrations.
Un volume antérieur porte les anciens types, et `migrate deploy` échoue sur
`type "user_role" already exists` (P3018). La réponse est de supprimer le volume — il ne
contient que des comptes d'essai :

    pnpm docker:down && docker volume rm clemperl_dev_pg_data clemperl_dev_storage_data

**Les navigateurs de Playwright ne sont pas dans le dépôt.** `pnpm install` ne les pose
pas : il faut `pnpm exec playwright install`. Sans eux, `pnpm test:e2e` échoue sur
« Executable doesn't exist », et le message accuse le premier test plutôt que
l'installation.

### Faire tourner la suite bout en bout

Deux bancs, et ils ne disent pas la même chose.

    pnpm docker:up && pnpm test:e2e     # développement — ce que la CI exerce
    pnpm e2e:up    && pnpm test:e2e     # build de production

Le premier doit être **vert en entier** : c'est celui de `ci.yml`. Le second ne l'est pas
encore — trois suites de T1a et T1b y butent sur la limitation de débit de Better Auth
(voir « Ce qui reste ouvert »). Les suites de T2a y passent.

Dans les deux cas, **attendre la santé des conteneurs avant de lancer les tests** :
`up -d` rend la main au démarrage, pas à la disponibilité.

    docker compose --env-file .env -f docker/docker-compose.dev.yml ps

### Si Docker Desktop tourne sous WSL

Deux pannes d'interop ont coûté une séance le 2026-09-20, toutes deux étrangères au code
et toutes deux muettes sur leur cause :

- `error getting credentials - err: exit status 1` à la construction. L'assistant
  d'identifiants passe par Windows. Contournement sans toucher à `~/.docker/config.json` :
  un `DOCKER_CONFIG` jetable contenant `{}`, les images publiques ne demandant aucune
  authentification.
- `mount ... no such file or directory` au démarrage d'un conteneur, sur un fichier qui
  existe pourtant. Le cache de montage de Docker Desktop est périmé : un `touch` sur le
  fichier concerné le fait réévaluer.

Un redémarrage de Docker Desktop règle les deux.

## Ce qui reste ouvert

Rien de tout cela ne bloque T2.

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

**Les informations légales ne se corrigent nulle part.** Le vendeur les voit en lecture
et lit où écrire ; côté administration, le chemin reste la base. C'est une décision de
T2a — un administrateur les a validées contre les pièces téléversées, et
`updateShopProfile` ne les prend pas en paramètres, elles sont absentes de sa signature.
Ça devient un vrai manque le jour où une société change de forme juridique.

**Deux onglets qui enregistrent en même temps : la dernière écriture gagne.** Aucun
verrou optimiste. Accepté tant qu'une boutique n'a qu'un membre — rien ne crée le second
aujourd'hui. À rouvrir avec les invitations.

**La limitation de débit de Better Auth n'est pas déclarée, et elle mord en production.**
`/sign-up/email` accepte trois requêtes puis répond `429`. Le réglage est hérité du
framework, qui l'active en production et la désactive en développement — donc il ne se
voit qu'en production. Mesuré le 2026-09-21 : trois `200` puis trois `429` d'affilée.
Conséquence immédiate : `sign-up.spec.ts` et `vendor-application.spec.ts` échouent contre
la surcharge de production, qui crée des comptes plus vite qu'aucun humain. La CI n'est
pas concernée, elle tourne sur la stack de développement. Le corriger consiste à déclarer
la politique dans `packages/auth/src/config/auth.config.ts` plutôt qu'à l'hériter, et à
relever le plafond dans `docker-compose.e2e.yml`. À traiter comme une décision de
sécurité, pas comme un correctif de test — la règle sur « mot de passe oublié » mérite
notamment d'être choisie, pas subie.

**`pnpm e2e:up` rend la main avant que la stack soit prête.** Il attend le démarrage des
conteneurs, pas leur santé ni la fin de `storage-init`. La CI compense par une boucle
d'attente explicite (`ci.yml`) ; en local, rien. Lancer `pnpm test:e2e` dans la foulée
produit des échecs qu'on attribue au code.

**Un produit n'a aucune image, et aucun stock.** Les médias sont T2c, le stock T3. Rien
à l'écran ne prétend le contraire.

**Rien de publié n'est visible hors de l'espace vendeur.** Le catalogue public est T2d.
Publier ne fait aujourd'hui que changer un état et figer le slug.

**`ProductVariant.priceAmount` est un `Int`**, plafonné à 2 147 483 647 : 2,1 milliards de
francs CFA, environ 3,2 M€. Au-dessus de tout article des trois métiers visés. Le plafond
est un choix, écrit pour que le jour où il gêne, on sache qu'il a été vu.

**La devise d'une boutique se fige dès qu'un produit existe**, brouillon compris. Le
déblocage est la suppression du brouillon, et le message le dit. Accepté.

**L'arithmétique monétaire attend T3, et elle passera par une bibliothèque.** Aujourd'hui
`packages/core` porte `IMoney`, `CURRENCY_EXPONENT`, `parsePrice` et `formatPrice` — de
quoi ranger un entier et l'afficher, ce que T2b demande et rien de plus. **T2b ne fait
aucun calcul.**

Le calcul arrive avec le panier : additionner des lignes, appliquer une remise, et surtout
**répartir un total entre plusieurs boutiques sans perdre un centime**. C'est là que le
code monétaire écrit à la main se trompe, et là qu'une bibliothèque dédiée gagne son
droit d'entrée. `dinero.js` 2.0.2 est le candidat : ESM, sans aucune dépendance, et sa
représentation — unité mineure entière plus `{ code, base, exponent }` — est exactement
celle qu'on range déjà. L'adopter ne demandera donc **aucune migration**.

Deux choses resteront à notre charge quoi qu'il arrive : lire « 1 200,50 » depuis un
formulaire français et refuser une décimale en franc CFA — aucune bibliothèque monétaire
n'analyse une saisie ; et le formatage, qui n'est qu'un `Intl.NumberFormat`.

Le seul point d'attention : `docs/ce-qui-casse.md` dit qu'une dépendance ajoutée à
`@clemperl/core` fait que « le cœur métier cesse d'être importable partout ». Dinero étant
sans dépendance, il passe ce test — mais c'est une décision à prendre explicitement.

**Les clés étrangères de `ProductVariantValue` ne garantissent pas la cohérence
hiérarchique.** Elles valident chaque identifiant séparément : rien en base n'interdit une
variante du produit A portant un axe du produit B. Aucun appelant ne peut le produire —
`saveProduct` construit ces lignes depuis ses propres tables, dans la transaction d'un
seul produit. La fermer demande des clés composites sur trois tables et une migration.
C'est la bonne direction, et c'est un chantier.

**Les fronts n'ont pas `packages/db` monté, ils l'embarquent.** Le compose monte
`packages/core/src`, `packages/domain/src`, `packages/ui/src` et `packages/auth/src` dans
les trois applications Next, dont le `tsc --watch` recompile les `dist` à chaud. Pas
`packages/db` : tout changement du schéma ou d'un dépôt exige `pnpm docker:up`, et le
symptôme accuse une route sans rapport. Trois reconstructions l'ont coûté pendant la
seule tranche T2b.

Le monter demanderait `src`, `generated` et `prisma` ensemble — `generated` n'étant pas
dans `src`. C'est un changement de topologie à vérifier pour les quatre applications, et
il mérite son propre chantier plutôt qu'un coin de tranche.

**`@clemperl/core` n'a pas de sous-chemin navigateur.** `@clemperl/domain` en a un
(`/browser`) depuis T2b, parce qu'un composant client qui importe son barillet fait entrer
nodemailer dans le paquet. `core` a le même défaut latent : le premier composant client
qui y cherchera `TCurrency` ou `CURRENCY_EXPONENT` le rouvrira.

**Aucun sélecteur de boutique.** Le schéma autorise plusieurs `vendor_members` pour un
même compte, mais rien ne les crée. Le sélecteur arrivera avec les invitations, pas
avant.

**Il n'y a qu'un thème, et c'est voulu.** Le clair est le seul thème servi, et il ne
dépend pas du réglage du système : une place de marché montre des produits dont les
photos sont préparées sur fond clair, et un thème sombre les dénature. Les règles
`data-theme="dark"` et `data-theme="system"` existent dans `packages/ui` et sont
correctes, mais aucune interface ne les pose — le sélecteur a été cadré puis écarté le
2026-09-20. Le rouvrir consiste à monter un contrôle et à persister le choix ; rien
d'autre n'est à écrire.

## Ce qui a été vérifié, et comment

`docs/conventions/verification.md` sépare « vérifié en exécutant » de « vérifié sur
pièce ». Pour T1a comme pour T1b, tout ce qui est coché l'a été **en exécutant** :

    pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
    pnpm docker:up && pnpm test:e2e
    docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
    docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.e2e.ts --runInBand"

T1b a joué le parcours entier dans le navigateur, et c'est sa preuve principale :
dépôt d'une demande avec pièces, refus motivé, lecture du motif par le candidat,
resoumission corrigée, validation, puis existence de la boutique et de son propriétaire
(`e2e/vendor-application.spec.ts`). La suite tourne désormais sur un **build de
production** (`docker/docker-compose.e2e.yml`, `pnpm e2e:up`), pas sur le serveur de
développement.

Les planchers de couverture valent la valeur **mesurée** ce jour-là, jamais une valeur
souhaitée. Ils sont à 100 % partout : `api`, `auth`, `core`, `db`, `domain`, `i18n` et
`ui`. L'écart de `core` hérité de T0 — le schéma d'environnement sans test — a été
comblé pendant T1b. Le cliquet monte, il ne descend jamais.

T2a a été la première tranche jouée contre un **build de production** (`pnpm e2e:up`).
Cette surcharge existait depuis T1b sans avoir jamais tourné, et elle a révélé quatre
défauts qu'aucune autre vérification ne voyait : le stockage refusé au démarrage, l'image
de l'API qui ne démarrait pas depuis T1a, une décision d'administration lue avant d'être
écrite, et la limitation de débit ci-dessus. Les trois premiers sont corrigés. La leçon
tient en une ligne : **une suite qui ne passe que contre un serveur de développement ne
dit rien de ce qui sera déployé.**

`docs/pieges.md` tient le registre des pièges déjà payés — vingt-neuf entrées, dont
quinze nées de T1b. Le lire avant de « corriger » du code qui paraît bizarre : chacune a
coûté une séance de débogage, et plusieurs décrivent un code qui a l'air faux et ne
l'est pas.
