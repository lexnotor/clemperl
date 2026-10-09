# ClemPerl, T3 : panier et commande

**Date** : 2026-10-09
**Statut** : cadrée, non commencée
**Tranche** : T3
**S'appuie sur** : `2026-09-21-t2b-produit-variantes-design.md`,
`2026-09-24-t2c-pipeline-medias-design.md`, `2026-10-02-t2d-catalogue-public-design.md`
et `2026-10-03-t2e-collections-design.md`, toutes livrées

---

## 1. Objectif

Un visiteur remplit un panier depuis le catalogue, le relit, se connecte, donne une adresse
et passe commande. Chaque boutique reçoit sa commande, la voit, et la fait avancer.

T4 encaissera. T3 s'arrête à une commande enregistrée, actionnable par le vendeur sans
qu'aucun paiement n'existe.

C'est la tranche qui donne un débouché à tout ce que T2 a construit. La fiche produit de
T2d propose aujourd'hui un `mailto:` faute de panier, et elle a été dessinée pour que ce
lien devienne un bouton sans redessiner l'écran.

## 2. Ce que T3 décide

### Une commande par boutique, depuis un panier unique

Un panier peut contenir des articles de trois boutiques. Sa validation produit trois
commandes, chacune rattachée à sa boutique, avec son état, son total et ses lignes.

C'est la forme qui correspond à la réalité : trois colis, trois expéditeurs, trois litiges
possibles. Un vendeur ne voit que la sienne, et T4 encaissera par commande, ce qu'un total
unique rendrait inextricable le jour où il faudra rembourser une boutique sur trois.

L'acheteur voit cette découpe **avant** de valider, dans son panier groupé par boutique :
la commande ne doit pas se scinder dans son dos.

### Le panier est local tant qu'il n'y a pas de compte

Sans compte, rien n'existe côté serveur. Le navigateur garde la liste.

Elle ne range que des **identifiants de déclinaison et des quantités**, jamais de prix. Les
prix se relisent à chaque rendu : rangés localement, un panier vieux d'une semaine
afficherait des montants périmés, et l'acheteur commanderait au prix d'avant.

À la connexion, le front envoie sa liste, le serveur la valide et la range. Ensuite c'est un
panier ordinaire : le serveur fait foi, et un ajout va directement en base.

Ce que ça ne fait pas : le panier d'un visiteur ne suit pas d'un appareil à l'autre, et se
perd si le navigateur est nettoyé. C'est le prix de n'avoir aucune table pour qui n'a pas de
compte, ni panier orphelin à balayer.

### Le serveur refuse, et le dit

À la remontée comme à l'ajout, chaque article passe **les conditions d'éligibilité du
catalogue**, jamais une seconde vérité : la déclinaison existe, son produit est publié et
non supprimé, sa boutique est ouverte, et il a une image prête.

Un article refusé est **nommé à l'acheteur**. Un panier qui perd une ligne en silence est
pire qu'un refus : l'acheteur commande en croyant avoir ce qu'il n'a plus.

### Un panier, une devise

La devise est posée par le premier article et libérée quand le panier se vide. Un ajout
d'une boutique qui chiffre autrement est refusé, avec un message qui l'explique.

Le refus vaut **aussi côté local**, pour qu'il arrive au moment de l'ajout et non après la
connexion. Un acheteur qui découvre à la connexion que la moitié de son panier est écartée
ne comprendra pas pourquoi.

### La commande fige ce qu'elle vend

`OrderItem` porte le titre du produit, le libellé de la déclinaison, le prix unitaire et le
chemin de l'image, copiés à la validation.

Une commande est une **pièce comptable**, pas une vue sur un catalogue. La question n'est
pas quelle donnée est la plus propre aujourd'hui, mais ce que ce document doit dire quand
tout le reste a changé. Le vendeur renomme son produit, change son prix, le dépublie, le
supprime, ferme sa boutique : la commande dit toujours ce qui a été acheté et à quel prix.

Le prix figé, à lui seul, impose déjà ce raisonnement. Figer le prix sans figer ce qui le
justifie laisserait un montant sans objet.

La ligne garde quand même `variantId`, nullable : on fige pour l'affichage et la facture, on
référence pour l'analyse. « Combien ai-je vendu de ce produit » reste une requête ordinaire.

### Le prix affiché est celui qui engage

L'écran de validation envoie le total qu'il a montré. Le dépôt recalcule et **refuse** s'il
diffère.

C'est ce que `createProduct` fait depuis T2b avec `expectedCurrency`, et pour la même
raison : on n'écrit pas un montant dont on ne sait plus ce qu'il vaut. L'acheteur revoit
alors son panier avec les prix à jour, et décide.

## 3. Périmètre

