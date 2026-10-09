# Passation

> **Portée** : tout le dépôt. Ce document dit **où en est le travail** et **ce qu'il
> faut pour le reprendre ailleurs**. Il ne répète ni les conventions
> (`docs/conventions/`), ni les faits du dépôt (`CLAUDE.md`), ni la mise en route
> (`README.md`, `docker/README.md`).

Dernière mise à jour : 2026-10-05.

## Où en est le projet

Le travail avance par tranches. Chacune a son cycle propre : idéation, spécification,
plan, exécution, un commit.

| Tranche | Objet | État |
| --- | --- | --- |
| T0 | Fondations du monorepo | **Livrée**, commit `6918645` |
| T1a | Identité et sessions | **Livrée**, commit `15e276a` |
| T1b | Vendeurs : demande d'ouverture et validation | **Livrée**, `ef68c6c`..`c33188c` |
| T2a | Espace vendeur et boutique | **Livrée** |
| T2b | Produit et variantes | **Livrée** |
| T2c | Pipeline médias (BullMQ, sharp, worker) | **Livrée** |
| T2d | Catalogue public : liste, filtres, fiche | **Livrée**, PR #6 |
| T2e | Collections de produits | **Livrée**, PR #7 |
| T3 | Panier et commande | non commencée |
| T4 | Paiement, point d'extension | non commencée |
| T5 | Abonnements vendeurs | non commencée |
| T6 | Administration | non commencée |
| T7 | Temps réel | non commencée |
| T8 | API GraphQL pour le mobile | à cadrer |

**La liste du catalogue n'est pas cacheable page entière.** La devise vit dans un cookie,
donc la page est personnelle, et un lien partagé ne montre pas la même chose à deux
personnes. C'est la conséquence assumée du choix de T2d ; le poids réel reste sur les
images, qui gardent le cache d'un an de la route de relais. Le jour où la liste coûte trop
cher, la sortie est de passer la devise dans l'URL, ce qui rend la page cacheable par
adresse.

**Le catalogue coûte environ 300 ms par page à cinquante mille produits, et c'est
structurel.** Mesuré par la revue de T2d, sur un jeu synthétique : le `GROUP BY p.id`
empêche de pousser le `LIMIT`, donc PostgreSQL agrège toute la table avant d'en garder
vingt-quatre ; la jointure latérale d'image tourne une fois par ligne candidate ; et
`unaccent` est `STABLE`, pas `IMMUTABLE`, donc aucun index d'expression n'est possible sans
l'envelopper. L'index `products_status_category_idx` n'apparaît dans aucun plan mesuré.

Rien de tout cela ne gêne un catalogue qui n'a pas encore de produits, et la sortie n'est
pas le `tsvector` que la spec évoque : il ne règle que le troisième point. Les deux premiers
tiennent à la forme de la requête, et se traitent le jour où le volume existe, pas avant.

**La requête du catalogue est la seule du dépôt écrite en SQL.** Prisma ne sait pas trier
une liste de produits par le minimum du prix de leurs variantes, et on a refusé de
dénormaliser une colonne pour contourner cette limite. Trois règles la rendent sûre :
valeurs paramétrées, tri choisi dans une table fermée, conditions assemblées par
`Prisma.join`. Y ajouter un filtre, c'est ajouter un fragment à `conditions`, jamais
concaténer une chaîne.

**Les dépôts ne reçoivent que des primitives, jamais un type du domaine.**
`packages/domain` dépend de `@clemperl/db`, donc l'inverse fermerait un cycle que Turbo ne
saurait pas ordonner. La page traduit les filtres avant d'appeler le dépôt. Même raison
pour la clé de combinaison, construite des deux côtés et épinglée par un test
d'intégration de `apps/api`, seul paquet qui voit les deux.

**L'ordre d'une collection est réécrit en entier à chaque mouvement.** `position` ne porte
AUCUNE contrainte d'unicité, et c'est délibéré : PostgreSQL vérifie une contrainte à chaque
instruction et non en fin de transaction, donc échanger deux rangs la violerait avant de la
rétablir. Chaque déplacement réécrit donc toutes les lignes de la collection, ce qui
referme au passage les trous laissés par un retrait. Une collection est un choix humain,
donc une poignée de lignes ; le jour où elle est longue, la sortie est un pas d'incrément
et des positions espacées. Voir la section 4 de la spec T2e.

**`collections` est un mot réservé dans le slug d'un produit.** Next résout un segment
statique avant un segment dynamique, donc un produit ainsi nommé serait masqué par
`/shops/<shop>/collections/<slug>` et répondrait 404 sans message. Le refus est porté par
`slugifyProductTitle`, et la migration vérifie qu'aucun produit existant ne porte ce slug,
en échouant si c'en est un.

