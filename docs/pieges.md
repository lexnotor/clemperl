# Pièges que ce dépôt a déjà payés

Chaque entrée a coûté du temps de débogage réel. Ne pas les redécouvrir.

Ce fichier est l'endroit désigné pour l'historique que les commentaires de code
n'ont pas le droit de porter (voir « Commentaires : expliquer, jamais narrer »).

**Règles d'admission.** Une entrée n'est ajoutée qu'**après** que le piège a effectivement
coûté du temps — jamais un risque imaginé. Elle est écrite au moment où on en sort,
pendant qu'on a encore les preuves sous la main. Elle n'est jamais supprimée quand elle
est corrigée : la correction se décrit dans l'entrée, parce que le piège reste reproductible
par quiconque défait la correction sans savoir pourquoi elle est là.

**Anatomie d'une entrée**, dans cet ordre :

1. **Un titre en gras qui est une affirmation, pas un thème.** Pas « Attention aux codes
   de retour » mais « `$?` après `if ! cmd` est le statut de la négation, donc toujours 0 ».
   Le titre seul doit suffire à éviter le piège : c'est lui qu'on lit en diagonale.
2. **Le mécanisme** : pourquoi c'est vrai, en une ou deux phrases. Pas la conséquence — la
   cause.
3. **Le symptôme observé**, avec ses chiffres et sa date. « A tourné trois jours avec
   ~4 200 redémarrages » vaut mieux que « redémarrait souvent ».
4. **Ce qui rend le piège difficile à voir**, quand il y a lieu : la commande qui répond
   « tout va bien » alors que ça ne va pas, le test qui passe pour une mauvaise raison.
5. **Ce qui protège maintenant**, nommé précisément (fichier, fonction, réglage), pour que
   le lecteur qui envisage de le retirer sache ce qu'il retire.

**Deux exigences de forme.** Le fichier est **plat** : pas de catégories, pas de
sous-sections — il se lit au `grep`, et un plan de classement se périme. Et les chiffres
sont **mesurés**, jamais estimés : préciser quand et comment (« mesuré le <date>, les deux
chemins sur la même image »).

**Quand une entrée dit qu'une chose est délibérée, l'écrire comme un piège à part
entière.** Le cas le plus coûteux n'est pas le bug : c'est le code bizarre-mais-correct
qu'un ingénieur « corrige » en le voyant. Ces entrées-là disent explicitement : « la forme
X ne casse PAS aujourd'hui, et c'est le piège — ce qu'elle fait, c'est <conséquence
différée> ».

---

**Prisma 7 refuse `url` dans le bloc `datasource` : la connexion vit dans
`prisma.config.ts`, et le client passe par un adaptateur de pilote.**

Prisma 7 a retiré le moteur natif du chemin d'exécution SQL. Le client ne sait plus
ouvrir une connexion seul : il reçoit un adaptateur (`@prisma/adapter-pg`, qui pilote
`pg`) construit avec la chaîne de connexion. La CLI, elle, lit son URL dans
`prisma.config.ts`. Le schéma ne déclare donc plus que le `provider`.

Observé le 2026-09-18, en montant `@clemperl/db` : un schéma écrit dans la forme
antérieure fait échouer `prisma validate` avec `P1012 — The datasource property url is
no longer supported in schema files`. Trois autres écarts sont apparus dans la foulée :
le générateur s'appelle `prisma-client` et non plus `prisma-client-js` et exige un
`output` explicite ; le client est généré en TypeScript et non en JavaScript compilé ;
et le type `User` s'exporte depuis `generated/prisma/client`, pas depuis
`generated/prisma/models`, qui n'expose que des types internes (`UserModel`, agrégats).

Ce qui rend le piège coûteux : le message d'erreur nomme la ligne fautive mais pas la
forme correcte, et la documentation de Prisma nomme le fichier `prisma.config.ts` alors
que `prisma init` en génère un appelé `prisma7.config.ts`. Vérifié à l'exécution :
c'est bien `prisma.config.ts` que la CLI charge (« Loaded Prisma config from
prisma.config.ts »). Le moyen le plus rapide de trancher a été de lancer `prisma init`
dans un dossier vierge et de lire ce qu'il produit — l'outil documente sa propre version
mieux que la documentation en ligne.

