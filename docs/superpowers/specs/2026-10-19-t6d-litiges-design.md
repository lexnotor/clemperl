# ClemPerl, T6d : les litiges

**Date** : 2026-10-19
**Statut** : cadrée, non commencée
**Tranche** : T6d, la part « arbitrer » retirée de T6c au cadrage. La feuille de route
l'appelait « litige et remboursement constaté » ; elle devient « Litiges », voir la section 2
**S'appuie sur** : `2026-10-09-t3-panier-commande-design.md` (la commande et ses lignes),
`2026-10-11-t4-paiement-design.md` (la plateforme ne détient jamais les fonds),
`2026-10-14-t6a-moderation-catalogue-design.md` (la file qui se vide, le motif sans valeur
par défaut, le courriel au vendeur) et `2026-10-18-t6c-surveillance-commandes-design.md`,
toutes livrées

C'est un **MVP**, voulu comme tel. La section 6 dit ce qui est repoussé, et pourquoi le
modèle ne le ferme pas.

---

## 1. L'intention, et le pourquoi

Une commande expédiée est terminale : `SHIPPED` n'a aucune sortie dans la table des
transitions, et l'acheteur n'a aucune action sur sa commande. Quand ce qu'il reçoit n'est pas
ce qu'il a payé, il n'a aucun recours dans la plateforme.

Trois situations motivent la tranche :

1. le produit est arrivé abîmé ;
2. le vendeur s'est trompé d'article ;
3. rien n'est arrivé, alors que le vendeur affirme avoir livré.

D'autres types viendront. Le vocabulaire des motifs est donc fermé mais extensible, sur la
forme de `E_MODERATION_REASON`.

Le parcours voulu : l'acheteur ouvre un litige et dépose ses preuves, le vendeur répond, les
deux échangent. Quand l'échange se tait, l'administration tranche sur pièces. Si elle donne
raison à l'acheteur, le vendeur est sommé de le servir correctement. C'est l'acheteur, et lui
seul, qui dit qu'il a été servi.

## 2. Ce que T6d décide

### La plateforme tranche, elle ne rembourse pas

ClemPerl ne détient jamais les fonds : c'est une décision de T4, et elle tient. Une décision
favorable à l'acheteur ne déplace donc aucun argent. Elle dit au vendeur qu'il doit servir
son client, et le vendeur choisit comment : renvoyer, remplacer, rembourser par son propre
canal d'encaissement.

La plateforme ne constate pas non plus de remboursement. Elle enregistre que l'acheteur se
déclare servi, sans savoir comment il l'a été. C'est la raison du changement de nom de la
tranche : « remboursement constaté » promettait une information que rien ne produit.

**Après la décision, la plateforme ne fait plus rien.** Si le vendeur ne s'exécute pas, la
suite se règle hors de ClemPerl. Aucune relance, aucune sanction automatique. La suspension
de T5 reste disponible, comme un geste séparé qu'un administrateur choisit.

### Le litige est un objet à part, pas un état de la commande

La commande garde `SHIPPED`. `E_ORDER_STATUS` et `ORDER_TRANSITIONS` ne bougent pas, et la
règle de T3 « l'acheteur n'a aucune action sur sa commande » reste vraie : l'acheteur agit sur
un litige, pas sur l'état de sa commande.

Raison : un état `DISPUTED` dans la machine à états obligerait chaque écran de commande des
trois applications à le connaître, et ferait d'une contestation, qui peut être infondée, une
étape du cycle de vie de toutes les commandes.

### Aucune horloge ne fait avancer un litige

Un litige devient « à trancher » quand son dernier échange date de plus de sept jours. Rien
ne l'y fait passer : ce n'est pas un état écrit, c'est une condition calculée au moment où
l'administration lit sa file, sur le modèle de la file de modération de T6a.

Raison : pas d'ordonnanceur à faire tourner, et changer le délai plus tard ne demande ni
migration ni rattrapage. Le prix : une requête qui compare une date à « maintenant », donc un
« maintenant » qu'il faut pouvoir injecter pour la tester.

**L'administration peut trancher avant les sept jours.** La file désigne ce qui est mûr, elle
n'interdit rien. C'est le recours quand un vendeur ne répond jamais, ou quand un échange
dégénère.

### Les deux délais sont des constantes

| Délai | Valeur | Ce qu'il borne |
| --- | --- | --- |
| Ouverture | 14 jours | entre l'expédition et l'ouverture du litige |
| Silence | 7 jours | entre le dernier échange et le moment où le litige est « à trancher » |

Les deux vivent dans `packages/domain`, en constantes. Les rendre réglables par un
administrateur, et le délai d'ouverture réglable par boutique, est voulu mais repoussé
(section 6).