**La page publique d'une collection n'a pas sa propre requête.** Elle ajoute un fragment à
`conditions()` du catalogue, et une jointure interne sur `collection_items` qui n'existe
que lorsqu'une collection est demandée. Recopier les conditions d'éligibilité créerait la
seconde vérité que la revue de T2d a déjà payée sur le décompte des devises. La jointure
est posée dans les DEUX requêtes, celle des lignes et celle du décompte.

**L'API passera en GraphQL, et ce sera sa propre tranche.** La raison n'est pas une
préférence de style : une application mobile React Native (Expo) est prévue, donc l'API
aura un consommateur hétérogène, ce qui n'est pas le cas aujourd'hui, où les trois
fronts Next attaquent PostgreSQL directement par leurs server actions, comme T0 l'a
décidé.

Cette tranche devra trancher une question de niveau T0 : les fronts Next cessent-ils de
parler à la base pour passer par l'API ? Deux chemins de lecture sur les mêmes données,
c'est exactement le risque que T0 nommait : la même règle écrite à deux endroits, qui
divergent en silence. La réponse conditionne le périmètre de la tranche, pas l'inverse.

T1b a tenu la décision de T1a : le rôle vendeur est une **relation**
(`vendor_members`), jamais une colonne du compte. La spécification T1a, section 1, porte
cette décision et sa raison ; `docs/superpowers/specs/2026-09-19-t1b-vendeurs-design.md`
porte le modèle qui en découle.

## Où en est le travail, au 2026-10-09

**T3, panier et commande, est à mi-chemin : quatre tâches sur huit.** Rien n'est commité
avant ce commit-ci, qui est le point de reprise. La branche est `feat/cart-and-orders`.

La spec est `docs/superpowers/specs/2026-10-09-t3-panier-commande-design.md`, le plan
`docs/superpowers/plans/2026-10-09-t3-panier-commande.md`. Le plan a été corrigé dix fois
pendant l'exécution, chaque correction venant d'un défaut trouvé à l'usage : il est à jour,
et les tâches 5 à 8 s'y lisent telles qu'elles doivent être faites.

### Ce qui existe

**Tâche 1.** Les quatre modèles `Cart`, `CartItem`, `Order`, `OrderItem`, l'enum
`E_ORDER_STATUS`, et la migration `20261009120000_cart_and_orders`, appliquée. Les
transitions de commande vivent en donnée dans `order-transitions.constant.ts`, avec
`canAdvanceOrder`, `advanceOrder` et `allowedOrderActions`.

**Tâche 2.** Les règles pures : `boundQuantity`, `variantLabel`, `groupByShop`, `sumLines`,
et `checkoutSchema`. Couverture du domaine à 100 % sur les quatre axes, 177 tests.

**Tâche 3.** `cart.repository.ts` : lire, ajouter, changer la quantité, retirer, remonter un
panier local. 19 tests d'intégration.

**Tâche 4.** `order.repository.ts` : valider un panier en commandes, une par boutique, dans
une transaction verrouillée ; lire et lister côté acheteur et côté vendeur ; faire avancer.
13 tests d'intégration.

Couche d'intégration complète : 163 tests, verte sur deux exécutions consécutives.
`lint` et `typecheck` à 15/15.

### Ce qui reste : les tâches 5 à 8

5. Le panier du navigateur, et le bouton qui remplace le `mailto:` de la fiche produit.
6. Les écrans acheteur : panier, validation, mes commandes.
7. Les écrans vendeur : liste, détail, avancement.
8. Les parcours Playwright, l'échauffement des routes, et cette passation.

**Deux manques du plan ont été trouvés par lecture avant d'attaquer la tâche 5, et ils ne
sont PAS encore corrigés dans le code.** Ils sont à traiter en premier.

`readPublishedProduct` ne rend pas l'identifiant des variantes : `catalog.repository.ts`
sélectionne `{ combinationKey, priceAmount }` et rien d'autre. Sans `id`, aucun ajout au
panier n'est possible depuis la fiche. Il faut ajouter `id: true` au select et au type
`IPublicProduct`.

La fiche produit affiche des produits sans image prête, que le panier refusera. La liste du
catalogue exige au moins une image `READY`, `eligibleVariantWhere` aussi, mais pas
`readPublishedProduct`. C'était sans conséquence tant que l'action était un `mailto:`, qui
marche sans image. Avec un bouton d'ajout, la fiche proposerait un achat que le serveur
refuse. Aligner les trois, donc rendre 404, après avoir vérifié qu'aucun parcours e2e ne
s'appuie sur une fiche sans image prête.

### Les décisions prises en route, et ce qu'elles coûtent si elles sont fausses

