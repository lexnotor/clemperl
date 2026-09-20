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
des comptes n'existe pas, toute inscription échoue, aucun courriel ne part, et la suite
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

---

**Les migrations de `supabase/storage-api` référencent le rôle `postgres` en dur, et
`DB_SUPER_USER` ne couvre pas ce cas.**

La migration `storage-schema` du service écrit des `GRANT` vers un rôle nommé
littéralement `postgres`. Le réglage `DB_SUPER_USER` sert aux migrations qui le lisent,
pas à celles qui codent le nom en dur — et notre instance PostgreSQL a `clemperl` pour
superutilisateur, pas `postgres`.

Observé le 2026-09-19, image `supabase/storage-api:v1.79.4`, à l'ajout du service au
compose. Le conteneur démarrait puis restait `unhealthy` indéfiniment ; le message
n'apparaissait qu'au fond d'un log JSON d'une seule ligne de 6 000 caractères, sous
`"Reason: role \"postgres\" does not exist"`. `docker compose ps` se contentait
d'afficher `unhealthy`, sans jamais dire pourquoi.

Ce qui protège maintenant : `docker/postgres/init/10-storage.sql` crée le rôle
`postgres` et lui donne la base `storage`, et le service pointe dessus. Ce script n'est
joué qu'à la **création du volume** : le modifier sans `down -v` ne produit aucun effet,
et laisse croire que la correction ne marche pas.

---

**Créer un bucket qui existe déjà renvoie HTTP 400, pas 409 : le 409 n'est que dans le
corps de la réponse.**

`POST /bucket` sur un nom déjà pris répond avec le statut HTTP `400` et un corps
`{"statusCode":"409","code":"BucketAlreadyExists"}`. Un amorçage idempotent qui teste
`response.status === 409`, ou même `response.ok`, conclut à un échec.

Mesuré le 2026-09-19 sur `supabase/storage-api:v1.79.4`, en rejouant la création du
bucket `vendor-documents`.

Ce qui rend le piège difficile à voir : le premier démarrage d'une stack neuve réussit
toujours. L'échec n'apparaît qu'au **second** `pnpm docker:up`, c'est-à-dire chez
quelqu'un d'autre, ou le lendemain.

Ce qui protège maintenant : le service `storage-init` du compose teste
`code === "BucketAlreadyExists"` dans le corps, et non le statut HTTP.

---

**Un littéral de gabarit JavaScript dans une commande de `docker-compose.yml` est
interpolé par Compose avant d'atteindre Node.**

Compose substitue `${...}` dans tout le fichier, y compris à l'intérieur d'une commande.
Une ligne `node -e "...'Bearer ${cle}'..."` voit donc `${cle}` remplacé par une chaîne
vide, et Compose avertit « The "cle" variable is not set » — un avertissement, pas une
erreur : le conteneur démarre et échoue plus loin, à l'authentification.

Observé le 2026-09-19, en écrivant le service `storage-init`.

Ce qui protège maintenant : ce script n'emploie que de la concaténation
(`'Bearer ' + cle`). La règle vaut pour **toute** commande inline d'un compose, pas
seulement celle-ci.

---

**`STORAGE_S3_BUCKET` sert de racine de chemin même avec le backend fichier, et son
absence produit un répertoire nommé `undefined`.**

Le nom trahit l'héritage S3 du service : la variable désigne la racine des objets quel
que soit le backend. Sans elle, le chemin sur disque devient
`/var/lib/storage/undefined/<tenant>/<bucket>/…`.

Observé le 2026-09-19, en inspectant le volume après le premier téléversement réussi.

Ce qui rend le piège difficile à voir : **rien ne casse.** Le téléversement, la
relecture et les URL signées fonctionnent parfaitement avec `undefined` dans le chemin.
Ce n'est découvert qu'en regardant le disque — donc, en général, jamais.

Ce qui protège maintenant : `STORAGE_S3_BUCKET: clemperl` et `TENANT_ID: clemperl` dans
le service `storage` du compose.

---

**Les tables sont au PLURIEL depuis le 2026-09-19, et le commentaire qui imposait de
quoter `"user"` a disparu avec elles.**

T0 avait décidé le singulier. T1b l'a renversé pendant que le coût était nul : quatre
tables, aucune donnée réelle, aucun environnement persistant. Le renommage s'est fait en
changeant les `@@map` **puis en régénérant** les migrations, jamais en réécrivant leur
SQL à la main — Prisma dérive les noms d'index et de contraintes du nom de table mappé,
et une réécriture manuelle aurait produit `users` avec `user_pkey`, une incohérence que
personne ne remarque jusqu'au jour où elle gêne.

Le piège n'est pas le renommage : c'est que **modifier une migration déjà appliquée fait
échouer le prochain `migrate deploy` sur une somme de contrôle divergente**, stockée dans
`_prisma_migrations`. Toute base de développement existante doit être détruite — et
`pnpm docker:down` ne supprime PAS les volumes. La commande est
`docker compose --env-file .env -f docker/docker-compose.dev.yml down -v`.

Bénéfice collatéral, à ne pas défaire : `user` est un mot réservé SQL, `users` ne l'est
pas. Les requêtes écrites à la main n'ont plus à le quoter.

Ce qui protège maintenant : le commentaire d'en-tête de `packages/db/prisma/schema.prisma`
énonce la règle au pluriel et rappelle que les types enum restent au singulier.

---

**`pnpm --filter @clemperl/db db:migrate` ne peut pas fonctionner depuis l'hôte : le
service `postgres` ne publie aucun port.**

