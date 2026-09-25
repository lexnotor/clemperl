# ClemPerl — T2c : Le pipeline médias

**Date** : 2026-09-24
**Statut** : livrée. Une décision de cadrage a été renversée à l'implémentation —
voir section 2, « Pourquoi le dépôt passe finalement par le serveur »
**Tranche** : T2c — troisième des quatre sous-tranches de T2
**S'appuie sur** : `2026-09-21-t2b-produit-variantes-design.md`, livrée

---

## 1. Objectif

Un produit a des photos. Le vendeur les dépose, elles sont optimisées hors du chemin de
la requête, et T2d les servira au catalogue public.

C'est la dette que T2b a laissée explicitement : « Un produit n'a aucune image, et aucun
stock. Les médias sont T2c. » C'est aussi la première tranche qui donne un emploi réel à
deux choses posées en T0 et jamais utilisées depuis : **Redis**, qui est dans le compose
sans que rien ne s'en serve, et **l'API NestJS**, dont T0 disait qu'elle existe pour « ce
que Next ne sait pas faire — Socket.IO, traitements de fond, webhooks ».

## 2. Ce que T2c décide

Six décisions prises au cadrage. Chacune contraint T2d.

| Décision | Ce qui a été retenu |
|---|---|
| **Le worker** | Dans `apps/api`, sous NestJS, avec une concurrence bornée |
| **Le dépôt** | ~~Direct du navigateur au stockage~~ → **par la server action** (voir section 2) |
| **La diffusion** | Bucket privé, relayé par une route de la boutique |
| **Les déclinaisons** | Trois largeurs en WebP — 320, 800, 1600 — et l'original conservé |
| **L'état** | Un état par image ; publier exige qu'elles soient toutes prêtes |
| **Zéro image** | Un produit sans aucune image ne se publie pas |

**Pourquoi le worker dans l'API plutôt qu'une application à part.** L'API existe déjà et
ne sert aujourd'hui qu'une sonde de santé et `/me`. T0 l'a créée pour les traitements de
fond, entre autres — c'est son premier usage conforme à son propre cadrage. Le coût est
réel et se traite : sharp est du calcul, il tourne dans le conteneur qui sert le HTTP, et
sans borne un lot de trente photos rendrait l'API muette. D'où la concurrence bornée de la
section 7. L'image de l'API, déjà à 1,11 Go, s'alourdit encore ; c'est une ligne de plus
au registre des points ouverts, pas un obstacle.

### Pourquoi le dépôt passe finalement par le serveur

Le cadrage avait retenu le dépôt **direct**, et pour une bonne raison : en passant par une
server action, chaque octet de chaque photo traverse un serveur Next pour être aussitôt
réémis.

