# ClemPerl, T2d : le catalogue public

**Date** : 2026-10-02
**Statut** : cadrée, non commencée
**Tranche** : T2d, dernière des quatre sous-tranches de T2
**S'appuie sur** : `2026-09-21-t2b-produit-variantes-design.md` et
`2026-09-24-t2c-pipeline-medias-design.md`, livrées

---

## 1. Objectif

Un visiteur, sans compte, parcourt les produits publiés de toutes les boutiques, les
filtre, ouvre une fiche, choisit une déclinaison, voit son prix et peut contacter la
boutique.

C'est la première surface publique du produit. Tout ce que T2b et T2c ont construit
s'arrête aujourd'hui à l'espace vendeur ; T2d le met devant des acheteurs.

C'est aussi la dernière surface avant T3, où elle devra savoir mettre une déclinaison dans
un panier. Le sélecteur de déclinaison est donc conçu pour que T3 remplace un lien de
contact par un bouton, sans redessiner la fiche.

## 2. Ce que T2d décide

### Le produit porte sa propre catégorie

`categories` est aujourd'hui une colonne de `Vendor`. Un produit n'a aucune catégorie
propre, il hérite de celles de sa boutique. Une maroquinerie qui vend aussi de la
joaillerie étiquette donc ses sacs ET ses bagues avec les deux, et un filtre par catégorie
remonte les mauvais produits.

T2d ajoute `category` sur `Product`, dans un enum **distinct** de `E_VENDOR_CATEGORY`. Les
deux répondent à des questions différentes : ce que la boutique déclare vendre, et ce
qu'est cet objet. Les fusionner lierait leurs évolutions sans raison, alors que la liste
des catégories de produit a vocation à s'allonger bien avant celle des boutiques.

### La liste est bornée à une devise, choisie par le visiteur

Le prix vit sur la variante, la devise sur la boutique. Une liste qui mélange plusieurs
boutiques mélange donc des devises, et rien ne convertit.

Trier par prix ou filtrer par fourchette n'a aucun sens entre un euro et un franc CFA. La
liste est donc bornée à **une** devise, que le visiteur choisit. Le tri et la fourchette
redeviennent alors vrais.

La locale ne donne pas cette information : le français est la langue de la Belgique comme
de l'UEMOA, donc `/fr` ne dit pas si le visiteur pense en euros ou en francs CFA. Le choix
est explicite.

### Le choix de devise vit dans un cookie

Deux conséquences, assumées :

La page de liste devient **personnelle**, donc non cacheable page entière. Le poids réel
reste sur les images, qui gardent le cache d'un an que la route de relais leur donne, donc
le coût est borné.

Un **lien partagé ne montre pas la même chose à deux personnes**. C'est le prix d'URL
propres, et le filtre reste visible à l'écran, donc la différence s'explique d'elle-même.

### Le catalogue lit la base en SQL paramétré, sans colonne dénormalisée

Trier une liste de produits par le minimum du prix de leurs variantes suppose d'ordonner
sur un agrégat de relation. Le client Prisma généré ne l'expose pas :
`ProductVariantOrderByRelationAggregateInput` ne porte que `_count`.

Deux sorties existaient. Dénormaliser un `minPriceAmount` sur `Product`, maintenu par
`saveProduct`, pour garder une requête déclarative. Ou écrire la requête en SQL.

**T2d écrit la requête en SQL.** Une colonne n'a pas à exister parce qu'un client
TypeScript ne sait pas faire un `MIN` sur une relation : ce serait plier le modèle de
données à la limite d'un outil, et créer au passage une valeur qui peut dériver.

Cette décision n'est tenable que parce que la composition est sûre par construction. Voir
section 5.

### La fiche ne respecte pas le cookie de devise

Un produit s'affiche toujours dans la devise de sa boutique. Borner la fiche ferait
disparaître un produit dont on a l'URL, ce qui n'a aucun sens.

Le cookie borne la **liste**, et seulement elle, parce que c'est le seul endroit où
comparer est le but.

### Tant que le panier n'existe pas, la fiche mène à la boutique