**Dans T3** : le panier local, sa remontée à la connexion, le panier en base, l'écran de
panier, la validation avec adresse et mot, les commandes par boutique, les écrans acheteur
et vendeur, et l'avancement d'état.

**Hors T3, et nommé ici pour ne pas être redécouvert :**

Le **paiement**, qui est T4. Une commande naît `PLACED` et le restera jusqu'à ce qu'un
vendeur la fasse avancer. T4 insérera son état sans redessiner la machine.

Le **stock**. Rien dans le schéma ne compte quoi que ce soit, donc on ne réserve rien et on
ne refuse rien pour rupture. Deux acheteurs peuvent commander le dernier exemplaire ; c'est
le vendeur qui tranche en annulant.

La **livraison** : aucun transporteur, aucun frais, aucun suivi. L'adresse est transmise au
vendeur, et l'expédition se règle entre eux.

Le **carnet d'adresses**. L'adresse est saisie à chaque commande et figée dessus. Un carnet
viendra s'il sert, et il lira ces commandes.

Les **courriels** de confirmation. Le mécanisme existe depuis T1a, mais prévenir un vendeur
et un acheteur demande de décider quoi dire à chaque transition, ce qui mérite sa propre
tranche.

## 4. Le modèle

```prisma
enum E_ORDER_STATUS {
  PLACED
  ACCEPTED
  SHIPPED
  CANCELLED

  @@map("order_status")
}

model Cart {
  id       String     @id @default(cuid(2))
  // Un panier vivant par compte. L'unicité est portée par la base, pas par le code.
  userId   String     @unique @map("user_id")
  currency E_CURRENCY

  user  User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  items CartItem[]

  @@map("carts")
}

model CartItem {
  id        String @id @default(cuid(2))
  cartId    String @map("cart_id")
  variantId String @map("variant_id")
  quantity  Int

  cart    Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variant ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  // Un article, UNE ligne : ajouter deux fois la même déclinaison incrémente la
  // quantité, et l'index le garantit plutôt qu'un code qui y pense.
  @@unique([cartId, variantId])
  @@map("cart_items")
}

model Order {
  id        String         @id @default(cuid(2))
  // Lisible, et donnée à l'acheteur. Un `cuid` est un bon identifiant et une mauvaise
  // chose à dicter au téléphone.
  reference String         @unique
  buyerId   String         @map("buyer_id")
  vendorId  String         @map("vendor_id")
  status    E_ORDER_STATUS @default(PLACED)
  currency  E_CURRENCY

  // FIGÉ, comme les lignes : l'acheteur peut déménager, et la commande doit dire où elle
  // a été envoyée, pas où il habite aujourd'hui.
  shipToName    String  @map("ship_to_name")
  shipToPhone   String  @map("ship_to_phone")
  shipToLine    String  @map("ship_to_line")
  shipToCity    String  @map("ship_to_city")
  shipToCountry String  @map("ship_to_country")
  note          String?

  totalAmount Int      @map("total_amount")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  // `Restrict` et non `Cascade` : fermer une boutique ne doit pas effacer l'historique
  // d'achat de ses clients. C'est l'inverse du catalogue, qui n'a aucun sens sans elle.
  buyer  User        @relation(fields: [buyerId], references: [id], onDelete: Restrict)
  vendor Vendor      @relation(fields: [vendorId], references: [id], onDelete: Restrict)
  items  OrderItem[]

  @@index([vendorId, status])
  @@index([buyerId, createdAt])
  @@map("orders")
}

model OrderItem {
  id      String @id @default(cuid(2))
  orderId String @map("order_id")

  // Nullable et `SetNull` : supprimer un produit ne doit JAMAIS emporter une commande.
  // Sans cela, `Product` cascadant depuis `Vendor`, fermer une boutique effacerait les
  // commandes de ses clients.
  variantId String? @map("variant_id")

  // FIGÉS à la validation. Relire la variante ferait dire à la commande ce que le
  // catalogue dit aujourd'hui, pas ce qui a été acheté.
  productTitle String @map("product_title")
  variantLabel String @map("variant_label")
  imagePath    String @map("image_path")
  unitAmount   Int    @map("unit_amount")
  quantity     Int

  order   Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variant ProductVariant? @relation(fields: [variantId], references: [id], onDelete: SetNull)

  @@index([variantId])
  @@map("order_items")
}
```

Trois modèles existants gagnent leur relation inverse, sans quoi Prisma refuse le schéma :
`User` reçoit `cart Cart?` et `orders Order[]`, `Vendor` reçoit `orders Order[]`, et
`ProductVariant` reçoit `cartItems CartItem[]` et `orderItems OrderItem[]`.

`variantLabel` est la combinaison lisible, « Taille : L, Couleur : Noir », construite à la
validation depuis les axes et leurs valeurs. Vide pour un produit sans axe.

