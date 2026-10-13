# ClemPerl, T5 : activer et suspendre une boutique

**Date** : 2026-10-13
**Statut** : cadrée, non commencée
**Tranche** : T5
**S'appuie sur** : `2026-10-02-t2d-catalogue-public-design.md` (le prédicat d'éligibilité)
et `2026-10-11-t4-paiement-design.md` (qui y a ajouté sa condition et posé le motif du
pointage manuel), toutes deux livrées

---

## 1. Objectif

Une boutique vend ou ne vend pas, et c'est un administrateur qui tranche.

L'abonnement d'un vendeur se négocie et s'encaisse **entièrement hors de la plateforme**,
parce que le tarif dépend de qui déploie ClemPerl. La plateforme n'enregistre donc aucun
montant, aucune devise, aucune échéance. Elle offre un seul levier : une boutique est
active, ou elle est suspendue.

C'est la tranche qui donne à l'administration son premier écran sur une boutique
**existante**. Jusqu'ici elle ne sait que décider d'une candidature.

## 2. Ce que T5 décide

### Une boutique suspendue ne vend plus

Ses articles quittent le catalogue : ils ne sont ni visibles, ni achetables. C'est ce que
l'abonnement achète, le droit de vendre, donc c'est là que son absence se voit.

L'alternative, bloquer la création en laissant vendre, a été écartée : une boutique qui ne
paie plus continuerait d'encaisser, et la suspension deviendrait une gêne au lieu d'être une
conséquence.

### C'est la BOUTIQUE qui est suspendue, jamais la personne

`Vendor` est la boutique : la table s'appelle `vendors` et porte `shop_name`, `slug`, les
produits et les commandes. Le vendeur est un `User` rattaché par `VendorMember`.

Les membres gardent donc leur compte, leur session et leur espace. Ils continuent de
préparer leurs produits et de traiter les commandes en cours. Et comme un compte peut être
membre de plusieurs boutiques, suspendre l'une ne touche pas les autres.

Ce que le vendeur lit dit la même chose : « votre boutique n'apparaît plus au catalogue »,
jamais « vous êtes suspendu ».

### Ce n'est PAS `deletedAt`

`Vendor.deletedAt` existe, il est lu comme filtre à vingt-cinq endroits, et rien ne l'écrit
nulle part. Son commentaire dit son sens : « une boutique fermée n'est pas une boutique
qu'on administre, `deletedAt` la retire de la lecture plutôt que de laisser un ancien
vendeur devant un espace fonctionnel ».

Une fermeture enferme donc le vendeur dehors, **délibérément**. Une suspension ne le fait
pas : elle revient. Confondre les deux rendrait indistinguables « fermée pour toujours » et
« en pause ce mois-ci », et ferait perdre son espace à un vendeur qui doit continuer à
travailler.

### Une boutique validée démarre ACTIVE

Valider une candidature est déjà un acte d'administration. La boutique vend dès le premier
jour, et l'administrateur ne suspend que s'il constate un défaut.

### Aucune transition automatique, et aucune échéance

Pas d'ordonnanceur, pas de tâche planifiée, pas de date de fin. La plateforme ne prétend pas
savoir quand quoi que ce soit expire : celui qui encaisse dehors sait déjà qui lui a versé
quoi. Elle obéit, elle ne rappelle rien.

C'est l'esprit de T4, où le vendeur pointe un encaissement hors ligne, étendu au cycle de vie
de la boutique.

## 3. Périmètre

**Dans T5** : deux colonnes sur `Vendor`, la condition dans le prédicat d'éligibilité, un
écran d'administration qui liste les boutiques et porte les deux actions, un bandeau côté
vendeur, et les libellés.

**Hors T5, et nommé ici pour ne pas être redécouvert :**

**Les formules et les quotas.** Le cadrage initial prévoyait une formule gratuite bornée et
des quotas sur trois axes. Le MVP part sans aucune notion de quota : on active, on
désactive. Les quotas reviendront s'ils servent, et ils se poseront sur la même colonne.