Le script existe dans `packages/db/package.json` et se lit comme la façon normale de
créer une migration. Mais `DATABASE_URL` pointe vers l'hôte `postgres`, un nom qui
n'existe que sur le réseau Docker : depuis la machine, il ne résout pas, et l'adresse IP
du conteneur n'est pas routée non plus. Le service est délibérément non publié —
contrairement à Redis, Mailpit et aux quatre applications.

Constaté le 2026-09-19, en régénérant les migrations pour le passage au pluriel. `curl`
et une ouverture TCP directe sur `172.20.0.2:5432` échouent toutes deux.

Ce qui rend le piège difficile à voir : `migrate deploy` marche, lui — c'est le service
`migrate` du compose qui le joue, **à l'intérieur** du réseau. Seule la CRÉATION d'une
migration, qui se fait à la main, se heurte au mur.

Ce qui marche : un conteneur jetable sur le réseau du compose, avec le dépôt monté et
les dépendances déjà installées sur l'hôte.

    docker run --rm --network clemperl_dev_default \
      --user "$(id -u):$(id -g)" -v "$PWD":/app -w /app/packages/db \
      -e DATABASE_URL="postgresql://clemperl:clemperl@postgres:5432/clemperl" \
      -e HOME=/tmp \
      node:24-bookworm-slim ./node_modules/.bin/prisma migrate dev --name <nom>

`--user` n'est pas décoratif : sans lui, les fichiers de migration créés appartiennent à
`root` sur l'hôte et ne peuvent plus être édités. `node:24-bookworm-slim` et non
`-alpine` : les moteurs Prisma installés sur l'hôte sont liés à la glibc, et musl les
refuse.

---

**L'index unique partiel de `vendor_applications` est écrit à la main dans la migration,
et `prisma migrate dev` ne cherche pas à le supprimer.**

Prisma ne sait pas déclarer `UNIQUE (colonne) WHERE condition` dans un schéma. La
contrainte « un seul dossier ouvert par candidat » est donc du SQL ajouté à la fin du
fichier de migration, invisible depuis `schema.prisma`. La tentation, en la découvrant,
est de la retirer pour « laisser Prisma gérer ». Ce serait rouvrir la porte à deux
dossiers ouverts pour un même compte, créés par deux onglets — et aucune vérification
applicative ne gagne cette course.

La détection de dérive compare le schéma à une base fantôme où les migrations sont
rejouées : l'index y existe aussi, donc Prisma répond « Already in sync » et ne propose
rien. Vérifié en relançant `migrate dev` après application.

Ce qui protège maintenant : le commentaire en tête du bloc SQL, dans
`packages/db/prisma/migrations/20260919105104_vendor_applications/migration.sql`, et le
test d'intégration qui rejoue deux dépôts simultanés.

---

**Un fichier couvert par la suite d'intégration compte pour zéro dans le rapport Vitest,
et fait donc échouer le plancher du package.**

Les deux couches ont deux exécuteurs : Vitest mesure les tests unitaires du package,
Jest fait tourner l'intégration dans le conteneur `api`. Un repository de
`@clemperl/db`, éprouvé uniquement contre un vrai PostgreSQL, apparaît à 0 % côté
Vitest — et un plancher à 100 % refuse le run.

Observé le 2026-09-19, à l'ajout de `dossier-vendeur.repository.ts` : cinq tests
d'intégration au vert, et `pnpm test` en échec sur « Coverage for statements (32.5%)
does not meet global threshold (100%) ».

Le réflexe est de baisser le plancher. C'est exactement ce que le cliquet interdit, et
ça détruirait aussi l'exigence sur les fichiers réellement couverts par Vitest. La
sortie est d'exclure ces fichiers du rapport **en disant où ils sont couverts**, jamais
de céder sur le chiffre.

Ce qui protège maintenant : `src/repositories/**` est dans `coverage.exclude` de
`packages/db/vitest.config.ts`, avec le commentaire qui renvoie à la couche
d'intégration. Tout fichier ajouté là doit avoir sa suite d'intégration, sinon il n'est
couvert nulle part et plus rien ne le signale.

---

**Un package qui touche un global de Node doit déclarer `types: ["node"]` : la `lib`
ES2023 du tsconfig de base ne connaît ni `process`, ni `console`, ni `Blob`.**

`@clemperl/tsconfig/base.json` fixe `lib: ["ES2023"]` et ne déclare aucun `types`.
L'inclusion automatique des `@types/*` ne suffit pas de façon fiable dans ce workspace :
un package qui écrit `process.env` compile tant qu'il hérite des types de la racine, et
cesse de compiler dès qu'il possède son propre `node_modules/@types`. `apps/api` porte
déjà `"types": ["node", "jest"]` pour cette raison.

Observé le 2026-09-19, à l'ajout de l'accès au stockage dans `@clemperl/core` : six
erreurs `TS2591: Cannot find name 'process'` et `TS2304: Cannot find name 'Blob'`.

**Ce qui a rendu le piège coûteux, et qui est le vrai sujet : le cache de Turbo l'a
masqué.** `pnpm lint`, `pnpm typecheck` et `pnpm test` sont restés verts, parce que
`@clemperl/core#build` était un succès en cache, antérieur au fichier fautif. La faute
n'est apparue qu'au `docker compose build`, où aucun cache n'existe — donc loin du
changement, et attribuée d'abord à Docker.

Devant une erreur de compilation qui n'apparaît qu'en conteneur, **reproduire d'abord
hors cache** : `pnpm --filter <package> exec tsc -p tsconfig.build.json`. Si elle se
reproduit, le conteneur n'y est pour rien.

Ce qui protège maintenant : `packages/core/tsconfig.json` déclare `types: ["node"]` et
`@types/node` figure dans ses propres `devDependencies`. Tout package qui se met à
utiliser un global de Node doit faire les deux.
