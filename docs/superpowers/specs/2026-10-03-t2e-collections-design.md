# ClemPerl, T2e : les collections d'un vendeur

**Date** : 2026-10-03
**Statut** : design validé, en attente de plan d'implémentation
**Tranche** : T2e, dernière sous-tranche de T2
**S'appuie sur** : `2026-10-02-t2d-catalogue-public-design.md`, livrée

---

## 1. Objectif

Un vendeur range des articles de son catalogue dans une **collection transversale**, par
exemple `soldes-ete`, et choisit l'ordre dans lequel ils s'affichent. La collection a son
slug public, sous la boutique.

Une collection capte une intention d'achat qu'une catégorie ne capte pas. La catégorie dit
ce qu'est un article, la collection dit pourquoi on le met en avant maintenant. La
section 3 de la spec T2d avait posé le besoin et renvoyé sa réalisation à plus tard, le
temps que la catégorie et les filtres vivent contre de vrais produits.

## 2. Décisions de cadrage

| Sujet | Décision | Raison |
|---|---|---|
| Qui crée | **Le vendeur seul** | Une collection de plateforme demande un écran de curation côté administration, et surtout un arbitrage : qui y entre, sur quel critère, et que devient un article mis en avant puis dépublié |
| URL | **`/shops/<shop>/collections/<slug>`** | Une collection appartient à une boutique, elle vit sous elle |
| Unicité du slug | **Par vendeur** | Même règle que le produit. Deux vendeurs ont le droit d'avoir chacun leur `soldes-ete`, et le premier arrivé ne confisque pas le nom |
| Publication | **Brouillon puis publiée** | Une collection se prépare. La révéler le jour voulu est l'usage même |
| Ordre | **Manuel, choisi par le vendeur** | C'est du marchandisage : l'article qu'on veut voir en premier n'est ni le plus récent ni le moins cher |
| Contrôles de tri publics | **Aucun** | Le vendeur a choisi l'ordre. Proposer « du moins cher au plus cher » annulerait son travail |

## 3. Périmètre

### Inclus

- Le modèle : `Collection`, `CollectionItem`, et l'énumération de statut
- L'écran vendeur : créer, renommer, ajouter et retirer un article, réordonner, publier
- La page publique de la collection, paginée
- Le mot réservé `collections` dans le slug d'un produit, et sa vérification de migration
- Les liens depuis la vitrine de la boutique vers ses collections publiées

### Exclu explicitement

- Les collections de plateforme, transversales à plusieurs boutiques
- Une collection contenant des produits d'une autre boutique
- La collection comme filtre du catalogue global, qui créerait un second espace de noms
  de filtres à côté des catégories
- Toute automatisation : collection construite par règle, par exemple « tous les articles
  à moins de 50 € ». Une collection est un choix humain

## 4. Le modèle

```prisma
enum E_COLLECTION_STATUS {
  DRAFT
  PUBLISHED
  @@map("collection_status")
}

model Collection {
  id          String              @id @default(cuid(2))
  vendorId    String              @map("vendor_id")
  slug        String
  title       String
  description String?
  status      E_COLLECTION_STATUS @default(DRAFT)

  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")
  publishedAt DateTime? @map("published_at")

  vendor Vendor           @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  items  CollectionItem[]

  @@unique([vendorId, slug])
  @@index([vendorId, status])
  @@map("collections")
}

model CollectionItem {
  id           String @id @default(cuid(2))
  collectionId String @map("collection_id")
  productId    String @map("product_id")
  position     Int

  collection Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  product    Product    @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([collectionId, productId])
  @@index([productId])
  @@map("collection_items")
}
```

### Pourquoi `position` n'est PAS unique

La tentation est d'ajouter `@@unique([collectionId, position])`, puisque deux articles ne
devraient pas partager un rang. Elle rendrait l'échange de deux rangs impossible : la
première écriture violerait la contrainte avant que la seconde ne la rétablisse, et
PostgreSQL vérifie à chaque instruction, pas en fin de transaction.

Le réordonnancement réécrit donc **toutes** les positions de la collection dans une seule
transaction, en repartant de zéro. C'est aussi ce qui referme les trous laissés par un
retrait.

### Le tri public est `ORDER BY position, id`

Le départage par `id` n'est pas décoratif. La revue de T2d a trouvé que tous les tris du
catalogue finissaient sur `published_at`, qui n'est pas unique, ce qui laissait
`LIMIT/OFFSET` répéter une ligne sur une page et en sauter une autre, rendant un produit
invisible sans rien signaler. Deux positions égales ne devraient pas exister, mais une
contrainte absente se répare mal après coup. On applique la leçon à l'écriture.

### Cascades

`Cascade` depuis la collection vers ses lignes, et depuis le produit vers ses lignes.
Supprimer un produit le retire de toutes les collections où il figurait, ce qui est le
comportement attendu : une collection qui pointerait vers un produit disparu afficherait
un trou que personne ne saurait expliquer.

## 5. Le mot réservé, et pourquoi il faut le réserver

`/shops/[shop]/[product]` est un segment dynamique. Next résout un segment **statique**
avant un segment dynamique, donc `/shops/atelier/collections` désignerait la liste des
collections, et un produit dont le slug vaudrait `collections` deviendrait inatteignable,
sans aucun message.

`slugifyProductTitle` refuse donc ce mot. Son commentaire actuel annonçait déjà cet
endroit : « le jour où un titre de produit demande une règle propre, elle a un endroit où
aller sans toucher aux boutiques ».

**La migration vérifie qu'aucun produit ne porte déjà ce slug, et échoue si c'en est un.**
Le catalogue est vide aujourd'hui, donc la vérification ne trouvera rien. Elle existe pour
le jour où ce ne sera plus vrai : une migration qui casse une URL en silence est
exactement ce qu'on ne veut pas découvrir en production.

