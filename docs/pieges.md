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

Observé le 2026-09-19, à l'ajout de `vendor-application.repository.ts` : cinq tests
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

---

**Une définition `paquet#tâche` dans `turbo.json` REMPLACE la tâche générique au lieu de
la compléter : `@clemperl/db#build` perdait ainsi ses `outputs`, et ne mettait donc rien
en cache.**

La tâche `build` générique déclare `outputs: ["dist/**"]`. L'entrée
`"@clemperl/db#build"`, écrite pour ajouter une dépendance à `db:generate`, écrase
entièrement cette définition — `outputs` compris. La tâche s'exécute correctement, mais
son résultat n'entre jamais dans le cache.

Le piège ne se déclenche qu'au **succès** du cache. Cache froid, la tâche tourne pour de
vrai et `dist/` existe : tout va bien. Cache chaud, Turbo annonce `cache hit, replaying
logs`, ne restaure rien, et `packages/db/dist` reste absent.

Observé le 2026-09-20 en CI. L'erreur n'accuse jamais le coupable : elle sort du
storefront, en `Module not found: Can't resolve '@clemperl/db'`, à dix fichiers de la
cause. Reproduit localement en trois commandes — construire, supprimer `dist`,
reconstruire : l'empreinte `236793e26dd1a27c` était identique à celle de la CI.

Ce qui rend le piège durable : la CI restaure le cache par la clé de repli
`turbo-build-`, donc n'importe quel run précédent. Une machine de développement qui a
déjà construit une fois ne le reverra jamais.

Ce qui protège maintenant : `@clemperl/db#build` déclare ses `outputs`. Toute entrée
`paquet#tâche` doit réécrire **l'ensemble** de ce que la tâche générique donnait, jamais
le seul champ qu'on veut changer. `@clemperl/db#typecheck` a repris `^build` pour la
même raison : l'override l'avait fait disparaître, et le typage partait sans que ses
dépendances soient construites.

---

**Renommer des identifiants au `sed` détruit les commentaires et les libellés français,
sans que rien ne le signale.**

Le dépôt mêle délibérément deux langues : le code en anglais, les commentaires et les
libellés en français. Un remplacement global de `mot` ou d'`adresse` traverse donc les
deux — un commentaire « soumettait le mot de passe en GET » devient « soumettait le
newPassword de passe en GET », et une assertion sur « Vérifiez votre adresse » cesse de
correspondre à l'écran.

Observé le 2026-09-19, en passant les identifiants à l'anglais : `sed` sur `\bmot\b` et
`\badresse\b` a corrompu quatre commentaires et deux assertions de `e2e/sign-up.spec.ts`.

Ce qui rend le piège difficile à voir : **la compilation reste verte.** Un commentaire
abîmé ne casse rien, et une assertion qui ne correspond plus ne se voit qu'en jouant
Playwright, c'est-à-dire bien plus tard.

Ce qui protège maintenant : rien d'automatique. Un renommage se fait par réécriture du
fichier, ou par un `sed` dont chaque motif est un nom de symbole — jamais un mot isolé
qui existe aussi en prose française.

---

**Les utilitaires Tailwind employés par `@clemperl/ui` ne sont pas générés si les sources
ne sont pas déclarées : la page se rend, les classes sont sur les éléments, et elles ne
correspondent à rien.**

La détection automatique des sources part du fichier CSS. Les applications l'atteignent
par `@clemperl/ui/styles/globals.css`, donc par un lien de `node_modules` — que Tailwind
ignore. Le balayage retombe alors sur l'arborescence de l'application et rate une partie
des composants du package.

Observé le 2026-09-19, au premier rendu du design : le bouton principal sortait sans
fond, sans hauteur et sans espacement. Dans la feuille servie, **aucun utilitaire `bg-*`
ni `h-*` n'existait**, alors que `text-muet` et `border-bordure` y étaient — deux classes
du même package, dans un fichier voisin.

Ce qui rend le piège coûteux : rien n'échoue. Le HTML porte bien
`class="bg-texte h-11 …"`, aucune erreur n'apparaît en console, et le test de fumée qui
vérifie que le bouton « est visible » passe parfaitement — un bouton sans style reste
visible. Seule une capture d'écran, ou un `getComputedStyle`, le montre.

Ce qui protège maintenant : `packages/ui/src/styles/globals.css` déclare ses sources par
`@source`, pour le package et pour les applications. Ne pas les retirer en supposant que
la détection automatique suffit.