Elles vivaient dans un journal sous `.superpowers/`, que Git ignore. Les voici.

**`browser.ts` n'exporte pas les transitions de commande.** Ce fichier est le point d'entrée
sans dépendance serveur. `order-transitions.utils.ts` importe les erreurs du domaine, donc
`@clemperl/core`, donc nodemailer, donc `node:net`. L'exporter aurait fait échouer
l'assemblage Turbopack du premier composant client, en tâche 7, avec une erreur ne nommant
aucun maillon. Vérifié : l'écran vendeur qui construit les boutons est un composant SERVEUR.
Si un composant client en a besoin un jour, il exportera le fichier de constantes, qui
n'importe rien.

**`country` est mis en majuscules dans `checkoutSchema`**, comme
`application-submission.schema.ts` le fait déjà pour le même champ. Sans cela « be » et
« BE » s'enregistrent comme deux valeurs, et tout regroupement par pays se scinde en
silence.

**La borne de quantité reste une règle d'appelant.** `mergeLocalCart` ne borne pas lui-même :
`packages/db` ne peut pas importer `packages/domain`, qui dépend déjà de lui. C'est la
tâche 6 qui applique `boundQuantity`, et c'est écrit dans son code.

**`addCartItem` rejoue une fois sur collision d'unicité.** Deux ajouts simultanés sur un
panier inexistant tentent tous deux sa création, et le perdant recevait un `P2002` brut
jusqu'à l'écran. Un double-clic suffit à le produire : mesuré, 1 échec sur 5 avant la
reprise, 6 sur 6 au vert après.

**`mergeLocalCart` ne mappe que les deux erreurs qu'il connaît et laisse remonter le reste.**
Avant, une panne de base était annoncée à l'acheteur comme « cet article n'est plus
disponible », ce qui est faux et non actionnable. Désormais l'appelant garde le panier local
intact et la remontée se retentera.

**`placeOrders` refuse une ligne de panier sans libellé fourni** (`ERROR_LINE_MISSING`), au
lieu de figer une chaîne vide. Le figeage est définitif : une commande qui perd sa
déclinaison ne peut plus jamais dire ce qui a été acheté. Le refus porte sur l'ABSENCE de
l'entrée, jamais sur un libellé vide, qui est légitime pour un produit sans axe.

**Le contrôle du total passe AVANT celui des libellés**, et cet ordre compte. Le cas réel
d'une ligne manquante est un panier qui a grossi dans un autre onglet, lequel a forcément un
autre total : l'acheteur doit lire « le total a changé », qui est vrai et actionnable.

**`newReference` n'a aucune reprise sur collision.** `CMD-<année>-<six>` sur un alphabet de
32 caractères donne environ un milliard de tirages. Une collision lève un `P2002` et fait
échouer la validation. Accepté : une boucle de reprise est du code non testé sur le chemin
de l'argent, pour un événement négligeable à ce volume.

**Le panier d'un visiteur ne suit pas d'un appareil à l'autre.** Il vit dans son navigateur
et se perd si celui-ci est nettoyé. C'est le prix de n'avoir aucune table pour qui n'a pas de
compte, ni panier orphelin à balayer.

**Aucun stock, donc aucune réservation.** Deux acheteurs peuvent commander le dernier
exemplaire : les deux commandes existent, et c'est le vendeur qui en annule une.

### Deux pièges payés pendant T3, à porter dans `docs/pieges.md`

**`expect(...).rejects.toThrow(CONST)` compare par SOUS-CHAÎNE.** Le message d'une erreur de
validation Prisma cite la ligne de code fautive, laquelle contient le NOM de la constante.
L'assertion passe donc pour la mauvaise raison. Mesuré : la condition de devise retirée du
prédicat d'éligibilité, le test « boutique sans devise » restait VERT. Le remède est
`rejects.toMatchObject({ message: CONST })`, qui compare par égalité. Toutes les assertions
de refus de T3 l'emploient.

**Un `upsert` sur une colonne unique n'est pas atomique entre deux transactions.** Deux
appels concurrents tentent tous deux la création et le perdant reçoit un `P2002`. L'erreur
ne ressemble pas à une course et remonte telle quelle jusqu'à l'écran.

**Il n'y a AUCUNE configuration Prettier dans ce dépôt.** L'indentation à 4 espaces est tenue
à la main. Lancer `prettier` applique son défaut de 2 espaces : vérifié, à 4 espaces il
désapprouve déjà 2 fichiers existants sur 3, donc le lancer reformaterait du code écrit. Ne
pas le lancer.

### Un test instable, hors T3, à traiter

`apps/api/test/collection.int-spec.ts:582`, « ne change jamais le slug d'une collection qui
vient d'être publiée ». Il échoue environ une fois sur trois dans la couche complète, et
jamais lancé seul. Code de T2e, déjà fusionné, non touché par T3.