**Tout montant, toute devise, toute période.** Le prix dépend de l'opérateur qui déploie,
donc il vit dehors. Aucun port de paiement n'est touché, et celui de T4 est de toute façon
taillé pour une commande ponctuelle.

**Toute échéance et tout rappel.** Sans date, il n'y a rien à surveiller, donc aucun écran de
suivi n'est à construire.

**Le courriel qui préviendrait un vendeur de sa suspension.** Le mécanisme existe depuis
T1a, mais décider quoi dire et quand mérite sa propre tranche, avec les autres courriels.

**Le sélecteur de boutique.** Un compte peut être membre de plusieurs boutiques, et
l'interface n'en montre qu'une, arbitrairement. Voir la section 8.

## 4. Le modèle

Sur `Vendor`, deux colonnes :

```prisma
  // Une boutique suspendue ne vend plus : ses articles quittent le catalogue. Un
  // horodatage et non un booléen, parce que l'écran d'administration montre depuis quand.
  suspendedAt   DateTime? @map("suspended_at")

  // QUI a suspendu. Le paiement se négocie hors de la plateforme, donc cet acte n'a
  // aucune preuve extérieure : dire qui l'a posé est le minimum qu'on puisse en garder.
  // `SetNull` : supprimer un compte n'efface pas l'histoire de la boutique.
  suspendedById String?   @map("suspended_by_id")
  suspendedBy   User?     @relation("SuspendedShops", fields: [suspendedById], references: [id], onDelete: SetNull)
```

Et la relation inverse sur `User`, nommée, puisque `User` porte déjà d'autres chemins vers
`Vendor`.

Le nom de la relation est en ANGLAIS, comme tout identifiant. Le voisin immédiat,
`@relation("DecisionsRendues")`, est en français : c'est une entorse antérieure à cette
tranche, et la recopier en ajouterait une seconde plutôt que de corriger la première.

Aucun index : la table des boutiques est petite, et l'écran d'administration les lit toutes.

La migration n'a **rien à reprendre** : les colonnes naissent nulles, donc toutes les
boutiques existantes sont actives, ce qui est l'état voulu.

## 5. Où la règle mord

Une seule condition, `suspendedAt IS NULL`, dans les cinq lectures que T2d a établies et que
T4 a déjà complétées une fois :

| Lecture | Où | Condition |
| --- | --- | --- |
| Liste du catalogue, lignes et total | `conditions()` de `catalog.repository.ts` | `s.suspended_at IS NULL` |
| Décompte des devises | le SQL propre de `listCatalogCurrencies` | la même |
| Variante achetable | `eligibleVariantWhere` de `cart.repository.ts` | `suspendedAt: null` |
| Fiche produit | `readPublishedProduct` | la même |
| Vitrine | `readPublishedShop` | la même |

Le test d'intégration qui épingle déjà ces cinq lectures en reçoit une sixième, et il échoue
si une seule l'oublie. C'est le filet qui a déjà servi deux fois.

### Et elle ne mord nulle part ailleurs

**Pas dans `readVendorForMember`.** C'est la lecture qui ouvre l'espace vendeur, et elle
filtre `deletedAt: null` précisément pour enfermer dehors un ancien vendeur. Y ajouter la
suspension ferait perdre son espace à quelqu'un qui doit continuer à travailler.

**Pas dans les lectures de commande.** `order.repository.ts` ne filtre rien sur la boutique
aujourd'hui, et ne doit pas commencer : un acheteur ne perd jamais l'accès à une commande
qu'il a payée, et un vendeur suspendu doit pouvoir expédier ce qu'il a déjà vendu.

**Pas dans les lectures de collection.** `listPublishedCollections` et
`readPublishedCollection` ne filtrent que `deletedAt`. Elles n'ont pas besoin de la
condition : les deux pages publiques lisent `readPublishedShop` d'abord et répondent 404.
La protection vient donc de la route et non du prédicat, ce que la revue de T4 avait déjà
tracé. Ne pas la recopier là créerait la seconde vérité que ce dépôt a payée deux fois.