---

**Un fichier `"use server"` ne peut exporter QUE des fonctions asynchrones : toute
constante qu'on y met arrive `undefined` au composant client.**

Le fichier de server actions est traité comme une frontière réseau. Ce qui en sort est
transformé en référence appelable ; une valeur ordinaire n'a pas de représentation dans
ce protocole, et le client reçoit `undefined`.

Observé le 2026-09-19, sur l'amorçage de l'administration : `INITIAL_SETUP_STATE`
exporté depuis `actions.ts`, puis passé à `useActionState`, produisait
`TypeError: Cannot read properties of undefined (reading 'length')` au premier rendu.

Ce qui rend le piège coûteux : **rien n'échoue avant l'exécution.** Le typage est
satisfait des deux côtés, `lint` et `typecheck` passent, et la page ne casse qu'au
rendu — avec une erreur qui désigne l'endroit où la valeur est lue, jamais celui d'où
elle vient.

Ce qui protège maintenant : les états initiaux vivent dans un fichier
`types/*.interface.ts` à côté de l'action, jamais dans le module `"use server"`.

---

**`revalidatePath` sur une route à segment dynamique exige le MOTIF de route et le
paramètre `type` : une adresse littérale ne rafraîchit rien, et rien ne le signale.**

La boutique monte ses pages sous `/[locale]/…`, même quand l'URL visible n'a pas de
préfixe. `revalidatePath("/become-a-vendor")` ne correspond donc à aucune route, et la
revalidation porte dans le vide. La forme correcte est
`revalidatePath("/[locale]/become-a-vendor", "page")`.

Observé le 2026-09-19, sur le dépôt d'un dossier vendeur : l'action répondait `200`, le
dossier était bien écrit en base, aucune erreur n'apparaissait nulle part — et
l'utilisateur revoyait son formulaire vide. Son réflexe suivant, renvoyer le formulaire,
se serait heurté à « vous avez déjà une demande en cours d'examen ».

Ce qui rend le piège coûteux : **aucun signal.** Pas d'exception, pas de log, pas
d'avertissement au build ; la fonction accepte n'importe quelle chaîne. Seul un test de
bout en bout qui vérifie ce que la page affiche APRÈS l'action le révèle.

Ce qui protège maintenant : le test `e2e/vendor-application.spec.ts` attend le nouvel
état de la page après chaque décision, et pas seulement l'absence d'erreur.

---

**`getByLabel` d'un contrôle enveloppé par son `<label>` matche aussi le CONTENU d'un
`<textarea>` voisin : un `defaultValue` rendu par le serveur devient une partie du
libellé.**

Playwright calcule le texte d'un libellé enveloppant à partir du `textContent` du
`<label>`. Pour un `<textarea>`, React rend `defaultValue` comme **contenu de l'élément**,
pas comme attribut — le `<label>` contient donc « Description » suivi du texte saisi par
l'utilisateur. Et `getByLabel` cherche par sous-chaîne.

Observé le 2026-09-20 sur la fiche boutique. La description valait « Joaillerie
artisanale, pièces uniques montées à la main. » et
`page.getByLabel("Joaillerie").uncheck()` a levé une violation de mode strict : deux
éléments, la case à cocher « Joaillerie » et le textarea de description.

Ce qui rend le piège difficile à voir : **le même sélecteur passe sur un formulaire
vide.** Au dépôt du dossier, le test remplit la description par `.fill()`, qui écrit la
*propriété* `value` et laisse le `textContent` vide — aucune ambiguïté. Le piège
n'apparaît que sur une page rendue depuis la base, donc seulement à la seconde visite,
ce qui le fait ressembler à une régression de la page plutôt qu'à un défaut du sélecteur.

Ce qui protège maintenant, depuis T2b : **la cause est fermée**, pas contournée.
`Field` et `TextAreaField` n'enveloppent plus leur contrôle — le libellé est associé par
`htmlFor`, comme `FileField` le faisait déjà seul dans le paquet, et l'indication est
passée en `aria-describedby`. Le nom accessible vaut donc exactement le libellé, quelle
que soit la valeur affichée.

Ce qui l'avait rouvert : en T2b, un champ « Prix » portant une indication s'est retrouvé
nommé « PrixLe prix de vente, dans la devise de votre boutique. », et
`getByRole("textbox", { name: "Prix", exact: true })` ne trouvait rien. Le contournement
de T2a — viser par `getByRole` — ne suffisait pas, parce que le nom accessible était
lui-même pollué.