Le test épingle UNE issue d'une course réelle entre un renommage et une publication. Si le
renommage gagne, le slug devient le nouveau puis se fige, ce qui est une séquence légitime ;
le test exige que la publication gagne. C'est donc un test instable, et peut-être une course
de production à rendre déterministe. Le trancher demande de décider ce que `renameCollection`
doit garantir, ce qui est une question de conception pour T2e. Il fera rougir la CI par
intermittence d'ici là.

## Où en est le travail, au 2026-10-05

**T2d est fusionnée** par la PR #6, en rebase. La CI y est passée du premier coup, puis un
test instable de `catalog.spec.ts` a été corrigé par-dessus (`22bf142`).

**T2e est livrée, PR #7, CI verte du premier coup**, e2e comprise. Branche
`feat/product-collections`, un seul commit, 34 fichiers. Elle attend une relecture
humaine : CodeRabbit ne lit pas ce dépôt, public, sans demande manuelle.

Un vendeur crée une collection, y range des articles, choisit leur ordre à la main, et la
publie sous un slug propre à sa boutique.

Quatre constats mineurs de T2d restent ouverts, consignés dans son commit de revue :
décompte et liste hors transaction, pluriel ICU absent sur le nombre de résultats, lien
« suivante » au-delà de la millième page, et repli de casse limité à l'ASCII en
collation C.

**La suite bout en bout n'est pas verte d'un bloc sur cette machine, et ce n'est pas une
régression.** Deux exécutions, deux jeux d'échecs différents, aucun test tombant deux
fois. Chacun repasse isolément. La charge montait à 10,8 sur quatre cœurs : en mode
développement Next compile chaque route au premier accès, et deux workers Playwright
suffisent à saturer. C'est la raison d'être de la surcharge de production, décrite plus
bas.

**La CI a tranché : elle est passée d'un bloc.** Ce que la machine locale ne pouvait pas
établir, le runner dédié l'a fait. Devant une suite instable ici, ne pas s'acharner :
ouvrir la PR et lire le verdict de la CI coûte quatre minutes.

**Deux filets ne sont PAS tendus par défaut, et les deux se croient tendus.**

`ci.yml` se déclenche sur `pull_request` et sur les poussées vers `main`. Une branche
poussée seule n'est donc vérifiée par rien. Une tranche peut vivre plusieurs jours sur une
branche, être annoncée « vérifiée » sur la foi des couches lancées à la main, et n'avoir
jamais rencontré la CI. Ouvrir la PR est ce qui la déclenche.

**CodeRabbit ne relit rien automatiquement sur ce dépôt.** Son premier message sur chaque
PR le dit : « This repository does not receive automatic reviews because it has fewer than
10 stars. » Ce n'est pas un réglage du projet, c'est sa politique pour les dépôts peu
suivis. La revue se demande à la main, en commentant `@coderabbitai review` sur la PR, et
sans cela une PR reste ouverte sans qu'aucun relecteur externe la voie. Vérifié le
2026-10-05 sur la PR #7, ouverte la veille et jamais relue.

**Les conteneurs écrivent sous `root`, et `sudo` n'est PAS nécessaire pour le réparer.**
Une version antérieure de ce document conseillait `sudo rm -rf` pour
`apps/api/test/.fixtures-uid1000/`. C'est inutile : le conteneur qui a créé ces fichiers
peut aussi corriger leurs droits.

Le cas s'est reposé le 2026-10-04 avec une migration générée par Prisma, sortie en `uid 0`
et donc impossible à compléter à la main. Le remède, sans toucher à son propre système :

    docker compose --env-file .env -f docker/docker-compose.dev.yml \
      run --rm --no-deps --user root migrate \
      sh -c "chown -R 1000:1000 /app/packages/db/prisma/migrations" 

## Reprendre sur une autre machine

Le dépôt ne suffit pas : cinq choses n'y sont pas.

**Les ports publiés peuvent entrer en conflit avec un autre projet.** Depuis `456dfb9`, les
six ports du compose se lisent dans l'environnement, avec les valeurs habituelles par
défaut : `STOREFRONT_PORT`, `VENDOR_PORT`, `ADMIN_PORT`, `API_PORT`, `MAILPIT_PORT`,
`STORAGE_PORT`. Sur l'ancienne machine, un Grafana d'un autre projet occupait `3001`, donc
l'espace vendeur y tournait sur `3011`.

Ce choix ne voyage pas, puisqu'il vit dans `.env`. Sur la nouvelle machine, partir des
valeurs par défaut, et ne les changer que si un port est déjà pris. **Changer un port oblige
à changer l'URL correspondante** : le port dit à Docker où publier, l'URL dit au navigateur
où aller, et rien ne signale leur désaccord. Les deux blocs sont côte à côte dans
`.env.example` pour cette raison.

