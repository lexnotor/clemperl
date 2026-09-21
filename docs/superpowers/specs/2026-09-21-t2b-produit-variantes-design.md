# ClemPerl — T2b : Le produit et ses variantes

**Date** : 2026-09-21
**Statut** : design validé, en attente de plan d'implémentation
**Tranche** : T2b — deuxième des quatre sous-tranches de T2
**S'appuie sur** : `2026-09-20-t2a-espace-vendeur-design.md`, livrée

---

## 1. Objectif

Un vendeur validé décrit ce qu'il vend. Il crée un produit, déclare ce qui distingue ses
déclinaisons, fixe un prix pour chacune, et le publie quand il est prêt.

T2a a livré le **lieu** — un espace vendeur et une boutique corrigeable. T2b livre ce
qu'on y range. C'est aussi la tranche où **l'argent entre dans le schéma** : `IMoney` et
la table des exposants vivent dans `packages/core` depuis T0, mais aucune colonne de prix
n'existe encore.

## 2. Ce que T2b décide, et que T2c et T2d hériteront

Cinq décisions ont été prises au cadrage. Elles sont ici en tête parce que chacune
contraint les deux sous-tranches suivantes.

| Décision | Ce qui a été retenu |
|---|---|
| **Variantes** | Un produit a TOUJOURS au moins une variante. Prix et, plus tard, stock vivent sur la variante, jamais sur le produit |
| **Devise** | Une devise par boutique, pas par produit ni par variante |
| **Stock** | Hors T2b. Il arrive en T3, quand la commande donne une raison de le décrémenter |
| **Axes** | Le vendeur déclare ses axes par produit ; les variantes sont leurs combinaisons |
| **Publication** | Brouillon / publié, brouillon par défaut |

**Pourquoi « toujours au moins une variante ».** L'alternative — un produit simple qui
porte son prix, et des produits à variantes qui portent les leurs — met deux formes en
base. Le panier, la commande, la facture et le catalogue devraient alors lire un prix de
deux manières. C'est exactement la divergence que T0 nommait comme risque principal : la
même règle écrite à deux endroits, qui finit par diverger en silence.

Le coût est à l'écran, pas en base : l'espace vendeur doit **masquer** la variante unique,
sinon le joaillier qui vend une pièce unique se retrouve devant un vocabulaire qui ne le
concerne pas. C'est une contrainte d'interface, tenue en section 8.

**Pourquoi une devise par boutique.** Une boutique est une entité légale unique, avec un
seul pays — `Vendor.country` existe depuis T1b — et un seul compte bancaire à terme. Une
devise par variante autoriserait un même produit en EUR et en XOF, ce qui n'a aucun sens
commercial et que rien dans le schéma n'empêcherait. Un panier mélangeant deux boutiques
mélange deux devises : c'est un problème de T3, et il se pose de la même façon quelle que
soit la décision prise ici.

## 3. Périmètre

### Inclus

- Créer un produit : titre, description, un prix
- Corriger un produit, y compris ses axes et les prix de ses variantes
- Déclarer des axes et leurs valeurs ; la grille de variantes en découle
- Publier un produit, et le repasser en brouillon
- Lister les produits de la boutique
- Choisir la devise de la boutique, dans `/shop`

### Exclu explicitement

- **Les images** — T2c. Un produit de T2b n'a aucun média, et l'écran ne prétend pas le
  contraire.
- **Le stock** — T3. Aucune quantité, aucune disponibilité affichée.
- **Le catalogue public** — T2d. Rien de ce qui est publié n'est visible hors de l'espace
  vendeur.
- **La référence article et le code-barres** — ils n'ont d'usage qu'avec le stock.
- **Les remises, la fiscalité, les frais de port.**
- **L'import en masse**, et toute forme de duplication de produit.
- **L'archivage.** Un produit retiré redevient brouillon. L'archivage protège les
  commandes passées qui référencent un produit — aucune commande n'existe avant T3.

## 4. Le modèle

Cinq tables, dont la plus large tient en six colonnes.

```
Product              id, vendorId, slug, title, description, status, timestamps
ProductOption        id, productId, name, position
ProductOptionValue   id, optionId, label, position
ProductVariant       id, productId, priceAmount, combinationKey, position, timestamps
ProductVariantValue  id, variantId, optionId, optionValueId
```

Un enum nouveau :

```prisma
enum E_PRODUCT_STATUS {
  DRAFT
  PUBLISHED
}
```

