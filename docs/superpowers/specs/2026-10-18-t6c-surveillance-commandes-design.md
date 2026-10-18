# ClemPerl, T6c : surveiller les commandes et débloquer

**Date** : 2026-10-18
**Statut** : cadrée, non commencée
**Tranche** : T6c, troisième des issues du découpage de T6, elle-même coupée en deux
**S'appuie sur** : `2026-10-09-t3-panier-commande-design.md` (la machine à états),
`2026-10-11-t4-paiement-design.md` (ce que la plateforme sait de l'argent) et
`2026-10-16-t6b-comptes-et-roles-design.md` (les deux niveaux d'administration), toutes
livrées

---

## 1. L'intention, et le pourquoi

Une commande n'avance que si le vendeur la fait avancer. Quand il ne fait rien, elle ne
bouge plus, et personne au monde ne peut la débloquer.

L'acheteur n'a aucune action sur sa commande, c'est une décision de T3 et elle tient. Le
vendeur, lui, peut être en vacances, avoir fermé boutique, ou simplement ne jamais ouvrir
son espace. La commande reste alors en `PLACED` indéfiniment, et l'acheteur attend quelque
chose qui n'arrivera pas.

Cette tranche donne à l'administration les yeux et la main : voir les commandes de toutes
les boutiques, et faire avancer celle qui dort.

## 2. Ce que T6c décide

### La règle « seul le vendeur fait avancer » cesse d'exister

T3 l'avait posée, et elle n'a jamais été écrite dans le domaine : `ORDER_TRANSITIONS` dit
quelles transitions existent, jamais qui peut les emprunter. La règle tenait au seul fait
que l'unique appelant vivait dans l'application vendeur, derrière la garde d'appartenance à
la boutique.

Il y a désormais un second appelant, et **l'administration peut tout ce que le vendeur
peut** : accepter, expédier, annuler.

**Décision du commanditaire**, prise en connaissance du coût : l'administration peut donc
déclarer expédié un colis qu'elle n'a jamais vu, et engager un vendeur à honorer une
commande qu'il n'a pas regardée. Le contrepoids n'est pas technique, il est humain.

### Aucun auteur n'est enregistré

La commande ne garde pas qui l'a fait avancer. Un vendeur ne distinguera donc pas ce qu'il
a fait de ce que l'administration a fait à sa place.

**Décision du commanditaire**, contre l'avis du rédacteur : le dépôt a déjà le geste
inverse, `OrderPayment.settledById` et `Vendor.suspendedBy` enregistrent l'auteur quand un
humain affirme ce que le système ne peut pas vérifier. On fait simple pour l'instant. Si la
question revient, deux colonnes sur `Order` suffisent et aucune donnée n'est perdue
d'ici là.

### Annuler une commande payée est permis, et l'écran le dit

La plateforme ne détient pas les fonds, T4 l'a établi en rangeant les remboursements parmi
ses non-buts. Annuler ne rend donc pas l'argent.

L'annulation reste permise, parce que c'est justement sur une commande payée qu'un vendeur
silencieux fait le plus de dégâts. Mais l'écran prévient **avant le clic** que ce paiement
est encaissé et que l'annuler ne le rembourse pas. Le constat d'un remboursement appartient
à la tranche suivante.

## 3. Le modèle

**Il ne change pas.** Aucune migration, aucune colonne, aucune valeur d'énumération.
`E_ORDER_STATUS` garde `PLACED`, `ACCEPTED`, `SHIPPED`, `CANCELLED`, et `ORDER_TRANSITIONS`
reste telle quelle.

C'est la propriété la plus agréable de cette tranche : ce qu'elle ajoute est un appelant et
un écran, pas une notion.

## 4. L'écriture

`setOrderStatus` est portée par la boutique : sa signature exige un `vendorId`, et ce
paramètre est une garde, pas une commodité. Elle porte aussi un `from`, l'état lu par
l'appelant, qui fait de l'écriture une comparaison-et-échange : entre la lecture et
l'écriture, un collègue peut avoir fait avancer la commande, et sans `from` le clic suivant
ramènerait une commande expédiée à « acceptée ».

L'administration n'a pas de boutique. Trois voies ont été pesées.

Élargir la fonction en rendant `vendorId` optionnel donne un seul chemin d'écriture, mais
transforme la garde la plus sensible du dépôt en paramètre qu'on peut omettre sans qu'aucun
type ne proteste.

Faire agir l'administration « au nom de » la boutique, en relisant le `vendorId` de la
commande pour le repasser à la fonction, ne change rien au dépôt mais fait mentir le code :
qui lit `setOrderStatus` croit que l'appartenance a été vérifiée, alors qu'on vient de lui
souffler la réponse.

**La voie retenue** est une seconde fonction nommée pour ce qu'elle est, à côté de
l'existante qui garde son `vendorId` obligatoire. Le corps commun descend dans une aide
privée qui porte, elle, la portée optionnelle. L'optionalité existe donc à un seul endroit,
invisible du dehors, et aucun appelant vendeur ne peut l'atteindre par oubli.

Les deux fonctions gardent `from`. Un écran périmé se fait refuser, qu'il soit vendeur ou
administrateur.

## 5. Les écrans

### La liste, dans l'administration

Toutes les commandes, toutes boutiques confondues, filtrables par état et par boutique, et
paginées.

**Paginée avec un ordre clos sur l'identifiant.** Le catalogue a déjà payé la leçon : sans
colonne finale unique, `LIMIT ... OFFSET` n'est pas déterministe dès que deux lignes
partagent la valeur triée, une ligne se répète d'une page à l'autre et une autre est sautée,
invisible et silencieuse. Le tri est donc la date de création décroissante, puis
l'identifiant croissant.

Chaque ligne porte le nom de la boutique **et son slug**. `shopName` n'est pas unique, et
deux lignes indistinguables feraient agir sur la commande de quelqu'un d'autre. C'est la
leçon que la revue de la suspension de boutique a laissée.

Une file de ce qui traîne a été écartée au profit de la liste complète : l'administration
doit aussi pouvoir retrouver la commande précise dont un acheteur se plaint, ce qu'une file
qui se vide ne permet pas.

### Le détail, et ses actions

Les actions offertes viennent d'`allowedOrderActions`, et seules les possibles sont
rendues. Une action impossible ne s'affiche pas grisée, elle ne s'affiche pas : c'est la
règle posée par T3 et reprise depuis par chaque écran d'administration.

Sur une annulation dont le paiement est encaissé, l'écran porte l'avertissement de la
section 2.

### Qui atteint ces écrans

Les deux niveaux d'administration, `ADMIN` et `SUPER_ADMIN`. La matrice de T6b ne distingue
pas les commandes, et rien ici ne justifie de l'étendre.

**Chaque action serveur revérifie sa garde elle-même.** Une action serveur est une route
publique, et l'écran qui n'a pas rendu un bouton ne protège rien.

## 6. Non-buts

**Les litiges.** Un acheteur qui conteste une commande expédiée n'a toujours aucun chemin.
C'est la tranche suivante.

**Les remboursements, même constatés.** `E_PAYMENT_STATUS` ne gagne pas d'état ici.

**Prévenir l'acheteur.** Aucune transition n'envoie de courriel aujourd'hui, quel qu'en soit
l'auteur. L'acheteur découvre l'annulation en consultant sa commande. Ajouter l'envoi est un
sujet à part, qui toucherait les quatre transitions et non la seule action de
l'administration, et qui créerait sinon une asymétrie difficile à défendre.

**L'enregistrement de l'auteur**, voir la section 2.

**Toute modification de la machine à états.** Pas d'état neuf, pas de transition neuve.

## 7. Anti-buts

Ce qui ferait de cette tranche un échec même si elle fonctionnait :

**Une garde d'appartenance affaiblie.** Si le chemin vendeur peut, après cette tranche,
écrire sans portée de boutique par simple oubli d'un paramètre, la tranche a échoué. La
garde existante doit être strictement aussi forte après qu'avant.

**Une liste qui ment.** Si la pagination saute ou répète des commandes, l'administration
croit avoir tout vu alors qu'une commande lui est invisible. C'est précisément le mode de
panne que l'ordre clos sur l'identifiant existe pour fermer.

**Une écriture qui écrase.** Si l'administration peut ramener en arrière une commande qu'un
vendeur vient de faire avancer, parce que son écran datait, la tranche a introduit une perte
de décision là où le vendeur était déjà protégé.

## 8. Les cas limites

Deux administrateurs sur la même commande : le second reçoit « la commande a bougé », parce
que son `from` ne correspond plus. Même forme que deux membres d'une même boutique
aujourd'hui.

Un administrateur et un vendeur en même temps : identique, et c'est la raison pour laquelle
le `from` ne se négocie pas.

Une commande expédiée ou annulée : aucune action n'est rendue, et l'action serveur refuse de
toute façon, l'état n'ayant pas de sortie dans la table des transitions.

Une commande d'une boutique suspendue : elle reste visible et actionnable. La suspension
retire la boutique du catalogue, elle n'efface pas les engagements pris avant.

Une action inventée, postée à la main : refusée. La validation passe par `Object.hasOwn` sur
l'énumération des actions, et non par un accès direct, parce qu'une action nommée
`constructor` rendrait une fonction au lieu de `undefined`, que le domaine prendrait pour un
état valide. Le piège est déjà payé côté vendeur.

## 9. Tests

**Pur, dans `packages/domain`** : rien de neuf. La machine à états n'est pas touchée, et ses
tests la couvrent déjà.

**Intégration, contre le vrai PostgreSQL** : l'écriture sans portée de boutique fait avancer
une commande ; elle refuse quand le `from` est périmé ; l'écriture portée par la boutique
refuse toujours une commande d'une autre boutique ; et la liste rend une pagination
déterministe quand deux commandes partagent l'horodatage, ce qui est le seul test qui
éprouve réellement l'ordre clos sur l'identifiant.

**Unitaire, dans l'administration** : les refus de l'action serveur, l'action inventée, la
commande disparue, la commande qui a bougé, et le fait que les deux niveaux d'administration
passent la garde.

**Navigateur** : une commande est passée, le vendeur ne fait rien, l'administration l'annule,
et l'acheteur voit sa commande annulée depuis la boutique.

## 10. Critères d'acceptation

1. L'administration liste les commandes de toutes les boutiques, filtre par état et par
   boutique, et pagine sans jamais sauter ni répéter une ligne
2. L'administration fait avancer une commande selon la table des transitions, sans
   appartenance à la boutique
3. Le chemin vendeur exige toujours une appartenance, et rien ne permet de l'omettre
4. Une écriture dont l'état lu a changé est refusée, des deux côtés
5. Annuler une commande dont le paiement est encaissé est permis, et l'écran le dit avant le
   clic
6. Seules les actions possibles sont rendues
7. `lint`, `typecheck`, `test`, `test:e2e` et les seuils de couverture passent

## 11. Ce qui est laissé au constructeur

Le nom exact de la seconde fonction d'écriture et de l'aide privée, en anglais, suivant les
conventions du dépôt.

La taille d'une page, et la forme des filtres.

L'ordre et le libellé des colonnes, sur le modèle des écrans d'administration existants.

La formulation de l'avertissement sur un paiement encaissé, qui doit dire ce qui ne se
passera pas plutôt que ce qui se passe.