## 5. La machine à états

Une table de transitions en **donnée**, dans `packages/domain`, et les deux fonctions pures
que T1b a déjà écrites pour les candidatures. Les relire suffit à connaître tout le système,
ce qu'une cascade de `if` ne donne jamais.

```ts
export const ORDER_TRANSITIONS = {
    PLACED:    { ACCEPT: "ACCEPTED", CANCEL: "CANCELLED" },
    ACCEPTED:  { SHIP: "SHIPPED",    CANCEL: "CANCELLED" },
    SHIPPED:   {},
    CANCELLED: {},
};
```

Seul le **vendeur** fait avancer. L'acheteur lit le même état, et n'annule pas : une
annulation touche un vendeur qui a peut-être déjà emballé, et ce qu'il faut alors c'est un
échange, pas un bouton. Il viendra avec les courriels.

T4 insérera son état entre `PLACED` et `ACCEPTED` en ajoutant deux lignes à cette table.

## 6. Le panier, de local à serveur

**Sans compte.** Une liste dans le navigateur : `[{ variantId, quantity }]` et la devise.
Aucun prix, aucun titre. Tout l'affichage se relit au rendu, par la même lecture que celle
du serveur.

**À la connexion.** Le front envoie sa liste. Le serveur valide article par article, range
ce qui passe, et **rend ce qui ne passe pas avec sa raison**. Le front vide alors sa liste
locale : deux sources qui se croient toutes deux à jour est exactement ce qu'on évite.

**Connecté.** L'ajout va directement en base. Le panier local ne sert plus.

**La devise.** Posée par le premier article, libérée quand le panier se vide. Un ajout d'une
autre devise est refusé des deux côtés, local et serveur.

Le panier s'affiche dans SA devise, qui est celle de ses articles, et non dans celle du
cookie du catalogue. Les deux peuvent diverger : le cookie borne ce que la liste montre, il
ne décide pas de ce qui a déjà été mis au panier. Changer de devise au catalogue ne touche
donc jamais le panier.

## 7. La validation

Une transaction, et elle **relit tout**.

1. Verrou sur la ligne du panier, pour que deux validations simultanées ne produisent pas
   deux jeux de commandes. Même mécanique que le verrou de devise de T2b et celui des
   collections de T2e.
2. Relecture de chaque article avec les conditions d'éligibilité. Un article devenu
   inéligible interrompt tout et revient nommé : la commande ne part pas amputée.
3. Recalcul du total. S'il diffère de celui que l'écran a envoyé, refus, et l'acheteur
   revoit son panier à jour.
4. Groupement par boutique, une commande par groupe, avec sa référence et ses lignes figées.
5. Vidage du panier, dans la même transaction. Il ne doit exister aucun instant où les
   commandes sont écrites et le panier encore plein.

La **référence** est de la forme `CMD-<année>-<six caractères>`, tirée au hasard sur un
alphabet sans caractères ambigus, et son unicité est portée par la base. Une collision se
rejoue, elle ne remonte pas à l'acheteur.

## 8. Les écrans

```
boutique    /cart                     le panier, groupé par boutique
            /checkout                 adresse, téléphone, un mot par boutique
            /orders                   mes commandes
            /orders/<reference>       le détail et l'état
vendeur     /orders                   les commandes de ma boutique
            /orders/<id>              le détail, l'adresse, le mot, l'avancement
```

Sur la **fiche produit**, le `mailto:` de T2d devient « Ajouter au panier ». Rien d'autre ne
bouge sur cet écran, c'est le remplacement que T2d avait prévu.

Le **panier** groupe par boutique avec un sous-total par groupe, parce que chaque groupe
deviendra une commande. L'acheteur voit la découpe avant de la subir.

Le **détail vendeur** ne porte que les boutons que les transitions autorisent depuis l'état
courant, jamais un bouton grisé : une action impossible ne s'affiche pas.

« Mes commandes » rejoint la navigation du vendeur, à côté de « Mes collections ».

## 9. Les libellés

Une section `cart` et une section `orders` dans `packages/i18n/messages/storefront`, une
section `orders` dans `packages/i18n/messages/vendor`.

Les **états** sont des clés de traduction, comme les raisons d'échec de T2c et les
catégories de T2d : la base range `SHIPPED`, l'écran en fait « Expédiée ». Les **raisons de
refus** d'un article le sont aussi, parce qu'elles sont lues par un acheteur.

## 10. Les cas limites

Une commande reste lisible quand le produit est renommé, dépublié, supprimé, et quand la
boutique ferme. C'est la raison d'être de la section 2.

Un vendeur ne voit que ses commandes, un acheteur que les siennes. Les deux filtres vivent
dans la **signature** des fonctions de dépôt, pas dans une vérification d'appelant, parce
que les identifiants viennent de l'URL. C'est la règle que T2c a écrite et que T2e a dû
réapprendre.