`packages/ui/src/components/field.spec.tsx` tient la propriété : un test vérifie que le
nom ne contient ni l'indication ni la valeur. `CheckboxField` enveloppe encore, et c'est
sans conséquence — une case n'a ni indication ni contenu.

---

**Tailwind 4 accepte `classe-[--variable]` sans rien dire, et produit une déclaration
invalide que le navigateur jette.**

En Tailwind 3, `accent-[--color-texte]` désignait la variable CSS. En Tailwind 4, les
crochets ne portent plus qu'une valeur *littérale*, et la variable se passe entre
parenthèses. Compilé avec le Tailwind 4.3.3 du dépôt :

    accent-[--color-texte]   →  accent-color: --color-texte       ✗ invalide, ignorée
    accent-(--color-texte)   →  accent-color: var(--color-texte)  ✓
    accent-texte             →  accent-color: var(--color-texte)  ✓

Rien n'échoue : ni le build, ni le lint, ni un test. La classe est bien émise, la règle
bien écrite, et seul le navigateur la rejette en silence. On ne s'en aperçoit qu'en
regardant l'élément — ou jamais, si l'apparence par défaut passe pour voulue.

Observé le 2026-09-21, sur quatre occurrences dont trois vivaient là depuis T1b.

Ce qui protège maintenant : quand le jeton vient de `@theme`, l'utilitaire généré
(`accent-texte`, `rounded-controle`) est la forme à écrire — elle est plus courte et ne
peut pas se tromper de syntaxe. Réserver `(--variable)` aux variables qui ne sont pas des
jetons de thème.

À noter pour qui lirait ce registre à rebours : les trois `rounded-[--radius-controle]`
n'ont pas été réparées mais **supprimées**. Les contrôles sont carrés par décision de
design — les rendre ronds aurait « corrigé » le code en cassant l'intention.

---

**Les fronts embarquent `packages/db` dans leur image ; un changement de schéma ne les
atteint qu'après reconstruction — et le symptôme accuse une route sans rapport.**

Le compose monte `packages/db/src` et `packages/db/prisma` sur le conteneur de l'API
seulement. Les trois applications Next les reçoivent **compilés, au build de l'image**.
Après un `prisma migrate deploy` et un `prisma generate` joués dans le conteneur de
l'API, la base est à jour, l'API voit le nouveau client, et les trois fronts continuent
de servir l'ancien.

Ce qu'on lit alors n'évoque en rien un schéma :

    The export E_CURRENCY was not found in module packages/db/dist/generated/prisma/enums.js
    GET /api/health 500

Toute l'application tombe, y compris sa sonde de santé, parce qu'un module importé en
chaîne ne résout plus. Le premier test qui échoue est celui de l'inscription, qui ne
reçoit aucun courriel.

Observé le 2026-09-21, en ajoutant `E_CURRENCY` au schéma pendant T2b.

Ce qui protège maintenant : rien dans le code — c'est une propriété du montage. Après
toute modification de `schema.prisma`, relancer `pnpm docker:up`, qui reconstruit les
images. Migrer la base sans reconstruire ne suffit que pour l'API.

---

**Deux suites d'intégration qui nomment leurs données pareil se percutent, et la panne
s'affiche dans la suite VOISINE.**

Les suites partagent une base et un run. Deux fichiers qui créent leurs boutiques en
`atelier-${counter}` avec chacun leur compteur produisent les mêmes slugs, et
`Vendor.slug` est unique. Le fichier qui échoue n'est pas forcément le dernier écrit :
ici, c'est la suite de T2a qui est tombée à l'arrivée de celle de T2b, et on cherche
d'abord la régression dans du code qu'on n'a pas touché.

Observé le 2026-09-21, à l'arrivée de `product-repository.int-spec.ts`.

Ce qui protège maintenant : chaque fichier d'intégration porte un `PREFIX` qui lui est
propre, et le compose avec son compteur. Un compteur seul ne suffit pas — il est local
au fichier, et c'est justement ce qui trompe.

---

**Prisma 7 a retiré `--to-schema-datamodel` de `migrate diff`.**

L'option s'appelle désormais `--to-schema`. Le message le dit, mais la commande écrite
dans les notes d'une tranche précédente, elle, ne le dit pas — et `migrate diff` échoue
en écrivant un fichier de migration VIDE si la sortie est déjà redirigée.

    prisma migrate diff --from-config-datasource prisma.config.ts \
      --to-schema prisma/schema.prisma --script