Ce qui protège maintenant : `packages/db/prisma.config.ts` porte l'URL de Migrate,
`packages/db/src/client.ts` construit l'adaptateur et lève explicitement si
`DATABASE_URL` est absente, et `packages/db/src/index.ts` réexporte depuis
`generated/prisma/client` avec un commentaire disant pourquoi ce n'est pas `models`.
Revenir à un `url` dans le schéma casse `prisma validate` avant toute migration.

---

**Un package interne consommé par une application Node doit être compilé : le laisser en
TypeScript brut ne marche que pour les applications Next.**

Next transpile lui-même les packages listés dans `transpilePackages`, donc du TypeScript
source lui suffit. NestJS, lui, compile avec `tsc` puis exécute du JavaScript sur Node :
un `import "@clemperl/core"` qui pointe vers un `.ts` produit à l'exécution
`ERR_MODULE_NOT_FOUND` sur un fichier `.js` qui n'a jamais existé.

Observé le 2026-09-18, en montant `apps/api`. La chaîne d'échecs a pris quatre formes
successives, chacune masquant la suivante : NestJS 12 est publié en **ESM pur** et Jest
tourne en CommonJS (`Must use import to load ES Module`) ; swc ne parse pas les
décorateurs sans `jsc.parser.decorators` et `jsc.transform.legacyDecorator` (`Expression
expected` sur `@Controller`) ; `outDir` déclaré dans un tsconfig partagé est résolu
depuis le fichier qui le DÉCLARE, donc pointait vers `packages/tsconfig/dist` ; et le
client Prisma généré émet des imports sans extension, que `moduleResolution: nodenext`
refuse.

Ce qui rend le piège coûteux : **rien n'échoue à la compilation**. `tsc --noEmit` passe,
les tests unitaires passent, `nest build` produit un `dist/` d'apparence correcte.
L'erreur n'apparaît qu'au démarrage du binaire compilé — soit, en conditions réelles, au
déploiement.

Ce qui protège maintenant : `packages/core` et `packages/db` ont un
`tsconfig.build.json` et un script `build`, et leur `exports` pointe vers `dist/`, pas
vers `src/`. Turbo enchaîne les builds dans le bon ordre par `dependsOn: ["^build"]`.
Le générateur Prisma porte `importFileExtension = "js"` et `moduleFormat = "esm"`, sans
quoi son code généré ne compile pas sous `nodenext`. Les imports relatifs des packages
internes portent tous une extension explicite. `apps/api/jest.transform.ts` centralise
la configuration swc des quatre configurations Jest, décorateurs et conversion ESM→CJS
comprises.

`packages/ui` et `packages/i18n` restent délibérément sans build : seules les
applications Next les consomment, et elles les transpilent. Leur en donner un
n'apporterait rien et ajouterait une étape à chaque démarrage.

---

**Dans un conteneur, une sonde de santé doit viser `127.0.0.1` et non `localhost` : les
serveurs écoutent sur `0.0.0.0`, qui est IPv4 seulement.**

Dans les images `node:alpine`, `/etc/hosts` fait résoudre `localhost` vers `::1`. Un
serveur lancé avec `--hostname 0.0.0.0` — ou `app.listen(port, "0.0.0.0")` — n'écoute
que sur IPv4. La sonde tente donc une connexion IPv6 vers un port qui n'écoute pas
dessus, et reçoit un refus.

Observé le 2026-09-18, au premier `pnpm docker:up` de la stack complète : les quatre
applications sont restées `unhealthy` pendant trois minutes alors que leurs journaux
montraient un démarrage parfaitement normal — NestJS annonçant `Mapped {/health, GET}
route` et `Nest application successfully started`.

Ce qui rend le piège coûteux : le symptôme accuse l'application, jamais la sonde. Le
réflexe est de chercher pourquoi le service ne démarre pas, alors qu'il répond déjà. Le
test qui tranche en une commande :
`docker exec clemperl_dev_<service> sh -c 'wget -qO- http://127.0.0.1:<port>/health'` — s'il
répond alors que la sonde échoue, c'est la résolution de nom, pas le service.

Ce qui protège maintenant : les cinq `healthcheck` de `docker/docker-compose.dev.yml` interrogent
`127.0.0.1`, avec un commentaire en tête du fichier expliquant pourquoi. Remplacer par
`localhost` remet tous les services en `unhealthy` sans rien casser d'autre.

---