Les conventions du dépôt s'appliquent : `@map` en snake_case sur chaque colonne, `@@map`
au pluriel sur chaque table, `cuid(2)` en identifiant.

**Seul `Product` porte un `deletedAt`.** Les quatre autres tables sont *dérivées* de ses
axes : une variante dont la valeur disparaît n'a plus d'existence, et la conserver en
sourdine produirait des lignes que l'unicité de `combinationKey` bloquerait au prochain
ajout de la même valeur. Elles se suppriment donc pour de bon, en cascade depuis leur
parent. Ce choix se rediscutera en T3, quand une commande passée référencera une variante
qu'il faudra cesser de pouvoir effacer.

### `combinationKey`, et pourquoi elle existe

Deux variantes d'un même produit ne doivent pas porter la même combinaison de valeurs.
Cette règle ne s'exprime pas par un index unique : la combinaison vit dans une table de
jointure, sur plusieurs lignes.

La variante porte donc une clé dérivée — les identifiants de ses valeurs, **triés** puis
joints par un séparateur. Un index `@@unique([productId, combinationKey])` rend alors le
doublon impossible en base.

Le tri n'est pas un détail : sans lui, `M|Noir` et `Noir|M` désigneraient la même
combinaison sous deux clés différentes, et l'index ne verrait rien.

Le cas sans axe tombe de lui-même. La clé vaut la chaîne vide, et l'unicité garantit
**exactement une** variante. La règle « toujours au moins une variante » cesse d'être un
commentaire pour devenir une contrainte que la base fait respecter.

### `ProductVariantValue` porte `optionId`, qui paraît redondant

`optionValueId` suffirait à retrouver l'axe, par jointure. La colonne est là pour porter
un second index : `@@unique([variantId, optionId])`, qui interdit qu'une variante déclare
deux tailles. Une dénormalisation d'une colonne contre une contrainte que la base tient
seule.

### Le slug arrive maintenant, pas en T2d

T2d fera du produit une URL publique. Ajouter le slug là-bas imposerait une migration sur
des données vivantes, un remplissage rétroactif, et la résolution des collisions
apparues entre-temps. Il naît donc ici, `@@unique([vendorId, slug])`.

Il se dérive du titre, se corrige tant que le produit est en brouillon, et **se fige à la
première publication** — pour la raison qui a figé le slug de boutique en T2a : une URL
publique qui bouge est une URL cassée.

## 5. L'argent

`ProductVariant.priceAmount` est un **entier**, dans l'unité mineure de la devise. Aucun
nombre à virgule flottante n'approche un prix, à aucun moment.

**La devise n'est pas sur la variante.** Un prix se lit toujours comme
`variant.priceAmount` accompagné de `vendor.currency`. Une seule écriture de la devise
par boutique, donc aucune divergence possible entre deux variantes d'un même produit.

`Int` en PostgreSQL plafonne à 2 147 483 647 : 2,1 milliards de francs CFA, environ
3,2 M€. Au-dessus de tout article des trois métiers visés. Le plafond est un choix, pas
une surprise — il est écrit ici pour que le jour où il gêne, on sache qu'il a été vu.

`CURRENCY_EXPONENT` de `packages/core` reste la seule source de vérité pour la conversion
en unité majeure. Le XOF et le XAF ont un exposant de **zéro** : diviser par 100 y produit
un prix cent fois trop petit, et tous les tests en euros passeraient.

### La devise de la boutique est nullable, et se fige

`Vendor.currency` est `E_CURRENCY?`. **Aucune valeur par défaut** : un défaut faux est
précisément ce qui produit des montants faux sans rien signaler.

Trois règles :

1. Le vendeur la choisit dans `/shop`. Tant qu'elle manque, `/products` l'y renvoie —
   on ne fixe pas un prix avant d'avoir dit en quoi.
2. Elle se fige dès qu'un produit existe. Sans cela, la changer transformerait `10000` de
   « dix mille francs CFA » en « cent euros » sur tout le catalogue, sans erreur et sans
   trace.
3. Elle **n'entre pas** dans `updateShopProfile`. Cette signature dit « ces champs se
   corrigent librement », et la devise ne le fait pas. Elle a sa propre fonction,
   `setShopCurrency(prisma, { vendorId, currency })`, qui refuse dès qu'un produit
   existe. Mêler les deux ferait d'une signature claire une signature à conditions —
   exactement ce que T2a a évité en excluant les champs légaux plutôt qu'en les
   vérifiant.