Observé le 2026-09-21.

Ce qui protège maintenant : vérifier que le fichier produit n'est pas vide avant de le
déposer dans `migrations/`. Une migration vide se déploie sans rien faire et sans rien
dire.

---

**Un espace insécable dans une classe de caractères est invisible, et se lit comme un
espace ordinaire.**

Écrire `/[\s  ]/` et écrire `/[\s  ]/` avec les vrais caractères donne le même
rendu à l'écran. Le second fonctionne, mais personne ne peut le relire, et un copier-
coller le perd.

Observé le 2026-09-21, dans `parsePrice` : la chaîne était correcte, seulement illisible.

Ce qui protège maintenant : la règle ESLint `no-irregular-whitespace`, déjà active, l'a
attrapée. Le réflexe quand elle parle : `cat -A` sur la ligne, et remplacer les
caractères par leurs séquences d'échappement — jamais l'inverse.

---

**Un composant client qui importe le barillet d'un package interne fait entrer nodemailer
dans le paquet navigateur, et Turbopack panique sans nommer aucun des maillons.**

`@clemperl/domain` réexporte ses erreurs, qui importent `@clemperl/core`, dont le
barillet expose l'envoi de courriels, qui tire nodemailer, qui tire `node:net`. Un
composant `"use client"` qui importe une seule fonction pure de `@clemperl/domain`
entraîne toute cette chaîne.

Ce qu'on lit alors :

    FATAL: An unexpected Turbopack error occurred.
    Failed to write app endpoint /products/[id]/page
    Caused by: the chunking context (unknown) does not support external modules
               (request: node:net)

Aucun de ces messages ne nomme `@clemperl/domain`, ni `@clemperl/core`, ni nodemailer. La
page répond 500, et le test qui échoue accuse un texte manquant à l'écran.

Observé le 2026-09-21, sur `product-form.tsx`.

Ce qui protège maintenant : `@clemperl/domain` expose un sous-chemin `./browser` qui ne
réexporte que des fonctions pures, sans aucune dépendance serveur. Même raisonnement que
`@clemperl/db/enums`, et même règle : **un composant client n'importe jamais le barillet
d'un package interne**, il importe un sous-chemin étroit.

`@clemperl/core` n'en a pas encore, et le même défaut s'y ouvrira au premier composant
client qui voudra un type ou une constante de là — `TCurrency`, `CURRENCY_EXPONENT`.
L'échappatoire du jour : laisser le serveur faire le calcul et ne passer au client qu'une
valeur déjà réduite.

**Et ceci, qui coûte le plus de temps :** la carte `exports` vit dans le `package.json`
d'un paquet, et les `package.json` ne sont PAS montés dans les conteneurs. Ajouter un
sous-chemin exige donc `pnpm docker:up` — les sources, elles, sont montées et recompilées
à chaud, ce qui fait croire que tout l'est.

---

**Un nom de champ de formulaire ne peut pas porter de caractère de contrôle, et l'erreur
parle d'un en-tête MIME.**

La clé d'une combinaison de variantes utilise `\u001e` et `\u001f` comme séparateurs —
choisis précisément parce qu'un libellé a le droit de contenir « - » ou « = ». Écrite
telle quelle dans un `name=` de champ, elle traverse un formulaire multipart… et la
requête entière devient illisible :

    ⨯ Error: Malformed part header
    [browser] Uncaught Error: Malformed part header

Aucune server action ne s'exécute, aucun message d'erreur n'apparaît à l'écran, et le
test échoue sur une confirmation qui ne vient pas. Rien ne désigne le nom du champ.

Observé le 2026-09-21, sur la grille de prix de T2b.

Ce qui protège maintenant : les champs de prix sont nommés `price:<position>`. La grille
est produite par une fonction PURE et déterministe, appelée des deux côtés avec les mêmes
entrées — les positions correspondent donc sans qu'aucune clé n'ait à voyager. Règle
générale : ce qui part dans un `name=` est un identifiant simple, jamais une clé
composite.

---

**Une route dynamique se compile au premier accès, et le test qui vient de créer la
ressource paie cette compilation dans son propre délai.**

`e2e/global-setup.ts` préchauffe les routes pour cette raison, mais on ne pense pas à y
mettre les routes dynamiques : elles n'ont pas d'URL fixe. Elles en ont pourtant une qui
suffit — **l'identifiant n'a pas besoin d'exister**, la page est assemblée avant de
décider qu'elle répond 404.