## 6. Le dépôt

Deux fonctions dans `vendor.repository.ts`, à côté de celles qui existent.

`listShopsForAdministration(prisma)` rend toutes les boutiques non fermées, avec leur nom,
leur slug, leur état, la date de suspension et le nom de qui l'a posée. Triées par nom.

`setShopSuspension(prisma, { vendorId, administratorId, suspended })` pose ou retire les deux
colonnes ensemble.

**Aucune garde de concurrence**, contrairement à `setOrderStatus` qui porte un `from`. Deux
administrateurs qui suspendent la même boutique au même instant écrivent la même chose, et
l'un qui suspend pendant que l'autre rétablit laisse le dernier écrit gagner. Dans les deux
cas le résultat est un état cohérent qu'un administrateur relit et corrige d'un clic. Ajouter
une garde serait du cérémonial sans défaut à prévenir.

## 7. Les écrans

### Administration, `/shops`

La liste des boutiques, sur la forme de `/applications` qui existe déjà : un `main` étroit,
un titre, une liste bordée. Chaque ligne porte le nom de la boutique, son slug, son état, et
pour une boutique suspendue la date et le nom de qui l'a posée.

L'action vit **sur la ligne**, et non derrière une page de détail. Les candidatures ont une
page de détail parce qu'il y a un dossier à lire ; ici il n'y a qu'un levier, et une page qui
ne porterait qu'un bouton serait un détour. Coût assumé : l'administration ne voit d'une
boutique que ce que la liste montre.

Un lien vers cette liste s'ajoute à la navigation de l'administration.

### Vendeur, le bandeau

Un composant serveur partagé, rendu en tête des pages où un vendeur vit : **sa boutique, ses
produits, ses commandes**. Il prend l'état en propriété, et `requireVendorMembership` rend
déjà la boutique à chacune de ces pages.

Pas dans la mise en page : elle est STATIQUE par décision, et son commentaire dit pourquoi,
un layout ne gardant pas l'accès n'a rien à faire de données protégées.

Pas sur l'accueil : il n'est pas gardé, délibérément, et il porte le `data-testid` dont
dépend le partage de session entre les trois fronts.

Les trois sous-pages de création et d'édition ne le portent pas : on y arrive depuis les
trois autres, et on y repasse.

### Le motif

Une phrase fixe et traduite, pas un texte libre saisi par l'administrateur. La raison est
toujours la même et se négocie dehors, et un champ libre devient vite un endroit où l'on
écrit des choses qu'un vendeur ne devrait pas lire.

## 8. Les limites connues, et préexistantes

**Un compte peut être membre de plusieurs boutiques, et l'interface n'en montre qu'une.**
Le schéma l'autorise, `VendorMember` n'étant unique que sur le couple boutique-utilisateur.
Le parcours de candidature l'autorise aussi : sa seule garde est un index unique PARTIEL,
`applicant_id` unique là où le statut vaut `SUBMITTED`, donc un candidat accepté peut
déposer un second dossier. Mais `readVendorForMember` est un `findFirst` sans tri, il rend
une boutique arbitraire, et il n'existe ni sélecteur ni boutique dans l'URL.

T5 ne traite pas ce point et ne l'aggrave pas. Il le rend un peu plus visible : le bandeau
pourrait s'afficher pour une boutique que le vendeur ne pensait pas regarder. Le corriger
demande la boutique dans l'URL et touche chaque page de l'espace vendeur, ce qui est une
tranche à soi seule.

## 9. Les libellés

L'état d'une boutique et les deux actions, côté administration. Le bandeau et sa phrase,
côté vendeur. En français seulement : ni l'administration ni l'espace vendeur n'ont de
catalogue anglais, et cette tranche n'en crée pas.

## 10. Les cas limites

**Une boutique suspendue dont un article est dans un panier.** Le panier le garde, et la
validation le refuse : `eligibleVariantWhere` porte la condition, et `placeOrders` relit
l'éligibilité de chaque ligne dans sa transaction. L'acheteur lit le refus que T3 a déjà
écrit pour un article devenu indisponible.