**Le vendeur ne règle jamais le délai d'ouverture.** Décidé au cadrage : un vendeur libre de
le mettre à zéro jour ne recevrait plus aucun litige. Le jour où le délai devient réglable,
c'est par l'administration.

## 3. Le modèle

### La commande gagne sa date d'expédition

`Order.shippedAt`, nullable. Elle est écrite par `writeOrderStatus`, l'aide privée commune au
chemin vendeur et au chemin administration, dans la même instruction que le passage à
`SHIPPED`. C'est le seul endroit où l'état s'écrit, donc le seul où la date ne peut pas être
oubliée par l'un des deux chemins.

**Aucun rattrapage.** Les commandes déjà expédiées gardent `shippedAt` nul, et une commande
sans date d'expédition n'ouvre aucun litige. Reconstituer la date depuis `updatedAt` serait
faux : cette colonne bouge aussi quand le paiement change. Ce choix ne coûte rien : la
plateforme est en développement, aucune commande réelle n'a été expédiée (confirmé au cadrage,
le 2026-10-19). Si elle était déployée avant cette tranche, il faudrait trancher à nouveau.

### Les nouvelles tables

`Dispute`, une par commande au plus (unicité sur `orderId`) :

| Champ | Rôle |
| --- | --- |
| `orderId` | la commande contestée, unique |
| `reason` | `E_DISPUTE_REASON` : `DAMAGED`, `WRONG_ITEM`, `NOT_RECEIVED` |
| `status` | `E_DISPUTE_STATUS`, voir plus bas |
| `locale` | la langue de l'acheteur à l'ouverture, pour lui écrire |
| `lastActivityAt` | date du dernier message, ce que la file compare |
| `decisionComment`, `decidedAt`, `decidedById` | la décision, nuls tant qu'elle n'est pas prise |
| `servedAt` | quand l'acheteur s'est déclaré servi |

**La langue est retenue sur le litige** parce que l'acheteur n'en a aucune enregistrée :
`User` n'a pas de colonne de langue, et la langue n'existe qu'au moment de la requête, dans le
segment `[locale]`. C'est la forme de `VendorApplication.locale`.

`DisputeItem` : les lignes de commande désignées, au moins une, et uniquement des lignes de
CETTE commande. Unicité sur le couple litige et ligne.

`DisputeMessage` : l'auteur (le compte), son côté (`E_DISPUTE_PARTY` : `BUYER` ou `VENDOR`),
le texte, la date. Le récit d'ouverture est le premier message de l'acheteur, pas un champ à
part : un seul fil, une seule façon de le lire.

`DisputeAttachment` : rattachée à un message, sur la forme de `VendorDocument` :
`objectPath`, `mimeType`, `sizeBytes`, `originalName`.

### Les états d'un litige

```
OPEN ──(l'acheteur se déclare servi)──────────────────► SERVED
  │
  ├──(l'administration donne raison à l'acheteur)──► DECIDED_FOR_BUYER ──(servi)──► SERVED
  │
  └──(l'administration donne raison au vendeur)────► DECIDED_FOR_VENDOR
```

Seul `OPEN` accepte des messages. `SERVED` et `DECIDED_FOR_VENDOR` sont terminaux. Les champs
de décision survivent au passage de `DECIDED_FOR_BUYER` à `SERVED` : on sait encore que
l'administration avait tranché.

La table des transitions est pure, dans `packages/domain`, sur le modèle de
`ORDER_TRANSITIONS` : `Record` sur l'énumération entière, pour qu'un état ajouté sans sortie
déclarée ne compile pas.

## 4. Les écritures

Chaque écriture est une comparaison-et-échange sur l'état lu, comme `writeOrderStatus` : le
`where` porte l'état attendu, et un compte nul distingue « introuvable » de « a bougé ».

**Ouvrir.** Dans une transaction : la commande appartient à l'acheteur, est `SHIPPED`, a un
`shippedAt` de moins de quatorze jours, et n'a pas de litige. L'unicité sur `orderId` est la
garde finale contre deux ouvertures simultanées. Le domaine décide de l'éligibilité, le dépôt
la revérifie dans son `where`.

**Écrire un message.** Le litige est `OPEN`, et l'auteur est soit l'acheteur de la commande,
soit un membre de sa boutique. Le message et la mise à jour de `lastActivityAt` sont dans la
même transaction, et la mise à jour porte `status: OPEN` dans son `where` : un message posté
pendant que l'administration tranche est refusé, jamais rattaché à un litige fermé.

**Trancher.** `OPEN` vers l'une des deux décisions, commentaire obligatoire : les deux
parties le lisent, et c'est la seule explication qu'elles recevront.

**Se déclarer servi.** `OPEN` ou `DECIDED_FOR_BUYER` vers `SERVED`, par l'acheteur seul.