**L'implémentation l'a rendu impossible.** `supabase/storage-api` n'expose aucun en-tête
CORS : sa source porte `// kong should take care of cors`, la ligne
`app.register(fastifyCors)` est commentée, et le préflight `OPTIONS` répond 404. Supabase
le fait tourner derrière Kong, qui s'en charge ; l'image seule, non, et aucune variable ne
l'active. Un `PUT` inter-origines depuis le navigateur échoue sur `TypeError: Failed to
fetch`.

Trois issues ont été pesées — un proxy devant le stockage, le retour à la server action,
ou une réécriture Next qui coûte la même chose pour un détour de plus. **Le retour à la
server action a été retenu** : il fonctionne, il est éprouvé par T1b pour les
justificatifs, et il n'ajoute aucune infrastructure. Le dépôt direct redeviendra possible
le jour où un proxy se place devant le stockage ; `docker/proxy/` existe et ne sert plus
depuis T1a.

Ce qui suit décrit le chemin réellement construit.

**Ce que la confiance ne couvre pas**, et qui reste vrai. Les vendeurs sont validés, donc
le risque n'est pas la malveillance.

Elle ne couvre **ni l'accident ni l'erreur** : un PDF renommé `.jpg`, un PNG uniforme de
8 000 × 8 000 qui tient en 75 Ko. Deux règles répondent à cela :

1. **L'objet d'abord, la ligne ensuite**, et la suppression de l'objet en compensation si
   la ligne échoue — l'ordre que T1b a éprouvé pour les justificatifs.
2. **La validation est faite par le worker**, qui télécharge déjà l'original pour sharp.
   Le type annoncé par le navigateur est écarté à l'entrée quand il est manifestement
   faux, mais il ne prouve rien : c'est le décodage qui tranche.

**Les dimensions sont contrôlées sur les MÉTADONNÉES, avant tout décodage.** Un PNG
uniforme de 8 000 × 8 000 pèse 75 Ko et demande des gigaoctets à décompresser. Le worker
partageant son conteneur avec l'API, un dépassement mémoire emporterait les deux : le
plafond est à 50 millions de pixels, nettement sous celui de sharp par défaut, et il agit
sur l'en-tête.

La taille, elle, est déjà tenue **par le stockage** : `UPLOAD_FILE_SIZE_LIMIT` vaut
5 Mo dans le compose, et un fichier plus gros est refusé avant d'atteindre le disque. Ce
plafond n'est donc pas à réinventer côté applicatif — seulement à annoncer au vendeur.

## 3. Périmètre

### Inclus

- Déposer une ou plusieurs images sur un produit
- Les voir arriver, avec leur état
- Les réordonner ; la première position vaut image principale
- En supprimer une, ou relancer celle qui a échoué
- Renseigner un texte alternatif, facultatif
- Le worker : trois déclinaisons WebP par image
- La route de relais qui sert une déclinaison
- Publier exige au moins une image, toutes prêtes

### Exclu explicitement

- **AVIF** — l'original est conservé, il se rajoutera sans rien redemander au vendeur.
- **Le recadrage, la rotation, tout éditeur.** Le vendeur dépose ce qu'il veut publier.
- **Les images de variante.** Elles s'attachent au produit : une photo de sac est la même
  quelle que soit la longueur de sa bandoulière.
- **Le catalogue public** — T2d. Rien de ce qui est déposé n'est visible hors de l'espace
  vendeur.
- **Le balayage automatique des `PENDING` abandonnés.** Le vendeur les voit et les
  supprime. Le balayage relève de T7, avec les traitements planifiés, et la passation le
  dit déjà.
- **Le temps réel.** La page se rafraîchit d'elle-même tant qu'une image attend ; les
  WebSockets sont T7.

## 4. Le modèle

```prisma
enum E_PRODUCT_IMAGE_STATUS {
  PENDING
  READY
  FAILED

  @@map("product_image_status")
}