Un bouton « Ajouter au panier » qui ne fait rien, même grisé, est une promesse non tenue
sur une page publique. La fiche affiche à la place un lien de contact vers l'adresse de la
boutique, prérempli avec le produit et la déclinaison choisie.

T3 remplace ce lien. Rien d'autre ne bouge.

## 3. Périmètre

**Dans T2d :** la liste filtrée, la vitrine d'une boutique, la fiche produit, le sélecteur
de devise, la recherche texte simple, le tri, la pagination, la catégorie de produit et sa
migration.

**Hors T2d, et nommé ici pour ne pas être redécouvert :**

Les **collections**. Un vendeur crée une collection transversale, par exemple
`hot-summer-sales`, et y range des articles de son catalogue. Relation N à N entre
`Product` et une table `Collection`, avec son propre slug public. C'est une intention
d'achat qu'une catégorie ne capte pas, et c'est la suite naturelle de ce chantier. Pas en
T2d : la catégorie et les filtres doivent d'abord vivre contre de vrais produits.

La **recherche plein texte**. T2d fait un `ILIKE` insensible à la casse et aux accents. Le
jour où le catalogue ralentit, un `tsvector` français et un index GIN se posent par-dessus
sans changer l'interface.

Le **panier**, qui est T3. La **conversion de devises**, qui demanderait une
infrastructure de taux et afficherait un prix qui n'est pas celui payé.

## 4. Le modèle

Une seule migration, qui ne porte que la catégorie.

```prisma
enum E_PRODUCT_CATEGORY {
  APPAREL
  JEWELLERY
  LEATHER_GOODS

  @@map("product_category")
}

model Product {
  category E_PRODUCT_CATEGORY @default(APPAREL)

  @@index([status, category])
}
```

Le défaut existe pour que la migration passe sur les lignes déjà écrites. Le formulaire
vendeur, lui, **exige** un choix explicite : un défaut silencieux rangerait toutes les
bagues en vêtements.

L'index porte `status` d'abord, parce que toute requête publique commence par
`status = 'PUBLISHED'`.

## 5. La requête de liste

Elle vit dans `packages/db/src/repositories/catalog.repository.ts`, en SQL paramétré.
C'est la première requête brute du dépôt, et elle est contenue dans une fonction.

**Trois règles de construction, et c'est ce qui la rend sûre.**

Les **valeurs** passent toutes par l'interpolation de `Prisma.sql`, donc deviennent des
paramètres liés : terme recherché, catégorie, devise, bornes de prix, limite, décalage.
Aucune ne touche la chaîne SQL.

Le **tri** se choisit dans une table fermée, clé vers fragment figé, construite avec
`Prisma.raw` sur des littéraux écrits dans le code. Une clé absente retombe sur le tri par
défaut. Aucun texte venu de l'URL ne devient du SQL.

Les **conditions** sont une liste de fragments `Prisma.sql` assemblés par
`Prisma.join(conditions, " AND ")`, ce qui garde chaque fragment paramétré.

La requête joint `products`, `vendors` et `product_variants`, groupe par produit, et rend
par ligne : identifiant, slug, titre, catégorie, slug et nom de boutique, devise, prix
minimum, nombre de déclinaisons, et le chemin d'objet de l'image de position la plus
basse parmi les `READY`.

**Ce que le test d'intégration épingle en premier** : que `MIN(price_amount)` revient en
entier JavaScript. `node-postgres` rend certains types numériques en chaîne, et un prix
devenu chaîne traverserait le formatage sans erreur en donnant un montant faux.

## 6. Les routes

```
/<locale>/catalog                      la liste filtrée
/<locale>/shops/<shop>                 la vitrine d'une boutique
/<locale>/shops/<shop>/<product>       la fiche produit
```

Les segments sont en **anglais**, comme toutes les routes du dépôt. Ce que la machine lit
est en anglais, ce qu'un humain lit est en français : les titres de page, eux, viennent du
catalogue de traduction.

Le segment de boutique est **obligatoire** sur la fiche : le slug produit est unique par
boutique et non globalement, donc `<product>` seul ne désigne rien. Deux vendeurs ont le
droit de vendre chacun leur `sac-cabas`.