Aucune reprise de données, et la candidature de T1b n'est pas touchée.

## 6. Où vivent les règles

`packages/domain` gagne quatre fichiers. Aucune règle métier ne vit dans un composant ni
dans une action serveur.

| Fichier | Ce qu'il détient |
|---|---|
| `schemas/product.schema.ts` | titre, description, axes, valeurs, prix |
| `utils/variant-matrix.utils.ts` | les axes → la grille de variantes |
| `utils/product-slug.utils.ts` | le slug, dérivé du titre |
| `errors/product.error.ts` | les refus, localisés |

### `variant-matrix.utils.ts` est le cœur, et il est pur

Il prend les axes déclarés et les variantes existantes, et rend la nouvelle grille. Aucune
base, aucun réseau, aucune horloge.

Trois règles qu'il applique :

- **Ajouter une valeur** crée les variantes correspondantes, chacune héritant du prix de
  la variante de `position` la plus basse. Un vendeur qui déclare « Taille : L » après
  avoir fixé un prix ne repart pas de zéro.
- **Retirer une valeur** supprime les variantes qui la portent, et elles seules.
- **Retirer le dernier axe** ramène à une variante unique, qui hérite du même prix.

« La première » désigne toujours la `position` la plus basse, jamais l'ordre que rend la
base — un `findMany` sans `orderBy` ne garantit aucun ordre, et le prix hérité changerait
d'une exécution à l'autre.

La pureté n'est pas une élégance : c'est la fonction où une erreur coûterait le plus cher,
et c'est la seule de la tranche qui se teste exhaustivement sans monter quoi que ce soit.

### `product-slug.utils.ts` réutilise ce qui existe

`slugifyShopName` de T1b fait déjà le travail : dépliage des accents, minuscules, tirets,
troncature. La dérivation d'un titre de produit est la même opération sur une autre
entrée. Le noyau est extrait sous un nom neutre, et les deux dérivations l'appellent. Rien
du comportement de T1b ne change, et ses tests le prouvent.

## 7. La lecture et l'écriture

`packages/db/src/repositories/product.repository.ts`, sur le modèle de
`vendor.repository.ts`.

### Chaque signature porte `vendorId`, et ce n'est pas décoratif

T2a a posé que le `vendorId` vient de la session et jamais du formulaire. T2b introduit
une chose que T2a n'avait pas : **un identifiant qui vient du client**. `/products/[id]`
porte un `productId` dans son URL, et l'action de sauvegarde le reçoit.

Tout dépôt qui lit ou écrit un produit filtre donc sur `(id, vendorId)`, jamais sur `id`
seul :

```ts
export async function readProductForVendor(
    prisma: PrismaClient,
    input: { productId: string; vendorId: string },
) { /* where: { id: input.productId, vendorId: input.vendorId, deletedAt: null } */ }
```

Sans cela, un vendeur corrige le produit d'un autre en changeant un chiffre dans l'URL.
C'est la faille la plus courante de ce genre d'écran. Elle se ferme dans la **signature**
du dépôt — une vérification à l'entrée s'oublie au prochain appelant, une signature non.
C'est le même raisonnement que celui qui a exclu les champs légaux de
`updateShopProfile`.

### L'écriture d'une grille est une transaction

Corriger les axes d'un produit supprime des variantes, en crée d'autres, et met à jour des
prix. Une écriture partielle laisserait un produit sans variante, ou avec des variantes
orphelines de leur combinaison. Tout passe donc par un `$transaction`.

## 8. Les écrans, dans `apps/vendor`

### `/products` — la liste

Titre, état, fourchette de prix, nombre de variantes. Un lien vers la création.

Vide, elle dit quoi faire plutôt que de montrer un tableau sans lignes.

### `/products/new` — la création

Titre, description, **un prix**. Crée un brouillon avec sa variante unique.

C'est tout le parcours du joaillier qui vend des pièces uniques : il ne voit jamais le mot
« variante », et rien à l'écran ne lui demande d'en comprendre la notion.

### `/products/[id]` — la fiche

Les mêmes champs, plus les axes et la grille de prix.

Déclarer « Taille » avec S, M et L fait passer la grille d'une ligne à trois, chacune
héritant du prix courant. Un bouton fait passer en publié, un autre ramène en brouillon.