**`.env` n'est pas versionné.** Le partir de `.env.example`, puis :

- `DEV_HOST` porte l'adresse locale **de la machine**, au format sslip.io
  (`10-0-10-176.sslip.io` désigne `10.0.10.176`). Elle change avec le réseau. Elle ne
  sert qu'à joindre la stack depuis un autre appareil : un téléphone, pour vérifier la
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

**La base a besoin de l'extension `unaccent`.** La recherche du catalogue compare des
titres sans tenir compte des accents, et une migration de T2d pose l'extension. Elle est
livrée avec PostgreSQL, donc le conteneur du compose l'accepte sans rien installer. Sur une
base gérée qui refuserait `CREATE EXTENSION`, la migration échoue au démarrage : il faudrait
alors la faire poser par un administrateur, ou retomber sur un `ILIKE` sans `unaccent`, ce
qui rendrait « etole » incapable de trouver « Étole ».

**Les volumes Docker sont locaux.** La base de la nouvelle machine part vide. Le service
`migrate` du compose déploie les migrations avant que les applications démarrent, et
celles-ci l'attendent : `pnpm docker:up` suffit. Les comptes créés sur l'ancienne machine
ne suivent pas, et c'est sans conséquence, ce sont des comptes d'essai.

**Un `.env` déjà présent peut être PÉRIMÉ.** Le document couvrait la machine neuve, pas
la machine qu'on retrouve après quelques tranches. Une tranche qui ajoute une variable
l'écrit dans `.env.example` seulement : le `.env` local, lui, ne bouge pas. Le symptôme
est un conteneur qui sort en erreur sur un nom de variable : `PGRST_JWT_SECRET is
undefined` pour le stockage. Comparer avant de chercher ailleurs :

    comm -23 <(grep -oE "^[A-Z_]+=" .env.example | sort -u) <(grep -oE "^[A-Z_]+=" .env | sort -u)

**Un volume PostgreSQL peut aussi être périmé.** T1b a écrasé l'historique des migrations.
Un volume antérieur porte les anciens types, et `migrate deploy` échoue sur
`type "user_role" already exists` (P3018). La réponse est de supprimer le volume, il ne
contient que des comptes d'essai :

    pnpm docker:down && docker volume rm clemperl_dev_pg_data clemperl_dev_storage_data

**`pnpm install` seul ne rend pas les tests exécutables.** Les paquets consomment le
`dist` les uns des autres, pas leurs sources. Sur un clone neuf, `pnpm test` échoue sur
des symptômes qui n'ont rien à voir, par exemple `z.enum(E_CURRENCY)` recevant
`undefined` parce que le client Prisma n'est pas généré. Construire d'abord :

    pnpm install && pnpm turbo run build --filter="./packages/*"

**Les images Docker se périment en silence, et leurs symptômes ne parlent jamais de leur
âge.** Démarrer la stack sans `--build` après quelques tranches donne des conteneurs
construits avant les dépendances que le verrou attend désormais. Le 2026-10-04, le même
décalage a pris trois déguisements : une erreur de permissions `pnpm`
(`ERR_PNPM_PACKAGE_MANAGER_REMOVE_MODULES_DIR`), un conteneur `api` qui ne devenait jamais
sain, et des `fetch failed` vers des services absents. La commande qui tranche en deux
secondes :

    docker images --format '{{.Repository}}\t{{.CreatedSince}}' | grep clemperl

**Les navigateurs de Playwright ne sont pas dans le dépôt.** `pnpm install` ne les pose
pas : il faut `pnpm exec playwright install`. Sans eux, `pnpm test:e2e` échoue sur
« Executable doesn't exist », et le message accuse le premier test plutôt que
l'installation.

### Faire tourner la suite bout en bout

Deux bancs, et ils ne disent pas la même chose.

    pnpm docker:up && pnpm test:e2e     # développement, ce que la CI exerce
    pnpm e2e:up    && pnpm test:e2e     # build de production

Le premier doit être **vert en entier** : c'est celui de `ci.yml`. Le second ne l'est pas
encore : trois suites de T1a et T1b y butent sur la limitation de débit de Better Auth
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

### Dette laissée par les revues de T2d et T2e

Cinq points, tous nommés dans les messages de commit des tranches concernées, aucun ne
bloquant. Ils sont ici pour ne pas vivre uniquement dans l'historique.

