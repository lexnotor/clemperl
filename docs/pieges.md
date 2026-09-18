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