**La grille n'apparaît que s'il existe au moins un axe.** Sans axe, l'écran montre un
champ « Prix », et le mot « variante » n'est écrit nulle part. C'est la contrainte
d'interface qu'impose la décision de la section 2.

### `/shop` — un champ de plus

Le sélecteur de devise, désactivé dès qu'un produit existe, avec la raison affichée à
côté plutôt qu'un contrôle grisé sans explication.

### La garde

`requireVendorMembership()` existe depuis T2a et est **rappelée dans chaque action
serveur**, jamais posée dans un layout. Une action serveur est une route publique, et la
page qui l'a rendue ne la protège pas.

## 9. Les erreurs

`docs/conventions/erreurs.md` s'applique. Les refus sont des erreurs de domaine
localisées, pas des chaînes construites dans un composant.

Les libellés vivent dans `packages/i18n/messages/vendor/fr.json`. Aucun texte visible
n'est écrit dans un fichier `.tsx`.

Le `catch` d'une action serveur **journalise l'erreur avant** de rendre son message
localisé. Un `catch` nu laisse un vendeur devant « l'enregistrement a échoué » et des
journaux vides, ce qui ne distingue pas une panne passagère d'un défaut de schéma qui ne
réussira jamais.

## 10. Trois pièges déjà payés qui s'appliquent ici

- **Tailwind 4 n'accepte plus `classe-[--variable]`.** Écrire l'utilitaire généré
  (`accent-texte`) quand le jeton vient de `@theme`. La classe fautive est émise sans
  erreur et jetée par le navigateur.
- **`getByLabel` de Playwright compare le texte du label par sous-chaîne**, et `Field`
  enveloppe son contrôle dans le `<label>`. Préférer `getByRole` avec un nom accessible.
- **Une variable lue au build doit figurer dans `globalEnv` de `turbo.json`**, sans quoi
  le mode strict la filtre et le cache sert un artefact construit avec l'ancienne valeur.

## 11. Tests

| Couche | Ce qu'elle prouve ici |
|---|---|
| Unitaire | la grille de variantes, le slug, les schémas — dont un prix négatif, un prix non entier et un titre vide |
| Intégration | l'unicité de `combinationKey`, l'unicité `(variantId, optionId)`, le filtrage `(id, vendorId)`, la transaction — contre un vrai PostgreSQL |
| E2E navigateur | créer, déclarer un axe, fixer trois prix, publier |

La couche intégration est celle qui compte le plus ici : les trois garanties de cette
tranche sont des **contraintes de base**, et un substitut en mémoire ne reproduit ni un
index unique ni le rollback d'une transaction.

Le cliquet de couverture s'applique : les planchers valent la valeur mesurée, et ils ne
descendent pas.

## 12. Critères d'acceptation

1. Un vendeur sans devise déclarée est renvoyé vers `/shop` avant de pouvoir créer un
   produit
2. Un produit créé sans axe a exactement une variante, et l'écran n'écrit jamais
   « variante »
3. Déclarer un axe à trois valeurs produit trois variantes, chacune au prix courant
4. Retirer une valeur supprime ses variantes, et jamais les autres
5. Deux variantes de même combinaison sont refusées **par la base**, pas par le code
6. Un produit naît en brouillon et n'en sort que par un geste explicite
7. Un vendeur ne peut ni lire ni corriger le produit d'une autre boutique, même en
   forgeant l'identifiant dans l'URL
8. La devise de la boutique ne se change plus dès qu'un produit existe
9. `lint`, `typecheck`, `test`, `test:e2e` et les seuils de couverture passent

## 13. Risques

| Risque | Impact | Traitement |
|---|---|---|
| **La grille de variantes est la logique la plus dense de la tranche** | Un produit se retrouve sans variante, ou avec des variantes en double | La fonction est pure et testée exhaustivement ; la base tient l'unicité indépendamment d'elle |
| **Le prix passe par un formulaire HTML, donc par une chaîne** | Un `"12,50"` saisi à la française devient `12` ou `NaN` | La conversion est une fonction du domaine, testée sur les quatre devises, dont deux à exposant zéro |
| **`combinationKey` dépend d'un tri** | Deux clés différentes pour la même combinaison, index aveugle | Le tri est dans la fonction pure, avec son propre test |
| **La devise figée repose sur « un produit existe »** | Un vendeur bloqué par un brouillon oublié | Accepté : le déblocage est la suppression du brouillon, et le message le dit |