**Le test d'éligibilité de la page de collection confond trois conditions.** Il oppose un
produit publié à un brouillon qui est aussi sans image et sans variante publiable, donc une
seule observation couvre les trois. Retirer `i.object_path IS NOT NULL` de `conditions()`
laisse la suite verte. Le cas réel existe : des produits publiés sans image prête, ceux
d'avant T2c et ceux dont la dernière image prête a été supprimée. Le test à écrire isole la
condition, et doit d'abord échouer quand on retire celle-ci.

**Deux listes de collections trient sans départage.** `listCollectionsForVendor` sur
`createdAt`, `listPublishedCollections` sur `publishedAt`, aucune colonne unique pour clore
l'ordre. Ni l'une ni l'autre n'est paginée, donc aucune ligne ne disparaît : seul l'ordre
peut osciller entre deux rendus pour des collections créées dans la même milliseconde.

**`readCollectionForVendor` ne filtre pas `product.deletedAt`.** Aucun code applicatif
n'écrit cette colonne aujourd'hui, donc rien ne se voit. Le jour où la suppression douce
d'un produit arrivera, l'écran vendeur montrera des articles supprimés comme les autres, et
un déplacement les réécrira en base.

**L'écran d'une collection charge tous les produits du vendeur dans un `<select>`**, sans
pagination, et rend trois formulaires par article. Une boutique à cinq mille articles charge
cinq mille options à chaque affichage et à chaque clic de flèche.

**Le décompte et la liste du catalogue sont deux instantanés.** Deux `$queryRaw` successifs
hors transaction : une publication entre les deux fait diverger `total` et `rows`. Un
`COUNT(*) OVER ()` dans la requête de liste supprimerait l'écart et un aller-retour.

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
développement.** Ils datent du proxy nginx retiré pendant T1a, les applications
publient désormais chacune leur port. Le proxy est conservé pour la production, mais son
gabarit est encore paramétré par `DEV_HOST`, qui est une variable de développement. À
requalifier quand la production se montera.

**T0, critère 8 : l'affichage sur téléphone n'a pas été constaté.** Il demande un
appareil réel sur le réseau local.

**Le premier administrateur naît par `/setup`, sans jeton.** La seule barrière est
l'absence d'administrateur en base : la page disparaît dès qu'il en existe un. La
fenêtre entre le déploiement et la première connexion est donc ouverte à qui connaît
l'URL. Décision explicite, prise en connaissance du risque : la refermer consiste à
ouvrir l'administration **immédiatement** après le déploiement, avant toute annonce
publique. Un jeton d'amorçage reste ajoutable sans toucher au reste.

**Le seed ne crée plus aucun utilisateur.** Le compte d'administration de T0 était une
ligne `users` sans ligne `accounts` : Better Auth n'avait aucun identifiant à vérifier,
donc personne ne pouvait ouvrir l'administration. Il a été retiré plutôt que doté d'un
mot de passe écrit dans le dépôt.

**Le chemin Supabase hébergé n'a jamais été joué.** Le développement fait tourner
`supabase/storage-api` en conteneur, donc le vrai client et les vraies routes, mais
aucun projet Supabase distant n'existe, et les clés de production restent à créer.

**Aucun balayage des objets orphelins.** Si une transaction échoue après un
téléversement, la compensation supprime les objets ; si cette suppression échoue à son
tour, l'objet reste. Un orphelin coûte de l'espace, pas de la correction. Le balayage
relève de T7, avec les traitements de fond.

**Les informations légales ne se corrigent nulle part.** Le vendeur les voit en lecture
et lit où écrire ; côté administration, le chemin reste la base. C'est une décision de
T2a, un administrateur les a validées contre les pièces téléversées, et
`updateShopProfile` ne les prend pas en paramètres, elles sont absentes de sa signature.
Ça devient un vrai manque le jour où une société change de forme juridique.

**Deux onglets qui enregistrent en même temps : la dernière écriture gagne.** Aucun
verrou optimiste. Accepté tant qu'une boutique n'a qu'un membre : rien ne crée le second
aujourd'hui. À rouvrir avec les invitations.

**La limitation de débit de Better Auth n'est pas déclarée, et elle mord en production.**
`/sign-up/email` accepte trois requêtes puis répond `429`. Le réglage est hérité du
framework, qui l'active en production et la désactive en développement, donc il ne se
voit qu'en production. Mesuré le 2026-09-21 : trois `200` puis trois `429` d'affilée.
Conséquence immédiate : `sign-up.spec.ts` et `vendor-application.spec.ts` échouent contre
la surcharge de production, qui crée des comptes plus vite qu'aucun humain. La CI n'est
pas concernée, elle tourne sur la stack de développement. Le corriger consiste à déclarer
la politique dans `packages/auth/src/config/auth.config.ts` plutôt qu'à l'hériter, et à
relever le plafond dans `docker-compose.e2e.yml`. À traiter comme une décision de
sécurité, pas comme un correctif de test : la règle sur « mot de passe oublié » mérite
notamment d'être choisie, pas subie.