Sans `${URL_VENDOR}/products/inexistant` dans la liste, la première fiche produit coûtait
7,4 secondes, et l'assertion qui suivait expirait à 5. Le test accusait un texte manquant.

Observé le 2026-09-21.

Ce qui protège maintenant : la liste de `global-setup.ts` porte une entrée par route
dynamique, avec un identifiant volontairement inexistant.

---

**Une tâche Turbo qui passe par CHANCE d'ordonnancement finit par échouer, et pas sur la
machine où on l'a écrite.**

`@clemperl/db` se teste contre `generated/prisma/`, produit par `prisma generate`. Sa
tâche `test` ne dépendait que de `^build` — les dépendances du paquet, donc `core`, jamais
ce que le paquet génère pour lui-même. Elle réussissait quand même : `@clemperl/api#test`
dépend de `^build`, qui inclut `@clemperl/db#build`, qui déclenche `db:generate`. La
génération arrivait donc *à temps*, par un chemin qui ne la garantissait pas.

Turbo parallélise. Le jour où `@clemperl/db#test` démarre avant la tâche qui générait pour
lui, il échoue sur `Cannot find module '../generated/prisma/client.js'`. En local le
dossier existe déjà : **ça ne se voit que sur un dépôt fraîchement cloné**, et de façon
intermittente.

Observé le 2026-09-21, en CI, sur un run où rien de pertinent n'avait changé — le même
code était passé deux runs plus tôt.

Ce qui protège maintenant : `@clemperl/db#test` et `@clemperl/db#lint` déclarent
`db:generate`, comme `#typecheck` et `#build` le faisaient déjà. Règle générale : une
tâche dépend de ce dont elle a besoin, jamais de ce qu'une voisine lui procure.

Attention en l'écrivant : une entrée `<paquet>#<tâche>` **remplace** l'entrée générique.
Ses `outputs` doivent être repris, sinon la mise en cache de cette tâche disparaît en
silence.

---

**Les SOURCES sont montées dans les conteneurs, les FICHIERS DE CONFIGURATION ne le sont
pas — et la différence coûte une reconstruction à chaque fois qu'on l'oublie.**

Le compose monte `packages/*/src` et `apps/*/src`. Tout le reste — `package.json`,
`turbo.json`, `pnpm-workspace.yaml`, `packages/db/generated` — vit dans l'image, figé au
build. Modifier une source se voit en deux secondes ; modifier une configuration ne se
voit **jamais**, jusqu'à `pnpm docker:up`.

Trois formes du même défaut, toutes rencontrées pendant la seule tranche T2c :

| Ce qu'on a changé | Ce qu'on a lu |
|---|---|
| `packages/domain/package.json` — un sous-chemin `exports` | `Module not found: @clemperl/domain/browser` |
| `apps/api/package.json` — une dépendance | `BullMQ could not load the optional 'ioredis' package` |
| `turbo.json` — une variable dans `globalEnv` | `Environnement invalide : STORAGE_PUBLIC_URL … undefined`, alors que `docker exec env` la MONTRE |

La dernière est la plus déroutante : la variable est bien dans l'environnement du
conteneur, et `docker exec sh -c 'echo $VAR'` l'affiche. C'est **Turbo** qui la filtre en
mode strict, d'après un `turbo.json` périmé que l'image transporte.

Observé les 2026-09-21 et 2026-09-24.

Ce qui protège maintenant : rien dans le code — c'est une propriété du montage. Le
réflexe : **si le fichier changé n'est pas sous un `src/`, il faut reconstruire.** Et
quand une variable existe dans le conteneur mais pas dans le processus, regarder
`globalEnv` avant de chercher ailleurs.

---

**`packages/db/src` n'était monté que dans l'API — les trois fronts Next lisaient un
`dist` figé au build de l'image.**

Le compose monte les sources paquet par paquet, à la main, service par service. `auth`,
`core`, `domain`, `ui` étaient listés partout ; `db` seulement sous `api`. Les trois
fronts Next parlent pourtant à PostgreSQL par server actions, donc ils dépendent de
`@clemperl/db` autant que l'API.