La vitrine coûte alors presque rien, puisque le segment existe déjà, et donne au vendeur
une adresse à partager.

Les filtres vivent dans les paramètres de recherche de l'URL, donc une liste filtrée se
partage et s'indexe. La devise seule vient du cookie.

## 7. La frontière serveur et client

```
apps/storefront/src/app/[locale]/
  catalog/page.tsx                              serveur, lit le dépôt
  catalog/components/catalog-filters.tsx        client, écrit dans l'URL
  catalog/components/product-card.tsx           serveur
  shops/[shop]/page.tsx                         serveur
  shops/[shop]/[product]/page.tsx               serveur
  shops/[shop]/[product]/components/variant-selector.tsx   client
  components/currency-selector.tsx              client, écrit le cookie
```

Trois composants seulement sont clients, et chacun pour une raison d'écriture :

Le **sélecteur de filtres** écrit dans l'URL. Le **sélecteur de devise** écrit le cookie.
Le **sélecteur de déclinaison** tient une sélection locale.

Tout le reste est serveur, y compris les cartes de produit.

**Le sélecteur de déclinaison ne formate aucun prix.** La page serveur lui passe une table
de chaînes déjà formatées, clé de combinaison vers prix affichable. Le composant ne
connaît donc ni devise, ni exposant, ni `Intl`.

Ce n'est pas un détour. `formatPrice` vit dans `packages/domain/src/utils/price.utils.ts`,
qui tire `CURRENCY_EXPONENT` de `@clemperl/core`, qui tire nodemailer, qui tire
`node:net`. Un composant client qui l'importerait casserait le paquet navigateur, et
l'erreur ne nommerait aucun de ces maillons. Le piège est déjà consigné, et le formatage
reste ainsi en un seul endroit.

## 8. Les écrans

**La liste.** Une grille de cartes. Chaque carte porte la vignette 320, le titre, le nom
de la boutique, et le prix plancher précédé de « à partir de » quand le produit a
plusieurs déclinaisons. Au-dessus, le champ de recherche, le filtre par catégorie, le tri,
et le sélecteur de devise. En dessous, la pagination.

**La vitrine.** Nom de la boutique, description, catégories déclarées, puis ses produits
publiés dans la même grille de cartes.

**La fiche.** Les photos `READY` dans l'ordre de position, la première en grand. Le titre,
le nom de la boutique qui mène à sa vitrine, la description. Le sélecteur de déclinaison,
le prix qui suit la sélection, et le lien de contact.

Le lien de contact est un `mailto:` vers l'adresse de contact de la boutique, dont l'objet
et le corps sont préremplis depuis le catalogue de traduction, avec le titre du produit et
la déclinaison choisie en substitutions.

Le design suit la direction du dépôt : coins carrés, bordures fines et peu nombreuses,
pas d'ombre.

## 9. Les libellés

Une section `catalogue` dans `packages/i18n/messages/storefront/fr.json` et `en.json`.

Les **noms de catégories** sont des clés de traduction, comme les raisons d'échec de T2c :
la base range `JEWELLERY`, le catalogue en fait « Joaillerie ». Un enum qui voyagerait
jusqu'à l'écran obligerait à traduire en base.

Le **gabarit du message de contact** y vit aussi, avec le produit et la déclinaison en
substitutions.

## 10. Le cookie de devise

Nom `currency`, valeur un code ISO 4217, durée longue. Non `httpOnly`, puisqu'un composant
client l'écrit, et il ne porte aucune information sensible.

**À la première visite**, sans cookie, la liste montre la devise portant le plus de produits
publiés, et le sélecteur l'affiche. Rien n'est deviné en silence.

Une valeur de cookie inconnue ou absente des devises réellement présentes retombe sur ce
même défaut, plutôt que de rendre une liste vide qui ressemblerait à un catalogue sans
produits.

## 11. Les cas limites

Ce qui doit être juste et ne se voit pas :

Un produit `DRAFT` n'apparaît nulle part, ni en liste, ni en vitrine, ni par son URL
directe, qui répond 404. Un produit dont la boutique est supprimée non plus.