**`pnpm e2e:up` rend la main avant que la stack soit prête.** Il attend le démarrage des
conteneurs, pas leur santé ni la fin de `storage-init`. La CI compense par une boucle
d'attente explicite (`ci.yml`) ; en local, rien. Lancer `pnpm test:e2e` dans la foulée
produit des échecs qu'on attribue au code.

**Le dépôt d'image passe par le serveur, et ce n'est pas le premier choix.** Le cadrage
avait retenu un dépôt DIRECT du navigateur au stockage, par URL signée, pour que les
octets ne traversent aucun serveur applicatif. À l'implémentation : `supabase/storage-api`
n'expose **aucun en-tête CORS** : sa source porte `// kong should take care of cors` et la
ligne d'enregistrement est commentée, le préflight `OPTIONS` répondant 404. Supabase le
fait tourner derrière Kong, qui s'en charge ; l'image seule, non.

Le dépôt direct redeviendra possible le jour où un proxy se place devant le stockage,
`docker/proxy/` existe et ne sert plus depuis T1a. En attendant, chaque photo traverse un
serveur Next, ce qui est exactement ce que le dépôt direct devait éviter.

**Aucune image n'est servie au public, et le stock n'existe toujours pas.** T2c livre les
photos jusqu'à l'espace vendeur et la route de relais ; la boutique publique qui les
affichera est T2d, le stock T3. Rien à l'écran ne prétend le contraire.

**Rien de publié n'est visible hors de l'espace vendeur.** Le catalogue public est T2d.
Publier ne fait aujourd'hui que changer un état et figer le slug.

**`ProductVariant.priceAmount` est un `Int`**, plafonné à 2 147 483 647 : 2,1 milliards de
francs CFA, environ 3,2 M€. Au-dessus de tout article des trois métiers visés. Le plafond
est un choix, écrit pour que le jour où il gêne, on sache qu'il a été vu.

**La devise d'une boutique se fige dès qu'un produit existe**, brouillon compris. Le
déblocage est la suppression du brouillon, et le message le dit. Accepté.

**L'arithmétique monétaire attend T3, et elle passera par une bibliothèque.** Aujourd'hui
`packages/core` porte `IMoney`, `CURRENCY_EXPONENT`, `parsePrice` et `formatPrice`, de
quoi ranger un entier et l'afficher, ce que T2b demande et rien de plus. **T2b ne fait
aucun calcul.**

Le calcul arrive avec le panier : additionner des lignes, appliquer une remise, et surtout
**répartir un total entre plusieurs boutiques sans perdre un centime**. C'est là que le
code monétaire écrit à la main se trompe, et là qu'une bibliothèque dédiée gagne son
droit d'entrée. `dinero.js` 2.0.2 est le candidat : ESM, sans aucune dépendance, et sa
représentation (unité mineure entière plus `{ code, base, exponent }`) est exactement
celle qu'on range déjà. L'adopter ne demandera donc **aucune migration**.

Deux choses resteront à notre charge quoi qu'il arrive : lire « 1 200,50 » depuis un
formulaire français et refuser une décimale en franc CFA : aucune bibliothèque monétaire
n'analyse une saisie ; et le formatage, qui n'est qu'un `Intl.NumberFormat`.

Le seul point d'attention : `docs/ce-qui-casse.md` dit qu'une dépendance ajoutée à
`@clemperl/core` fait que « le cœur métier cesse d'être importable partout ». Dinero étant
sans dépendance, il passe ce test, mais c'est une décision à prendre explicitement.

**Les clés étrangères de `ProductVariantValue` ne garantissent pas la cohérence
hiérarchique.** Elles valident chaque identifiant séparément : rien en base n'interdit une
variante du produit A portant un axe du produit B. Aucun appelant ne peut le produire :
`saveProduct` construit ces lignes depuis ses propres tables, dans la transaction d'un
seul produit. La fermer demande des clés composites sur trois tables et une migration.
C'est la bonne direction, et c'est un chantier.

**Les fronts n'ont pas `packages/db` monté, ils l'embarquent.** Le compose monte
`packages/core/src`, `packages/domain/src`, `packages/ui/src` et `packages/auth/src` dans
les trois applications Next, dont le `tsc --watch` recompile les `dist` à chaud. Pas
`packages/db` : tout changement du schéma ou d'un dépôt exige `pnpm docker:up`, et le
symptôme accuse une route sans rapport. Trois reconstructions l'ont coûté pendant la
seule tranche T2b.

Le monter demanderait `src`, `generated` et `prisma` ensemble, `generated` n'étant pas
dans `src`. C'est un changement de topologie à vérifier pour les quatre applications, et
il mérite son propre chantier plutôt qu'un coin de tranche.