Le symptôme ne nomme pas la cause : `The export productIsOwnedBy was not found in module
packages/db/dist/src/index.js` — « Did you mean to import saveProduct? ». Le fichier
source contient bien l'export, et le rebâtir depuis l'hôte ne change rien puisque le
conteneur ne voit pas ce source-là. Reconstruire le paquet DANS le conteneur ne change
rien non plus : il recompile sa propre copie, celle de l'image.

Le tri qui tranche en dix secondes :

```
docker exec <conteneur> grep -c <symbole> /app/packages/db/src/<fichier>.ts
```

Zéro sur le SOURCE, alors que l'hôte le contient : le dossier n'est pas monté. Un
`docker inspect --format '{{range .Mounts}}…'` le confirme.

Observé le 2026-09-24.

Ce qui protège maintenant : `packages/db/src` est monté dans `storefront`, `vendor` et
`admin`. La liste reste manuelle, donc le piège renaîtra au prochain paquet ajouté —
**un nouveau paquet partagé se monte dans tous les services qui l'importent, pas
seulement celui où on l'a testé.**

---

**sharp décode les SVG sans se plaindre, donc `type.startsWith("image/")` laisse entrer un
document qui exécute du script.**

`image/svg+xml` satisfait le préfixe. sharp le parse, en rend des métadonnées crédibles
(`svg 800 600`) et en produit des déclinaisons WebP parfaitement valables. L'image atteint
donc `READY` par le chemin normal, et l'original — que le worker ne supprime que lorsqu'il
REFUSE — survit.

Ce qui reste est un objet stocké avec le type que le navigateur du déposant avait déclaré.
Servi tel quel depuis l'origine publique, il s'exécute là où vit le cookie de session.

Observé le 2026-09-24, sur `sharp` 0.35.4.

Ce qui protège maintenant, à trois hauteurs : `isAcceptedImageType` est une **liste
blanche** (`image/jpeg`, `png`, `webp`, `avif`) et non un préfixe ; `isServableMediaPath`
n'autorise plus que les déclinaisons, jamais l'original ; la route de relais ajoute
`nosniff` et `default-src 'none'; sandbox`. La règle générale : **un contrôle par préfixe
accepte tout ce qu'on n'a pas pensé à interdire.**

---

**`sharp(...).resize()` ignore l'orientation EXIF, et `metadata()` rend les dimensions
AVANT rotation.**

Un téléphone tenu en portrait enregistre toujours en paysage et note la rotation à part.
C'est donc le cas majoritaire, pas un cas limite. Mesuré :

```
metadata brute : 1200 x 800 | orientation 6
sans .rotate() :  320 x 213   ← la photo est servie couchée
avec .rotate() :  320 x 480
```

Deux conséquences, pas une. La visible : les vignettes sont couchées. La sournoise : tout
ce qu'on décide à partir de `metadata.width` juge le mauvais côté — une photo large de
200 px stockée en 5000 × 200 passe un contrôle « au moins 320 px de large ».

Observé le 2026-09-24.

Ce qui protège maintenant : `.rotate()` sans argument dans la chaîne de redimensionnement
— c'est ce qui applique l'orientation — et `orientedSize()`, pure et testée sur les huit
valeurs, qui permute les dimensions pour 5 à 8 avant que quoi que ce soit en juge.

---

**BullMQ n'informe pas votre domaine qu'un job a cessé de réessayer : la ligne reste dans
l'état où elle était, pour toujours.**

`attempts: 3` fait retenter, puis range le job dans la liste des échecs — et c'est tout.
Rien ne repasse sur la ligne. Une image dont le traitement tombe pour une raison qui ne la
concerne pas (stockage injoignable, base coupée) reste donc `PENDING` indéfiniment, et
l'écran qui l'interroge toutes les deux secondes ne montrera jamais ni photo ni raison.

C'est le seul état dont l'application ne sort pas : tous les autres échecs passent par un
`markImageFailed` explicite.

Dans la même famille, et découvert en même temps : **BullMQ conserve chaque job terminé
dans Redis, indéfiniment**, tant qu'on ne pose pas `removeOnComplete` / `removeOnFail`.
Redis vit en mémoire.

Observé le 2026-09-24.

Ce qui protège maintenant : un `@OnWorkerEvent("failed")` qui bascule la ligne en `FAILED`
quand `attemptsMade >= opts.attempts`, et `removeOnComplete: true` / `removeOnFail: 1000`
sur les options du job. La règle : **tout état transitoire écrit en base a besoin de
quelqu'un qui le termine quand le mécanisme qui devait le faire abandonne.**