Une boutique sans devise n'a aucun produit publiable, donc n'apparaît pas.

La fiche d'un produit publié affiche forcément une photo, c'est la garantie du dépôt
solidifiée en T2c. Mais une image ajoutée après publication peut être `PENDING` : la fiche
ne montre que les `READY`, sinon elle rendrait une vignette cassée.

Une page de pagination au-delà du dernier résultat rend une liste vide et un message, pas
une erreur.

Une recherche sans résultat rend un état vide qui dit quoi faire, pas une grille vide.

## 12. Pièges déjà payés qui s'appliquent ici

**Un composant client qui importe un barillet** fait entrer nodemailer dans le paquet
navigateur. Voir section 7 : aucun prix n'est formaté côté client.

**Les sources sont montées dans les conteneurs, pas la configuration.** La migration et
tout changement de `schema.prisma` demandent `pnpm docker:up`.

**Les suites d'intégration se marchent dessus sur les slugs.** Les données de test de
cette tranche portent un préfixe propre et un compteur, comme celles de T2b et T2c.

**`getByRole("img")` attrape les icônes SVG de la page.** Les parcours navigateur visent
les vignettes par `data-testid`, pas par rôle.

## 13. Tests

**Pur, dans `packages/domain`** : la lecture des filtres depuis les paramètres d'URL, et
la table fermée des tris. Exhaustif, y compris une clé de tri inventée, une page négative,
une limite démesurée.

**Intégration, contre le vrai PostgreSQL** : la requête de catalogue. Un brouillon
invisible, une boutique supprimée invisible, le `MIN` qui revient en entier, le filtre par
devise, la recherche insensible aux accents, la pagination qui ne saute ni ne répète une
ligne, l'image choisie qui est bien la `READY` de position la plus basse.

**Navigateur** : un visiteur arrive sur le catalogue, filtre par catégorie, cherche,
ouvre une fiche, change de déclinaison et voit le prix changer, puis suit le lien vers la
vitrine. Et un parcours qui vérifie qu'un brouillon répond 404 par son URL directe.

Le cliquet de couverture s'applique : les planchers valent la valeur mesurée, et ils ne
descendent pas.

## 14. Critères d'acceptation

1. Un produit publié apparaît dans la liste, un brouillon jamais, y compris par son URL
   directe qui répond 404
2. La catégorie est portée par le produit, choisie explicitement par le vendeur, et le
   filtre ne remonte que les produits de cette catégorie
3. La liste est bornée à une devise, et le sélecteur affiche celle en vigueur dès la
   première visite
4. Le tri par prix ordonne sur le prix plancher réel, sans colonne dénormalisée
5. La recherche trouve un titre quelle que soit la casse et les accents
6. La pagination ne saute ni ne répète une ligne, et une page hors limites rend un état
   vide, pas une erreur
7. La fiche affiche les photos `READY` seulement, le prix qui suit la déclinaison choisie,
   et un lien de contact prérempli
8. Aucun prix n'est formaté dans un composant client
9. Aucune valeur venue de l'URL ou du cookie n'atteint la chaîne SQL
10. `lint`, `typecheck`, `test`, `test:e2e` et les seuils de couverture passent

## 15. Risques

| Risque | Impact | Traitement |
|---|---|---|
| **Première requête SQL brute du dépôt** | Une erreur de composition n'est pas rattrapée par le typage | Trois règles de construction, aucune valeur hors paramètre, tri dans une table fermée, et un test d'intégration par condition |
| **`node-postgres` rend certains numériques en chaîne** | Un prix faux affiché sans aucune erreur | Un test d'intégration épingle le type de retour de `MIN(price_amount)` |
| **La liste n'est pas cacheable page entière** | Chaque visite recalcule la requête | Décision assumée du cookie ; les images, qui pèsent, gardent leur cache d'un an |
| **La catégorie a un défaut en base** | Un produit existant mal rangé au moment de la migration | Le défaut sert la migration, le formulaire exige un choix explicite |
| **Un lien de liste partagé ne montre pas la même chose** | Incompréhension entre deux personnes | Le filtre de devise est visible à l'écran, donc la différence s'explique |