model ProductImage {
  id        String                 @id @default(cuid(2))
  productId String                 @map("product_id")
  status    E_PRODUCT_IMAGE_STATUS @default(PENDING)

  // Le chemin de l'ORIGINAL. Les déclinaisons s'en dérivent.
  objectPath String @map("object_path")
  position   Int

  // Le nom d'origine ne sert qu'à l'affichage : le chemin est généré, jamais repris du
  // fichier déposé — reprendre celui-ci laisserait choisir où l'objet atterrit.
  originalName String  @map("original_name")
  altText      String? @map("alt_text")

  // Renseignées par le WORKER, après décodage. Nulles tant que l'image est `PENDING` :
  // personne ne connaît les dimensions d'un fichier que rien n'a encore ouvert.
  width  Int?
  height Int?

  // Pourquoi le traitement a échoué, en clair, pour que le vendeur sache s'il doit
  // recommencer ou changer de fichier.
  failureReason String? @map("failure_reason")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([productId, position])
  @@index([productId, status])
  @@map("product_images")
}
```

### Les déclinaisons n'ont pas de lignes

Leurs chemins se dérivent de celui de l'original, et l'ensemble est **fixe**. `READY`
signifie que les trois existent : le worker les écrit toutes ou échoue. Trois lignes par
image ne diraient rien que le statut ne dise déjà, et il faudrait les garder cohérentes.

```
{productId}/{uuid}/original.jpg
{productId}/{uuid}/w320.webp
{productId}/{uuid}/w800.webp
{productId}/{uuid}/w1600.webp
```

Le préfixe groupe : supprimer une image, c'est supprimer un dossier. Les chemins sont
**immuables** — un `uuid` par dépôt, jamais réécrit — ce qui rend la mise en cache sûre
sans invalidation.

### `@@unique([productId, position])`

L'ordre d'affichage est une donnée, pas une suggestion. Sans cette contrainte, deux
images peuvent partager une position et l'ordre dépend alors de ce que rend la base —
c'est-à-dire de rien de garanti.

**Et cette contrainte a un piège que le plan doit désamorcer.** PostgreSQL vérifie
l'unicité à CHAQUE instruction, pas à la fin de la transaction. Échanger les positions 0
et 1 par deux `UPDATE` successifs viole donc la contrainte au premier, alors que l'état
final serait valide. Le réordonnancement passe en deux temps dans la même transaction :
d'abord toutes les positions décalées hors de la plage occupée — `position + 1000` —
puis réécrites à leurs valeurs finales.

## 5. Deux buckets, et c'est une décision de sécurité

`product-media` est **distinct** de `vendor-documents`.

La route de relais lit un chemin qui vient de l'URL. Si les photos de produit et les
pièces d'identité vivaient dans le même bucket, une route relâchée — un motif trop
permissif, une régression future — servirait une carte d'identité à qui devine un chemin.
Deux buckets rendent cette faute **impossible**, pas seulement improbable. C'est le même
raisonnement qui a exclu les champs légaux de `updateShopProfile` en T2a : la garantie est
dans la structure, pas dans la vigilance.

`packages/core` gagne donc `media-storage.utils.ts`, à côté de `document-storage.utils.ts`.
La construction du client, aujourd'hui privée à ce dernier, est extraite dans un module
interne que les deux partagent — un client, deux buckets, deux jeux de fonctions.

Une variable d'environnement de plus : `STORAGE_MEDIA_BUCKET`. Elle rejoint `globalEnv`
de `turbo.json`, faute de quoi le mode strict la filtre.

## 6. Le chemin d'un dépôt

```
1. Le vendeur choisit un fichier
2. Action `uploadProductImage`  → dépose l'objet, écrit la ligne PENDING, empile le job
3. Worker BullMQ dans apps/api  → télécharge, lit l'en-tête, décode, 3× sharp, dépose
4.                               → READY, ou FAILED avec sa raison
```

**L'ordre de l'étape 2 n'est pas négociable** : l'objet, puis la ligne, puis le job. Une
ligne sans objet donnerait un `FAILED` dès la première tentative ; un job sans ligne
s'arrêterait sans rien faire.

La limite de corps des server actions est relevée à 5 Mo dans
`apps/vendor/next.config.ts`, alignée sur `UPLOAD_FILE_SIZE_LIMIT` du stockage : deux
plafonds différents produiraient un refus que le message métier n'expliquerait pas.

## 7. Le worker

Un module NestJS dans `apps/api/src/modules/media/`, avec un processeur BullMQ sur la file
`product-images`.

**Le job ne porte que `{ imageId }`.** Y mettre les données du produit les figerait au
moment de l'empilage, et le worker les servirait périmées. Il relit tout depuis la base.

**Concurrence bornée à 2.** sharp est du calcul pur, et il tourne dans le conteneur qui
sert le HTTP. Sans borne, un lot de trente photos rend l'API muette pendant une minute.

**Trois tentatives, avec attente croissante, puis `FAILED`.** Une panne de stockage
passagère ne doit pas condamner une image ; un fichier illisible ne doit pas être retenté
indéfiniment.

Le worker refuse et marque `FAILED`, avec une raison distincte pour chaque cas. La
colonne range une **clé** ; la colonne de droite est ce que le catalogue de traduction en
fait :

| Cas | Ce que le vendeur lit |
|---|---|
| L'objet est absent du stockage | le dépôt n'a pas abouti, recommencer |
| sharp ne décode pas le fichier | ce fichier n'est pas une image |
| L'image fait moins de 320 px de large | trop petite pour être utilisée |

Dans les deux derniers cas, **l'objet est supprimé** : le garder coûterait de l'espace pour
un fichier dont on sait qu'il ne servira jamais.

## 8. La publication

`setProductStatus(publish: true)` lit désormais les images **dans sa transaction** et
refuse si le produit n'en a aucune, ou si l'une n'est pas `READY`.

Le contrôle est dans le dépôt et non dans l'action, pour la raison que T2b a déjà
établie : une action serveur est une route publique, et la garantie sur laquelle T2d
s'appuiera doit tenir quel que soit l'appelant.

Une image `FAILED` bloque donc la publication. C'est pour cela que sa suppression doit
être à portée de clic, et que l'écran ne la masque jamais.

**Aucune reprise de données.** Il n'existe aucun déploiement, donc aucun produit publié
réel. La règle s'applique à la publication ; ce qui traîne en base de développement est
jetable.

## 9. La route de relais

`apps/storefront/src/app/api/media/[...path]/route.ts`.

**Une seule application la porte**, et l'espace vendeur y pointe. Écrire la même route de
relais dans deux applications, c'est la règle écrite deux fois que ce dépôt passe son
temps à éviter. La boutique est l'origine publique, c'est là que T2d vit, et c'est celle
qui doit être rapide.

Elle ne sert que ce qui correspond **exactement** à ce motif :

```
^[a-z0-9]{20,32}/[0-9a-f-]{36}/w(320|800|1600)\.webp$
```

**Les déclinaisons seulement.** L'original est conservé — il sert à reproduire les
déclinaisons plus tard, et à ajouter l'AVIF sans rien redemander au vendeur — mais il
n'est jamais servi par cette route. Il revient du stockage tel qu'il a été déposé, avec le
type que le navigateur du vendeur avait déclaré : un SVG portant un `script` passe le
contrôle « c'est une image », sharp le décline sans se plaindre — donc l'image atteint
`READY` et l'original survit —, et le servir depuis la boutique exécuterait ce script sur
l'origine qui porte le cookie de session partagé depuis T1a. Les déclinaisons, elles,
sortent de sharp en WebP : leur contenu et leur type sont les nôtres.

Le dépôt refuse d'ailleurs un SVG en amont, par **liste blanche** — `image/jpeg`,
`image/png`, `image/webp`, `image/avif`. Un contrôle de la forme « le type commence par
`image/` » accepte tout ce qu'on n'a pas pensé à interdire.

Le motif est **ancré aux deux bouts**. Non ancré, il accepterait n'importe quel préfixe et
n'importe quel suffixe — `../../vendor-documents/...` compris — ce qui viderait la
barrière de tout son sens.

Tout le reste est un 404. Combiné au bucket distinct, aucun chemin ne peut atteindre un
justificatif. Les réponses portent `X-Content-Type-Options: nosniff` et
`Content-Security-Policy: default-src 'none'; sandbox` : rien de ce que le relais sert n'a
besoin d'exécuter quoi que ce soit.

### Ce que la route ne vérifie PAS, et pourquoi il faut le dire

Elle ne regarde ni le produit, ni son état de publication, ni la boutique à qui il
appartient. **Les photos d'un brouillon sont donc lisibles par qui connaît leur chemin.**

C'est une décision, pas un oubli. Le chemin porte un `uuid` de 36 caractères tiré au
hasard : il n'est ni devinable ni énumérable, et il joue le rôle d'un lien de partage
non répertorié. Vérifier la publication à chaque requête coûterait une lecture en base
par image — sur une grille de quarante vignettes, quarante lectures — et anéantirait
précisément la mise en cache qui justifie le relais.

Le jour où une image devra être vraiment secrète, ce n'est pas ce chemin-là qu'il faudra
durcir : c'est un autre bucket, comme pour les justificatifs.

**Les en-têtes de cache portent le gain.** Les chemins étant immuables,
`Cache-Control: public, max-age=31536000, immutable` s'applique sans réserve : le relais
coûte le premier accès, pas les suivants, et un proxy placé devant le met en cache comme
n'importe quelle réponse.

## 10. Les écrans

`/products/[id]` gagne une section images, sous la grille de prix :

- Une zone de dépôt, plusieurs fichiers à la fois
- Une vignette par image, avec son état ; `PENDING` montre un emplacement, `FAILED` montre
  sa raison et deux boutons — relancer, supprimer
- Le réordonnancement, la première position valant image principale
- Un champ de texte alternatif par image, facultatif

**Tant qu'une image est `PENDING`, la page se rafraîchit d'elle-même** par
`router.refresh()` à intervalle, et cesse dès que plus rien n'attend. Pas de WebSocket :
le temps réel est T7, et une file de quelques secondes ne le justifie pas.

## 11. Les erreurs

`docs/conventions/erreurs.md` s'applique. Les libellés vivent dans
`packages/i18n/messages/vendor/fr.json` ; aucun texte visible n'est écrit dans un `.tsx`.

Le `catch` d'une action serveur **journalise avant** de rendre son message localisé — un
`catch` nu laisse le vendeur devant « l'enregistrement a échoué » et les journaux vides.

`failureReason` est une **clé**, pas une phrase : la traduction vit dans le catalogue, et
la base ne range pas du français.

## 12. Trois pièges déjà payés qui s'appliquent ici

- **Les fronts embarquent `packages/db`, ils ne le montent pas.** Toute modification du
  schéma exige `pnpm docker:up`, et le symptôme accuse une route sans rapport. Cette
  tranche ajoute une table : le réflexe doit être immédiat.
- **Un composant client n'importe jamais le barillet d'un package interne.**
  `@clemperl/domain/browser` existe pour cela depuis T2b.
- **Une variable lue au build va dans `globalEnv` de `turbo.json`.**
  `STORAGE_MEDIA_BUCKET` en fait partie.

## 13. Tests

| Couche | Ce qu'elle prouve ici |
|---|---|
| Unitaire | la dérivation des chemins, le motif de la route comme prédicat pur, la précondition de publication |
| Intégration | le refus de publier sans image ou avec une image en attente, l'unicité des positions — contre un vrai PostgreSQL |
| Intégration du worker | **sharp sur une vraie image**, contre le conteneur de stockage déjà présent : dépôt, traitement, trois déclinaisons lisibles, et le cas du fichier illisible |
| E2E navigateur | le vendeur dépose, attend `READY`, publie |

L'intégration du worker est la couche qui compte le plus. sharp est un binaire natif et le
stockage est un service réseau : rien de ce qu'ils font ne se simule utilement, et c'est
précisément là que T2c peut casser sans que rien d'autre ne le voie.

Le cliquet de couverture s'applique : les planchers valent la valeur mesurée, et ils ne
descendent pas.

## 14. Critères d'acceptation

1. Le fichier traverse la server action : l'objet est déposé d'abord, la ligne `PENDING`
   ensuite, et l'objet est supprimé en compensation si la ligne échoue
2. Un type hors liste blanche — un SVG en particulier — est refusé avant le transfert, et
   l'appartenance du produit est lue avant lui
3. Une image déposée devient `READY` avec ses trois déclinaisons en WebP, **redressées
   selon leur orientation EXIF**
4. Un fichier qui n'est pas une image devient `FAILED`, et son objet est supprimé
5. Une image `FAILED` reste visible avec sa raison ; « Réessayer » n'est proposé que
   lorsque l'original existe encore, c'est-à-dire pour un traitement tombé
6. Un job qui épuise ses tentatives bascule la ligne en `FAILED` : aucune image ne reste
   `PENDING` indéfiniment
7. Publier est refusé sans image, ou si l'une n'est pas `READY` — **par le dépôt** — et le
   refus est dit au vendeur
8. La route de relais sert une déclinaison et répond 404 à tout chemin hors motif,
   **l'original compris**
9. Elle ne peut servir aucun objet de `vendor-documents`
10. La concurrence du processeur est déclarée et bornée, et un test l'affirme — un
    critère qui dirait « l'API ne devient pas muette » ne se vérifierait pas
11. `lint`, `typecheck`, `test`, `test:e2e` et les seuils de couverture passent

## 15. Risques

| Risque | Impact | Traitement |
|---|---|---|
| **sharp est un binaire natif** | L'image de l'API grossit encore ; une version incompatible casse au démarrage, pas à la compilation | La couche intégration l'exerce réellement ; la taille est un point ouvert déjà consigné |
| **La validation est faite après l'écriture** | Un fichier illisible occupe le stockage le temps d'un traitement | Le worker le supprime ; la ligne `PENDING` rend l'objet retrouvable dans tous les cas |
| **Le traitement peut tomber pour une raison étrangère à l'image** | Une ligne `PENDING` indéfiniment, interrogée toutes les deux secondes | Le relais `failed` de BullMQ bascule en `FAILED` quand les tentatives sont épuisées, et « Réessayer » reste proposé |
| **L'original porte le type déclaré par le déposant** | Un SVG servi depuis la boutique exécuterait du script sur l'origine du cookie de session | Liste blanche au dépôt, original jamais servable par le relais, `nosniff` et une politique de contenu sur les réponses |
| **Le worker partage son conteneur avec l'API** | Un lot d'images ralentit les requêtes HTTP | Concurrence bornée à 2, déclarée en un seul endroit et affirmée par un test |
| **La route de relais lit un chemin venu de l'URL** | Un motif trop permissif exposerait d'autres objets | Motif exact **et** bucket distinct : deux barrières indépendantes |