**`prisma migrate dev` est interactif dès qu'il détecte une opération destructrice : il
ne peut pas tourner dans un agent ou en intégration continue.**

Retirer une valeur d'énumération, supprimer une colonne ou une table déclenche un
avertissement, et Prisma exige alors une confirmation. En environnement non interactif
il n'échoue pas sur l'opération elle-même : il refuse de démarrer, avec
`Prisma Migrate has detected that the environment is non-interactive`. `--create-only`
ne change rien — l'avertissement suffit à bloquer.

Observé le 2026-09-18, en retirant `VENDOR` de `E_USER_ROLE` pendant T1a.

La voie non interactive est `prisma migrate diff`, dont **les options ont changé de nom
en Prisma 7** : `--from-url` n'existe plus, c'est `--from-config-datasource`, qui lit la
connexion depuis `prisma.config.ts` ; et `--to-schema-datamodel` est devenu
`--to-schema`. Le message d'erreur sur une option inconnue n'indique pas le nouveau nom,
il réaffiche l'aide.

La recette qui fonctionne, à rejouer telle quelle :

    horodatage=$(date -u +%Y%m%d%H%M%S)
    dossier="prisma/migrations/${horodatage}_<nom>"
    mkdir -p "$dossier"
    DATABASE_URL="<url>" pnpm exec prisma migrate diff \
      --from-config-datasource --to-schema prisma/schema.prisma --script \
      > "$dossier/migration.sql"
    DATABASE_URL="<url>" pnpm exec prisma migrate deploy

Troisième détail de la même famille : `prisma generate` **exige `DATABASE_URL`** alors
qu'il n'ouvre aucune connexion, parce que `prisma.config.ts` la résout par `env()`. Le
script `build` de `@clemperl/db` fournit donc une valeur de repli, cantonnée à cette
commande — toute commande touchant vraiment la base reçoit la vraie URL.

Ce qui protège maintenant : la recette ci-dessus, et le repli dans le script `build`.
Lancer `migrate dev` depuis un agent rend la main sans rien faire, ce qui se lit à tort
comme une migration déjà à jour.

---

**Turborepo filtre les variables d'environnement : une variable absente de `globalEnv`
n'atteint jamais la tâche, même si le conteneur la voit.**

Turbo 2 fonctionne en mode strict par défaut. Une tâche ne reçoit que les variables
déclarées dans `globalEnv` de `turbo.json`, ou dans le `env` de la tâche. Les autres
sont retirées de l'environnement du processus fils.

Observé le 2026-09-18, en ajoutant `BETTER_AUTH_SECRET`, `SMTP_URL` et `EMAIL_FROM` :
`docker exec ... env` les affichait toutes les trois, et l'API refusait pourtant de
démarrer en les déclarant absentes. Le conteneur les avait ; `turbo run dev` ne les
transmettait pas.

Ce qui rend le piège coûteux : les deux observations se contredisent en apparence, et
la plus visible — `env` dans le conteneur — est celle qui trompe. On cherche alors du
côté de `env_file` et du compose, qui sont corrects.

Le symptôme se reconnaît à ceci : l'erreur nomme précisément les variables, et elles
sont précisément celles qu'on vient d'ajouter sans toucher à `turbo.json`.

Ce qui protège maintenant : `turbo.json` déclare les variables d'authentification dans
`globalEnv`. Toute variable nouvelle consommée à l'exécution ou au build doit y être
ajoutée dans le même changement, sans quoi elle disparaît silencieusement.

---

**Un fichier `.env` valide pour Docker Compose n'est pas forcément sourçable par le
shell.**

Compose lit `CLE=valeur` littéralement. Le shell, lui, interprète les métacaractères :
`EMAIL_FROM=ClemPerl <bonjour@clemperl.test>` fait échouer `source .env` sur
`parse error near '\n'`, parce que les chevrons sont des redirections.

Observé le 2026-09-18, en ajoutant l'adresse d'expédition. Les scripts du dépôt et les
vérifications manuelles utilisent `source .env` : la ligne les casse toutes d'un coup,
avec un message qui ne nomme ni la variable ni le caractère fautif — seulement un
numéro de ligne.

Ce qui protège maintenant : les valeurs contenant des espaces ou des métacaractères
sont entre guillemets dans `.env.example`, avec un commentaire disant pourquoi. Le test
qui tranche en une commande : `bash -c 'set -a; source .env'`.

---