## 6. L'écran vendeur

```
┌──────────────────────────────────────────┐
│  Soldes d'été                 Brouillon  │
│  ──────────────────────────────          │
│  1.  Sac cabas              ▲ ▼  Retirer │
│  2.  Étole de soie          ▲ ▼  Retirer │
│  3.  Bracelet jonc          ▲ ▼  Retirer │
│                                          │
│  [ Ajouter un produit ]   [ Publier ]    │
└──────────────────────────────────────────┘
```

Les routes suivent celles des produits, déjà en place : `/collections`,
`/collections/new`, `/collections/[id]`.

### Des boutons, pas du glisser-déposer

Le glisser-déposer demande une bibliothèque, n'a aucune histoire au clavier sans travail
supplémentaire, et se teste mal avec Playwright. Deux boutons sont accessibles d'office,
se visent par leur nom accessible, et suivent la direction visuelle du dépôt : un filet,
pas une boîte.

Chaque clic envoie une action serveur qui réécrit les positions. Pas de réordonnancement
optimiste côté client : l'ordre est la donnée, et un affichage qui anticiperait l'écriture
mentirait si elle échouait.

### Un produit dépublié garde sa place

La position appartient à la collection, la publication appartient au produit. Un article
dépublié disparaît de la page publique et reste dans l'écran vendeur, à son rang, signalé
comme non visible. Le republier le remet où il était.

## 7. La page publique

`/shops/<shop>/collections/<slug>`, vingt-quatre articles par page, aucun contrôle de tri.

**Il n'y a pas de page d'index publique.** La vitrine de la boutique liste ses collections
publiées, en haut de sa grille de produits. Une route `/shops/<shop>/collections` de plus
n'apporterait qu'un détour, puisque la vitrine est déjà l'endroit où l'on arrive. Cette
adresse répond donc 404, ce qui est correct : le segment `collections` existe dans l'arbre
des routes sans porter de page, et Next ne retombe pas sur le segment dynamique voisin.
C'est d'ailleurs la mécanique exacte qui rend le mot réservé nécessaire.

Elle applique **les mêmes conditions d'éligibilité que le catalogue**, qui sont dans
`conditions()` de `catalog.repository.ts` : `status = 'PUBLISHED'`, produit et boutique non
supprimés, une image `READY` (par `i.object_path IS NOT NULL`), et au moins une variante,
implicite dans la jointure interne sur `product_variants`.

Les répéter à la main créerait une seconde vérité. La revue de T2d a déjà payé cet écart :
un décompte de devises comptait des produits que la liste ne savait pas montrer, et
accueillait le visiteur avec « rien ne correspond » sans qu'aucun filtre soit actif.

**La devise est celle de la boutique, pas celle du cookie**, comme la vitrine. Son code
porte la raison : borner la vitrine au cookie ferait disparaître les produits de la
boutique qu'on est venu voir.

La collection est donc un filtre de plus sur cette requête, un fragment ajouté à
`conditions`, ce que la passation donne comme la seule façon de l'étendre. Jamais une
concaténation de chaîne.

## 8. Tests

On écrit un test quand il vaut la peine d'être écrit.

| Quoi | Comment | Pourquoi celui-là |
|---|---|---|
| Le mot réservé | Vitest, `@clemperl/domain` | Pur, et sa violation casse une URL en silence |
| Le recalcul des positions | Vitest, `@clemperl/domain` | Une fonction pure prend la liste et le mouvement, et rend la nouvelle liste |
| Réordonner, retirer, cascader | Jest et Testcontainers, `apps/api` | Ce qu'on veut prouver est transactionnel, donc une propriété de la base |
| Le parcours entier | Playwright | Le vendeur crée, ajoute deux articles, inverse leur ordre, publie ; le visiteur les voit dans cet ordre |

Le parcours couvre aussi le cas qui ne se voit pas autrement : dépublier le premier
article, constater qu'il disparaît de la page publique, le republier, et le retrouver en
tête.

## 9. Critères d'acceptation

T2e est terminée quand ces sept points sont vérifiés :

1. Un vendeur crée une collection, elle naît en brouillon et n'est pas servie au public
2. Il y range deux articles, les réordonne, et l'ordre tient après rechargement
3. Il publie, et un visiteur sans compte voit la collection dans l'ordre choisi
4. Un article dépublié disparaît de la page publique et reste à son rang côté vendeur
5. Un produit dont le titre donnerait le slug `collections` est refusé, avec un message en
   français
6. La vitrine d'une boutique mène à ses collections publiées, et à elles seules
7. `pnpm lint`, `typecheck`, `test`, `test:e2e`, la suite d'intégration et les seuils
   passent

## 10. Risques

| Risque | Impact | Traitement |
|---|---|---|
| **Réécrire toutes les positions à chaque mouvement** | Une collection de mille articles écrit mille lignes par clic | Accepté. Une collection est un choix humain, pas un import. Le jour où elle est longue, la sortie est un pas d'incrément et des positions espacées |
| **Deux onglets réordonnent la même collection** | La dernière écriture gagne | Même décision que pour la fiche boutique en T2a, et même raison : une boutique n'a qu'un membre tant que les invitations n'existent pas |
| **La page publique duplique les conditions du catalogue** | Deux vérités qui divergent, le défaut exact que la revue de T2d a trouvé | La collection est un fragment ajouté à `conditions()`, jamais une requête parallèle. Un test d'intégration vérifie qu'un produit sans image prête n'apparaît dans aucune des deux |
| **Un produit existant porte déjà le slug `collections`** | Sa page devient inatteignable sans message | La migration vérifie et échoue. Le catalogue est vide, donc elle ne trouvera rien aujourd'hui |