**`@clemperl/core` n'a pas de sous-chemin navigateur.** `@clemperl/domain` en a un
(`/browser`) depuis T2b, parce qu'un composant client qui importe son barillet fait entrer
nodemailer dans le paquet. `core` a le même défaut latent : le premier composant client
qui y cherchera `TCurrency` ou `CURRENCY_EXPONENT` le rouvrira.

**Une ligne `PENDING` abandonnée ne se nettoie pas toute seule, mais plus rien ne
devrait en produire.** Trois portes ont été fermées : un job qui épuise ses tentatives
bascule en `FAILED` par le relais `failed` du worker ; un `add` qui lève parce que Redis
est injoignable marque la ligne avant de rendre la main ; une écriture de ligne qui échoue
après un envoi réussi supprime l'objet, donc ne laisse pas de ligne du tout.

Reste le cas où le processus meurt entre le commit de la ligne et l'empilage. Le vendeur
la voit et la supprime ; le balayage automatique reste T7, avec les traitements
planifiés.

**Pas d'AVIF.** L'original est conservé, donc il se rajoutera sans rien redemander aux
vendeurs. Trois largeurs en WebP suffisent à T2d.

**L'original est conservé mais JAMAIS servi.** Le relais n'accepte que les déclinaisons.
L'original revient du stockage avec le type que le navigateur du déposant avait déclaré,
et sharp décline un SVG sans se plaindre : le servir depuis la boutique exécuterait son
script sur l'origine qui porte le cookie de session. Le dépôt filtre d'ailleurs par liste
blanche, pas par préfixe `image/`.

**La route de relais ne vérifie NI le produit, NI sa publication, NI la boutique.** Les
photos d'un brouillon sont lisibles par qui connaît leur chemin. C'est une décision,
écrite en section 9 de la spec T2c : le `uuid` de 36 caractères joue le rôle d'un lien non
répertorié, et vérifier la publication coûterait une lecture en base par vignette : sur
une grille de quarante, quarante lectures, ce qui anéantirait la mise en cache qui
justifie le relais.

**Aucune collection de plateforme.** Une collection appartient à une boutique et ne peut
contenir que ses articles. Une collection transversale à plusieurs vendeurs, par exemple
« Soldes d'été » tous vendeurs confondus, demanderait un écran de curation côté
administration et surtout un arbitrage : qui y entre, sur quel critère, et que devient un
article mis en avant puis dépublié. Écartée au cadrage de T2e.

**Aucune collection construite par règle.** Pas de « tous les articles à moins de 50 € »
qui se remplirait tout seul. Une collection est un choix humain, et le rendre automatique
changerait sa nature.

**Il n'y a pas de page d'index des collections.** La vitrine d'une boutique liste les
siennes, et `/shops/<shop>/collections` répond 404. C'est correct : le segment existe dans
l'arbre des routes sans porter de page, et c'est la mécanique même qui oblige à réserver
ce mot dans le slug d'un produit.

**Aucun sélecteur de boutique.** Le schéma autorise plusieurs `vendor_members` pour un
même compte, mais rien ne les crée. Le sélecteur arrivera avec les invitations, pas
avant.

**Il n'y a qu'un thème, et c'est voulu.** Le clair est le seul thème servi, et il ne
dépend pas du réglage du système : une place de marché montre des produits dont les
photos sont préparées sur fond clair, et un thème sombre les dénature. Les règles
`data-theme="dark"` et `data-theme="system"` existent dans `packages/ui` et sont
correctes, mais aucune interface ne les pose : le sélecteur a été cadré puis écarté le
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
`ui`. L'écart de `core` hérité de T0 (le schéma d'environnement sans test) a été
comblé pendant T1b. Le cliquet monte, il ne descend jamais.

T2a a été la première tranche jouée contre un **build de production** (`pnpm e2e:up`).
Cette surcharge existait depuis T1b sans avoir jamais tourné, et elle a révélé quatre
défauts qu'aucune autre vérification ne voyait : le stockage refusé au démarrage, l'image
de l'API qui ne démarrait pas depuis T1a, une décision d'administration lue avant d'être
écrite, et la limitation de débit ci-dessus. Les trois premiers sont corrigés. La leçon
tient en une ligne : **une suite qui ne passe que contre un serveur de développement ne
dit rien de ce qui sera déployé.**

`docs/pieges.md` tient le registre des pièges déjà payés : vingt-neuf entrées, dont
quinze nées de T1b. Le lire avant de « corriger » du code qui paraît bizarre : chacune a
coûté une séance de débogage, et plusieurs décrivent un code qui a l'air faux et ne
l'est pas.