Un panier vide ne mène pas à la validation. Une validation sur panier vide ne crée rien.

Une quantité est bornée : au moins un, au plus cent. Zéro retire la ligne.

Deux acheteurs commandent le dernier exemplaire : les deux commandes existent, il n'y a pas
de stock. Le vendeur en annule une.

Une page de commande inexistante, ou appartenant à quelqu'un d'autre, répond 404 et non 403 :
confirmer l'existence renseignerait déjà.

## 11. Pièges déjà payés qui s'appliquent ici

**Un composant client qui formate un prix** fait entrer `@clemperl/core`, donc nodemailer,
dans le paquet navigateur. Le panier affiche beaucoup de prix : tous se formatent côté
serveur et voyagent en chaînes.

**Un `getByText` non restreint** attrape l'annonceur de route de Next, et cherche une
sous-chaîne sans tenir compte de la casse. Les parcours de cette tranche visent dans `main`,
et n'attendent jamais un mot que l'écran portait déjà avant l'action.

**Taper avant que la page soit stabilisée** fait écraser la saisie par le rendu qui suit. Le
formulaire de validation en porte plusieurs champs, donc le parcours attend avant de taper.

**Les sources sont montées dans les conteneurs, pas la configuration.** La migration demande
`pnpm docker:up`.

**Une route se compile au premier accès.** Les six routes de cette tranche rejoignent
l'échauffement de `e2e/global-setup.ts`, sans quoi un test sain expire à l'arrivée.

## 12. Tests

**Pur, dans `packages/domain`** : les transitions d'état, exhaustivement, y compris une
action interdite depuis chaque état terminal. Le groupement par boutique. Le calcul des
totaux. La fabrication du libellé de déclinaison. Les bornes de quantité.

**Intégration, contre le vrai PostgreSQL** : la remontée du panier local avec ses refus
nommés, le refus d'une seconde devise, la validation transactionnelle, le refus sur total
divergent, deux validations simultanées qui ne produisent qu'un jeu de commandes,
l'isolement entre boutiques et entre acheteurs, et **une commande relue après suppression du
produit, de la boutique et des deux**.

**Navigateur** : un visiteur sans compte remplit son panier, se connecte, retrouve ses
articles, valide avec son adresse, et le vendeur voit la commande puis la fait avancer.
Un second parcours vérifie qu'un article dépublié entre l'ajout et la validation est refusé
nommément.

Le cliquet de couverture s'applique : les planchers valent la valeur mesurée, et ils ne
descendent pas.

## 13. Critères d'acceptation

1. Un visiteur sans compte remplit un panier que le serveur ignore, et le retrouve après
   connexion
2. Un article devenu inéligible à la remontée ou à la validation est refusé **nommément**,
   jamais escamoté
3. Un panier n'accepte qu'une devise, et le refus arrive dès l'ajout local
4. Valider un panier de trois boutiques produit trois commandes, et vide le panier dans la
   même transaction
5. Le total envoyé par l'écran engage : s'il diffère du total recalculé, rien n'est écrit
6. Une commande reste lisible après renommage, dépublication et suppression du produit, et
   après fermeture de la boutique
7. Un vendeur ne voit et ne fait avancer que ses commandes ; un acheteur ne voit que les
   siennes ; toute autre adresse répond 404
8. Le vendeur ne se voit proposer que les transitions autorisées depuis l'état courant
9. Aucun prix n'est formaté dans un composant client
10. `lint`, `typecheck`, `test`, `test:e2e` et les seuils de couverture passent

## 14. Risques

| Risque | Impact | Traitement |
|---|---|---|
| **Deux sources de panier, locale et serveur** | Un acheteur voit deux paniers différents selon qu'il est connecté | Le local est vidé dès que le serveur a pris la main, et n'est plus lu ensuite |
| **Le prix change entre l'affichage et la validation** | Un acheteur est débité d'un montant qu'il n'a pas vu | Le total affiché est envoyé et vérifié, comme `expectedCurrency` en T2b |
| **Deux validations simultanées du même panier** | Deux jeux de commandes pour un seul achat | Verrou sur la ligne du panier, comme en T2b et T2e |
| **Supprimer un produit emporte des commandes** | Un historique d'achat disparaît, et avec lui toute trace comptable | `variantId` nullable en `SetNull`, et les lignes figées ne lisent jamais la variante |
| **Aucun stock** | Deux acheteurs obtiennent le dernier exemplaire | Décision explicite : le vendeur annule. Le stock n'est pas de cette tranche |
| **Le panier local se perd** | Un acheteur non connecté perd sa sélection en nettoyant son navigateur | Accepté : c'est le prix de n'avoir aucune table pour qui n'a pas de compte |