**Sans `baseURL`, Better Auth fabrique les liens de courriels à partir de l'adresse
d'écoute du processus : en conteneur, `https://0.0.0.0:3000`.**

La bibliothèque déduit l'origine de la requête ou de l'hôte d'écoute quand aucune
`baseURL` n'est configurée. Un serveur lancé avec `--hostname 0.0.0.0`, comme l'exige
l'exécution en conteneur, lui fait donc écrire `0.0.0.0` dans tous les liens qu'elle
envoie.

Observé le 2026-09-18, au premier courriel de vérification de T1a. Tout le reste
fonctionnait : le compte était créé, le courriel partait, il arrivait dans Mailpit avec
le bon sujet et le bon destinataire, et son contenu était bien formé. Seule l'URL était
inutilisable, et `email_verified` restait à faux sans qu'aucune erreur n'apparaisse
nulle part.

Ce qui rend le piège coûteux : rien n'échoue. Aucun journal, aucun code d'erreur,
aucune alerte — le seul symptôme est un utilisateur qui clique et n'obtient rien. En
production, il se manifesterait par des inscriptions qui n'aboutissent jamais, sans
trace côté serveur. Le test qui tranche : lire le lien du courriel reçu, pas seulement
vérifier qu'il est parti.

Ce qui protège maintenant : `packages/auth/src/config/auth.config.ts` fixe `baseURL` à
`NEXT_PUBLIC_STOREFRONT_URL` et déclare les trois fronts dans `trustedOrigins`. La
vérification de bout en bout du plan ouvre effectivement le lien reçu et contrôle que
`email_verified` bascule — elle ne se contente pas de constater l'envoi.

---

**Jest tourne en CommonJS contre un écosystème massivement ESM : `transformIgnorePatterns`
doit être VIDE, et tout critère plus fin se fait déborder.**

NestJS 12 et Better Auth sont publiés en ESM, tantôt en `.mjs`, tantôt en `.js` avec
`"type": "module"` dans leur manifeste. Jest ne sait pas les charger sans transformation,
et refuse avec `Must use import to load ES Module`.

Observé le 2026-09-18, en montant la couche E2E de l'API. Trois critères successifs ont
été débordés, chacun par la dépendance transitive suivante : nommer `@nestjs` a fait
apparaître `better-auth` ; y ajouter `better-auth` a fait apparaître `@better-auth/core` ;
passer à un critère par extension `.mjs` a fait apparaître `@noble/hashes`, qui publie de
l'ESM sous `.js`. La liste ne converge pas.

Ce qui rend le piège coûteux : chaque correction semble marcher — l'erreur change de
paquet — et donne l'impression d'avancer. On peut y passer une heure en croyant se
rapprocher.

Ce qui protège maintenant : `apps/api/jest.transform.ts` déclare
`transformIgnorePatterns: []`, donc rien n'est exclu. Le coût mesuré est faible : la
suite E2E tourne en 2,2 s, la suite unitaire en 2,8 s. Toute tentative de « n'exclure que
ce qu'il faut » redéclenchera la série.

Deux détails de la même famille, trouvés en chemin. Le transformeur doit couvrir
`.mjs` autant que `.ts` et `.js`. Et les fichiers `jest.config*.ts` vivent à la racine de
l'application, hors des dossiers montés en volume : sans les monter explicitement, une
modification n'atteint jamais le conteneur et l'on débogue une version qui n'y est pas.

---

**`@UseGuards(MonGarde)` fait construire le garde par NestJS : lui passer ses dépendances
par `useValue` sur le garde lui-même ne fonctionne pas.**

Un provider `{ provide: MonGarde, useValue: new MonGarde(dep) }` semble logique, mais
`@UseGuards` référence la classe, et Nest instancie alors la classe en résolvant son
constructeur — où il ne trouve rien. L'erreur est
`Nest can't resolve dependencies of the SessionGuard (?)`, et le `(?)` désigne
l'argument introuvable.

Observé le 2026-09-18, sur `SessionGuard`.

Ce qui protège maintenant : `apps/api/src/modules/auth/guards/session.guard.ts` déclare
un jeton `JETON_AUTH`, injecté par `@Inject`, et le module fournit
`{ provide: JETON_AUTH, useValue: auth }` puis le garde en provider ordinaire. Un test
de `session.guard.spec.ts` monte le garde PAR Nest, avec le jeton pour seule source de
sa dépendance : revenir à un `useValue` sur la classe le fait échouer ici, et non plus
au premier appel protégé en production.