**Les pièces.** Même bucket privé que les justificatifs de candidature (`STORAGE_BUCKET`),
sous un préfixe propre aux litiges. Le nom par défaut du bucket, `vendor-documents`, est un
héritage : sa propriété utile est d'être privé et lu seulement à travers une route gardée, et
c'est exactement ce qu'il faut ici. Mêmes règles que `ACCEPTED_MIME_TYPES` et
`MAX_DOCUMENT_SIZE_BYTES` : PDF, JPEG ou PNG, 5 Mo au plus, trois pièces par message. Le dépôt
suit l'ordre de la candidature : valider, téléverser, écrire, et supprimer les fichiers si
l'écriture échoue.

**Le plafond des actions serveur.** L'espace vendeur plafonne le corps d'une action à 5 Mo,
soit une seule pièce. Il passe à 16 Mo, la valeur de la boutique, pour en accepter trois.

## 5. Les écrans

### L'acheteur, dans la boutique

Sur le détail d'une commande éligible, un lien « Signaler un problème ». Il disparaît quand
le délai est passé, quand la commande n'est pas expédiée, ou quand un litige existe déjà, qui
est alors lié à sa place.

Le formulaire d'ouverture : les lignes à cocher, le motif, le récit, les pièces. **Le motif
n'a pas de valeur par défaut** : la leçon de T6a, où un `select` sans choix neutre accusait
d'office de contrefaçon. Le choix vide est refusé côté serveur aussi.

La page du litige : le fil complet, un formulaire de réponse tant que le litige est ouvert, le
bouton « J'ai été servi », et la décision quand elle existe.

Bilingue, comme toute la boutique.

### Le vendeur

Le détail de la commande montre le litige et son fil, avec un formulaire de réponse. La liste
des commandes signale celles qui ont un litige ouvert. Le courriel d'ouverture pointe vers la
commande.

### L'administration

`/disputes`, avec un lien dans la navigation : TOUS les litiges ouverts, mûrs ou non, puisque
l'administration doit pouvoir trancher avant les sept jours. Ils sont rendus du plus ancien
échange au plus récent, l'identifiant fermant l'ordre comme en T6c. Cet ordre place d'office
les litiges à trancher en tête ; chacun y est marqué comme tel, et l'écran dit combien il y en
a. C'est ce compte qui se vide, comme celui de la modération.

`/disputes/[id]` : la commande, les lignes désignées, le fil, les pièces, et le formulaire de
décision, offert sur tout litige ouvert, mûr ou non.

### Les pièces, servies par chaque application

Trois routes, une par application, chacune revérifiant sa garde à chaque requête :
l'acheteur de la commande, un membre de la boutique, un administrateur. Le modèle est
`apps/admin/src/app/api/documents/[id]/route.ts`, et pas une URL signée, qui serait un jeton
au porteur : transférée, elle ouvrirait la pièce à n'importe qui.

### Les courriels

Deux seulement, construits dans `packages/domain` sur la forme de `buildRetirementMessage`,
textes en français et en anglais :

1. **à l'ouverture, au vendeur**, à l'adresse de contact et dans la langue de sa candidature,
   avec repli sur le français, comme en T6a ;
2. **à la décision, aux deux parties** : l'acheteur dans la langue du litige, le vendeur dans
   la sienne.

Ils partent après l'écriture, hors transaction. Un envoi qui échoue ne défait pas l'écriture,
et l'écran le dit, comme le retrait de T6a.

## 6. Non-buts, repoussés et non fermés

**Les délais réglables.** Défaut de plateforme modifiable par un administrateur, délai
d'ouverture propre à une boutique. Le modèle ne le ferme pas : il faudra alors une table de
réglages et, pour ne rien retirer aux acheteurs passés, figer le délai sur la commande à
l'achat, comme T4 fige le moyen de paiement.

**La quantité par ligne, et un motif par ligne.** Un litige a un motif, et une ligne désignée
l'est en entier.

**Un second litige sur la même commande.** L'unicité sur `orderId` l'interdit. La lever plus
tard est une migration d'index, pas une refonte.

**Un courriel à chaque message.** Chacun suit l'échange sur la page du litige.

**Les messages de l'administration dans le fil.** Elle parle par sa décision.

**Tout mouvement d'argent, et tout constat de remboursement**, voir la section 2.

**Une sanction automatique** du vendeur qui ne s'exécute pas.

**Un contrôle du contenu réel des fichiers.** Le type et la taille déclarés par le navigateur
sont vérifiés, pas les octets. C'est la limite existante des justificatifs de candidature,
reprise telle quelle.

## 7. Anti-buts

Ce qui ferait de cette tranche un échec même si elle fonctionnait :

**Une pièce lisible par un tiers.** Une preuve contient des photos d'un domicile, un nom, une
adresse. Si une pièce s'ouvre sans être l'acheteur, un membre de la boutique ou un
administrateur, que ce soit par une URL signée, un bucket public ou une route qui oublie sa
garde, la tranche a échoué.