**Une boutique suspendue dont une commande est en cours.** Elle reste lisible et actionnable
des deux côtés. Le vendeur peut l'accepter, l'expédier, l'annuler.

**Une boutique suspendue puis rétablie.** Ses articles reviennent au catalogue tels quels :
rien n'a été dépublié, aucun statut de produit n'a bougé.

**Une boutique sans devise ou sans méthode de paiement.** Elle était déjà hors du catalogue
avant T5, pour d'autres raisons. La suspension s'ajoute aux conditions existantes sans les
remplacer.

**Un administrateur suspend sa propre boutique.** Rien ne l'en empêche et rien ne doit l'en
empêcher : l'administration et le commerce sont deux rôles distincts qu'une même personne
peut porter.

## 11. Pièges déjà payés qui s'appliquent ici

- **La condition d'éligibilité s'écrit une fois et se lit cinq fois.** Ce dépôt a payé deux
  fois le prix d'en écrire deux, sur le décompte des devises puis sur la fiche produit.
- **Attendre ce que l'ACTION a produit, jamais un mot que l'écran porte peut-être déjà.**
  Après avoir suspendu, attendre l'état suspendu, pas le mot « suspendre » du bouton.
- **La correspondance de texte de Playwright est une sous-chaîne insensible à la casse.**
  « Suspendue » contient « suspendu ».
- **`packages/db/dist` est ignoré par Git et Jest importe DEPUIS lui.** Reconstruire après
  toute édition de `packages/db/src`.
- **Un glob `*.spec.ts` ne voit pas `*.int-spec.ts`.**

## 12. Tests

**Intégration.** Le test des lectures d'éligibilité en reçoit une sixième, et chaque retrait
de condition le fait échouer sur sa propre assertion. Un aller-retour de
`setShopSuspension`. Et surtout un test qui épingle ce que la suspension NE fait PAS : les
commandes d'une boutique suspendue restent lisibles des deux côtés, et ses membres gardent
l'accès à leur espace.

**Bout en bout.** Un administrateur suspend une boutique ; son article disparaît du
catalogue ; sa fiche répond 404 ; son vendeur voit le bandeau et garde son espace ; puis
l'administrateur rétablit et l'article revient.

## 13. Critères d'acceptation

1. Une boutique validée vend dès le premier jour, sans acte supplémentaire.
2. Un administrateur suspend une boutique depuis la liste, et ses articles quittent le
   catalogue, la vitrine et la fiche produit par le même prédicat.
3. La boutique suspendue affiche qui l'a suspendue et quand.
4. Le vendeur garde son espace et lit pourquoi sa boutique est hors ligne.
5. Les commandes en cours restent lisibles et actionnables des deux côtés.
6. Rétablir ramène les articles au catalogue tels quels.
7. Aucune échéance, aucune tâche planifiée, aucun montant n'apparaît nulle part.
8. `lint`, `typecheck`, les tests unitaires, les tests d'intégration et la suite bout en
   bout passent en CI.

## 14. Risques

**La suspension est le premier état de `Vendor` que quelqu'un écrit vraiment.** `deletedAt`
dort depuis T1b. Les deux se ressemblent et ne font pas la même chose, et rien dans le
schéma n'empêche de les confondre. Leurs commentaires portent la distinction ; c'est peu.

**Une condition de plus dans la requête la plus chère du dépôt.** Elle porte sur une colonne
de `vendors`, déjà jointe, donc sans jointure nouvelle. La revue de T2d avait mesuré que le
coût de cette requête tient au `GROUP BY` et à la jointure latérale d'image, pas au nombre de
conditions.

**L'administration gagne un pouvoir sans trace.** Un administrateur peut couper les ventes
d'une boutique d'un clic. On garde qui et quand sur la boutique, mais il n'y a pas de journal
des mouvements : rétablir efface la trace de la suspension précédente. Le cadrage l'a
écarté ; le jour où un litige survient, c'est la première chose qui manquera.