---

**`collectCoverageFrom` compte comme code non couvert les fichiers de test des autres
couches, parce que `testMatch` ne les reconnaît pas.**

Jest retire de la couverture les fichiers qui correspondent au `testMatch` de la
configuration courante — et eux seuls. Les couches intégration et contrat sont
colocalisées dans `src/`, mais nommées `*.int-spec.ts` et `*.contract-spec.ts` : la
configuration unitaire, qui cherche `*.spec.ts`, ne les voit pas comme des tests. Le
motif `src/**/*.ts` les ramasse alors comme du code de production jamais exécuté, et la
couverture s'effondre — 94 % tombés à 63 % à l'ajout d'un seul fichier d'intégration.

Le symptôme trompe : le cliquet crie au moment où l'on ajoute des tests.

Observé le 2026-09-18, à l'arrivée de la première suite d'intégration.

Ce qui protège maintenant : `apps/api/jest.config.ts` exclut `src/**/*-spec.ts`. Le
tiret est la charnière — il attrape `int-spec` et `contract-spec` sans toucher aux
`.spec.ts` unitaires, que Jest écarte déjà tout seul.

---

**Rien ne déployait les migrations : ce qui marchait tenait à une commande jouée une
fois, à la main, sur une seule machine.**

`pnpm docker:up` démarrait PostgreSQL et les quatre applications, et aucune étape
n'appliquait le schéma. Sur la machine de développement, les migrations avaient été
jouées à la main pendant la tranche, une fois ; le volume les gardait, et tout
fonctionnait. Sur un volume neuf — un poste qui démarre, un runner de CI — la table
`user` n'existe pas, toute inscription échoue, aucun courriel ne part, et la suite
Playwright tombe sur des messages qui parlent de Mailpit.

Le symptôme accuse la mauvaise couche. Rien dans l'erreur ne nomme la migration.

Observé le 2026-09-18, à la première exécution de la CI sur un dépôt fraîchement cloné.

Ce qui protège maintenant : un service `migrate` dans `docker/docker-compose.dev.yml`
joue `prisma migrate deploy` puis s'arrête, et les quatre applications l'attendent par
`service_completed_successfully`. La CI ne fait rien de particulier : elle monte le
compose comme n'importe qui.

---

**Le client Prisma se construisait à l'import, et `next build` échouait faute de
`DATABASE_URL` — alors que le build n'ouvre aucune connexion.**

`next build` charge le module de chaque page pour y lire sa configuration de rendu
(`export const dynamic`, `revalidate`…). Une page qui importe `@clemperl/auth` importe
le client Prisma, et un client construit au moment de l'évaluation du module réclame la
variable là où aucune requête n'est faite. L'erreur est
`Failed to collect configuration for /`, et sa cause, deux lignes plus bas, la nomme.

Les images Docker ne le voyaient pas : leurs Dockerfiles passent un `DATABASE_URL` de
construction pour satisfaire `prisma generate`, qui masquait le problème.

Observé le 2026-09-18, sur `@clemperl/admin#build` en CI.

Ce qui protège maintenant : `packages/db/src/client.ts` expose un proxy qui construit le
client à la PREMIÈRE UTILISATION. La variable reste obligatoire — l'erreur arrive
simplement quand on s'en sert. `client.spec.ts` tient les deux moitiés : l'import passe
sans la variable, le premier accès échoue avec elle absente.

---

**`dependsOn: ["^build"]` construit les dépendances d'un package, jamais ce que le
package génère pour lui-même.**

`@clemperl/db` se type contre `generated/prisma/`, produit par `prisma generate` — que
seul son propre `build` lançait. Son `typecheck` ne dépendant que de `^build`, il
s'exécutait sur un dossier absent et échouait par `TS2307: Cannot find module
'../generated/prisma/client'`. En local, le dossier existait déjà : la dépendance
manquante ne se voit que sur un dépôt fraîchement cloné.

Observé le 2026-09-18, sur `@clemperl/db#typecheck` en CI.

Ce qui protège maintenant : `db:generate` est une tâche Turbo à part entière, avec
`generated/**` en sortie, et `@clemperl/db#typecheck` comme `@clemperl/db#build` en
dépendent explicitement.