**Un vendeur qui lit les litiges d'une autre boutique.** La portée par boutique est dans la
signature des lectures du vendeur, jamais dans une vérification de l'appelant, exactement
comme `readOrderForVendor`.

**Une commande expédiée sans date.** Si l'un des deux chemins d'expédition oublie `shippedAt`,
ses acheteurs perdent tout recours en silence, et rien ne le signale. C'est pour cela que la
date s'écrit dans l'aide commune, et qu'un test l'éprouve sur les deux chemins.

**Un motif choisi à la place de l'acheteur**, voir la section 5.

## 8. Les cas limites

Une commande encore `ACCEPTED` que l'acheteur n'a pas reçue : ce n'est pas un litige. Rien
n'est expédié, et c'est le déblocage de T6c qui s'en occupe.

Une commande annulée : aucun litige.

Une boutique suspendue : ses litiges continuent. La suspension retire du catalogue, elle
n'efface pas les engagements, et ses membres gardent leur espace.

Une boutique fermée (`deletedAt`) : ses membres perdent leur espace, donc personne ne répond,
et le silence amène le litige devant l'administration. C'est le comportement voulu.

L'acheteur se déclare servi pendant que l'administration tranche : le second des deux reçoit
« le litige a bougé », la comparaison-et-échange ne laissant passer qu'une écriture.

Une ligne d'une autre commande, postée à la main dans le formulaire : refusée par le dépôt,
qui vérifie que chaque ligne désignée appartient à la commande du litige.

Une variante supprimée depuis la commande : sans effet. La ligne porte ses champs figés,
`productTitle` et `variantLabel`, et le litige désigne la ligne, pas la variante.

## 9. Tests

**Pur, dans `packages/domain`** : l'éligibilité à l'ouverture (état, date absente, délai
dépassé d'une seconde, litige existant), la table des transitions, la maturité d'un litige
pour un « maintenant » donné, la validation de l'ouverture (au moins une ligne, motif du
vocabulaire, récit non vide, pièces dans les limites), et les deux courriels dans les deux
langues avec le repli.

**Intégration, contre le vrai PostgreSQL** : `shippedAt` écrit par le chemin vendeur ET par le
chemin administration ; deux ouvertures simultanées n'en laissent passer qu'une ; une ligne
étrangère est refusée ; un message sur un litige tranché est refusé ; `lastActivityAt` suit
les messages ; la liste, avec un « maintenant » injecté, marque à trancher un litige
silencieux depuis sept jours et pas celui d'il y a six, et rend les deux du plus ancien
échange au plus récent ; un vendeur ne lit pas le litige d'une autre boutique.

**Unitaire, dans les trois applications** : les gardes de chaque action serveur et de chaque
route de pièces, le motif vide refusé.

**Navigateur** : une commande est passée puis expédiée ; l'acheteur ouvre un litige avec une
photo ; le vendeur répond ; l'administration tranche pour l'acheteur, sans attendre les sept
jours ; l'acheteur se déclare servi. La maturité à sept jours n'est pas jouée dans un
navigateur, l'intégration la couvre.

## 10. Critères d'acceptation

1. L'acheteur ouvre un litige sur une commande expédiée depuis moins de quatorze jours, en
   désignant au moins une ligne, un motif et un récit, avec ou sans pièces
2. Une commande sans date d'expédition, hors délai, non expédiée ou déjà contestée n'ouvre
   aucun litige, et l'écran ne l'offre pas
3. L'acheteur et les membres de la boutique échangent des messages et des pièces tant que le
   litige est ouvert, et plus après
4. L'administration voit tous les litiges ouverts ; ceux sans message depuis sept jours sont
   en tête, marqués à trancher, et elle peut aussi trancher les autres
5. La décision porte un commentaire, et les deux parties la reçoivent par courriel dans leur
   langue
6. Seul l'acheteur se déclare servi, avant ou après une décision en sa faveur
7. Une pièce ne s'ouvre que pour l'acheteur, un membre de la boutique ou un administrateur
8. `lint`, `typecheck`, `test`, `test:e2e` et les seuils de couverture passent

## 11. Ce qui est laissé au constructeur

Les noms exacts des fonctions de dépôt et des actions, en anglais, suivant les conventions du
dépôt.

La disposition des pages, sur le modèle des écrans existants de chaque application.

Le texte des courriels et des libellés, qui doivent dire ce qui se passe ensuite : pour
l'acheteur, que le vendeur est sommé de le servir et que la plateforme ne rembourse pas ;
pour le vendeur, qu'une décision contre lui n'entraîne aucun prélèvement.

Le préfixe de chemin des pièces dans le bucket.
