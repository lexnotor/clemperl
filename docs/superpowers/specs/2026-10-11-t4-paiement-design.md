# ClemPerl, T4 : paiement, point d'extension

**Date** : 2026-10-11
**Statut** : cadrée, non commencée
**Tranche** : T4
**S'appuie sur** : `2026-09-17-t0-fondations-monorepo-design.md` (décisions de cadrage),
`2026-09-18-t1a-identite-design.md` (le port de courriels, et Better Auth dans l'API),
`2026-10-02-t2d-catalogue-public-design.md` (le prédicat d'éligibilité) et
`2026-10-09-t3-panier-commande-design.md` (les commandes), toutes livrées

---

## 1. Objectif

Un vendeur déclare comment il accepte d'être payé. L'acheteur choisit, boutique par
boutique, au moment de valider. Ce qui se règle en ligne passe par un adapter, une
redirection et un webhook signé ; ce qui se règle hors ligne est seulement enregistré, et
le vendeur le pointe.

T3 s'est arrêtée à une commande actionnable sans qu'aucun paiement n'existe. T4 ajoute
l'axe de l'argent à côté de celui de l'expédition, et le point d'extension qui permettra de
brancher un vrai fournisseur sans redessiner quoi que ce soit.

Aucun fournisseur réel n'est branché dans cette tranche. Un adapter **simulé** joue le rôle
du fournisseur, exactement comme Mailpit joue le rôle du serveur de courriel depuis T1a :
le parcours entier est exercé, signature et idempotence comprises, sans aucun compte chez
personne.

## 2. Ce que T4 décide

### Le paiement est un axe séparé de l'expédition

`Order.status` dit où en est l'expédition, et T3 l'a figé : `PLACED`, `ACCEPTED`,
`SHIPPED`, `CANCELLED`. T4 n'y touche pas d'un caractère. Une colonne `paymentStatus` dit
où en est l'argent, avec son propre cycle.

La spec T3 avait prédit un état inséré entre `PLACED` et `ACCEPTED`. Cette prédiction ne
tient pas devant le paiement à la livraison : une commande réglée au moment de la remise ne
peut pas attendre son paiement pour exister. Deux axes disent la vérité pour toutes les
méthodes à la fois, là où un axe unique aurait demandé une exception par méthode.

Trois valeurs, pas plus. `PENDING` à la naissance, quelle que soit la méthode. `SETTLED`
quand un webhook le dit ou quand le vendeur le pointe. `FAILED` quand un webhook le dit. Un
échec n'est pas une fin : l'acheteur réessaie, et une nouvelle tentative naît à côté de la
précédente.

### Une méthode par boutique, choisie à la validation

Un panier qui touche trois boutiques produit trois commandes, et chacune porte sa méthode.
Restreindre le panier à ce que toutes les boutiques acceptent le rendrait invalidable dès
que deux d'entre elles n'ont rien en commun, et l'acheteur n'aurait aucun moyen de le
réparer sans retirer des articles.

La conséquence est assumée : deux boutiques payées en ligne demandent deux redirections.
C'est le prix d'un panier qui traverse des commerçants indépendants, chacun encaissant avec
ses propres comptes.

### Une méthode en ligne est une méthode qui a un adapter

Le registre associe une méthode à son adapter. Ce qu'il ne contient pas se règle hors
ligne. Il n'y a donc aucun booléen `isOnline` à tenir à jour à côté, aucune liste à
synchroniser, et aucune manière d'être incohérent : la question « cette méthode
redirige-t-elle ? » se répond en interrogeant le registre.

### L'écran dit tout, il n'interdit rien

Aucune garde n'empêche un vendeur d'accepter ou d'expédier une commande dont le paiement
n'est pas arrivé. L'écran affiche l'état de l'argent, et le vendeur juge : il connaît
peut-être son client, ou a reçu les fonds par un chemin que la plateforme ignore.

C'est cohérent avec T0, où ClemPerl orchestre et trace sans jamais détenir les fonds d'un
tiers. Le coût est nommé : la plateforme ne pourra pas dire qu'elle avait empêché, seulement
qu'elle avait prévenu.

Une seule chose est fermée, et elle ferme un mensonge et non une liberté : un paiement en
ligne ne se pointe pas à la main. Là, seul le fournisseur dit ce qui s'est passé, et un
pointage manuel rendrait la trace fausse à l'endroit précis où elle sert de preuve.

### Un vendeur coche, il ne renseigne rien

Activer une méthode est une case, sans texte ni champ typé. Un virement ne montre donc pas
d'IBAN et un mobile money ne montre pas de numéro : l'acheteur lit un libellé traduit, et
le vendeur le joint par le téléphone que la commande porte déjà.

Le coût est un aller-retour humain sur chaque commande réglée hors ligne. Il est accepté
parce que des champs typés demandent une migration, un formulaire et une validation par
méthode, pour une donnée qu'aucune réconciliation automatique n'exploite encore.

### Une boutique sans méthode sort du catalogue

Au moins une méthode active devient une condition d'éligibilité, au même titre que la
devise. Même prédicat, une seule vérité : le dépôt a déjà payé une fois le prix d'en écrire
deux, sur le décompte des devises de T2d, puis sur la fiche produit de T3.

L'alternative, laisser la boutique au catalogue et refuser à la validation, ferait parcourir,
choisir et remplir une adresse à l'acheteur pour lui apprendre tout à la fin que cette
boutique ne vend pas.

L'écran du vendeur porte la contrepartie : il prévient **avant** de laisser décocher la
dernière méthode, et non après.

### L'API possède l'écriture du paiement, les fronts gardent la lecture

Tout le code qui touche un fournisseur ou déplace l'axe de l'argent vit dans `apps/api` :
démarrer un paiement, recevoir un webhook, pointer un encaissement. C'est le premier module
métier de l'API, et il préfigure T8.

Les fronts, eux, continuent de lire la base comme T0 l'a décidé. `paymentStatus` est une
colonne de `orders` : la page de commande, la liste vendeur et la liste acheteur la lisent
exactement comme elles lisent déjà le statut d'expédition.

Cette ligne est ce qui évite le risque que T0 nommait, deux chemins de lecture sur la même
donnée qui divergent en silence. Il y a un seul chemin d'écriture, et aucun chemin de
lecture nouveau.

## 3. Périmètre

**Dans T4** : les cases du vendeur, le choix par boutique à la validation, le modèle et sa
migration, l'éligibilité, le port et son registre, l'adapter simulé, les trois routes de
l'API, le chiffrement du payload brut, le pointage d'un encaissement hors ligne, et les
écrans des deux côtés.

**Hors T4, et nommé ici pour ne pas être redécouvert :**

**Tout fournisseur réel.** Aucun identifiant, aucun tunnel pour recevoir des webhooks en
développement, aucun choix de PSP. Ce choix dépend du marché visé, carte en zone euro ou
mobile money en zone CFA, et il se prendra quand le marché sera arrêté.

**Les remboursements.** L'argent qui repart est un sujet entier, et la plateforme ne le
détient pas : un remboursement se fait entre le vendeur et son acheteur, par le même canal
que l'encaissement.

**Les commissions, le split, les payouts.** T0 les a écartés : le revenu est l'abonnement
vendeur, qui est T5.

**La réconciliation globale.** La trace vit sur la commande. Un tableau de bord qui croise
les paiements de toutes les boutiques est T6.

**Les relances.** Prévenir un acheteur que son paiement n'est pas arrivé demande de décider
quoi dire et quand, ce qui est T7 avec les courriels.

**Le temps réel.** Tant qu'un paiement est en attente, la page le redemande par intervalles.
T7 remplacera cette interrogation par Socket.IO, une fois, pour les commandes, la messagerie
et les notifications ensemble. Dessiner la couche temps réel autour du seul paiement
reviendrait à la refaire.

## 4. Le modèle

### Les deux enums

```prisma
enum E_PAYMENT_METHOD {
  CARD
  MOBILE_MONEY
  CASH_ON_DELIVERY
  BANK_TRANSFER
  OFF_PLATFORM

  @@map("payment_method")
}

enum E_PAYMENT_STATUS {
  PENDING
  SETTLED
  FAILED

  @@map("payment_status")
}
```

T0 nommait aussi « espèces » à côté du paiement à la livraison. `CASH_ON_DELIVERY` couvre la
remise, et `OFF_PLATFORM` couvre tout ce qui se règle ailleurs, y compris en espèces dans la
boutique. Une valeur `CASH` distincte n'aurait aujourd'hui aucune conséquence autre qu'un
libellé ; l'ajouter le jour où elle en aura une coûte une valeur d'enum et une traduction.

### Sur `Vendor`

```prisma
  paymentMethods E_PAYMENT_METHOD[] @map("payment_methods")
```

Un tableau d'enum, comme `categories E_VENDOR_CATEGORY[]` qui existe déjà sur ce même
modèle. Pas de table de jointure, puisque le vendeur ne renseigne qu'une activation : une
table de jointure dont toutes les colonnes sauf deux seraient vides est une table qui ment
sur ce qu'elle porte.

### Sur `Order`

```prisma
  paymentMethod E_PAYMENT_METHOD @map("payment_method")
  paymentStatus E_PAYMENT_STATUS @default(PENDING) @map("payment_status")

  payments OrderPayment[]

  @@index([vendorId, paymentStatus])
```

`paymentMethod` est **figée**, comme le reste de la commande. Relire les méthodes de la
boutique ferait dire à une commande ce que le vendeur accepte aujourd'hui, pas ce qui a été
choisi.

`paymentStatus` est le **statut normalisé** que T0 décrit : la seule chose que le domaine
connaît de l'argent. L'index sert la liste vendeur, qui filtrera dessus.

### `OrderPayment`, une ligne par tentative

Le modèle s'appelle `OrderPayment` et sa table `payments`. `Payment` seul deviendrait
ambigu le jour où T5 facturera des abonnements, qui sont des paiements de la plateforme et
non d'une commande.

```prisma
model OrderPayment {
  id       String           @id @default(cuid(2))
  orderId  String           @map("order_id")
  method   E_PAYMENT_METHOD
  status   E_PAYMENT_STATUS @default(PENDING)
  amount   Int
  currency E_CURRENCY

  // Nuls pour une méthode hors ligne, qui n'a pas de fournisseur.
  provider    String?
  providerRef String? @map("provider_ref")

  // Le payload brut du fournisseur, chiffré, tel qu'il a été reçu.
  rawPayload Bytes? @map("raw_payload")

  // Qui a pointé l'encaissement, pour une méthode hors ligne.
  settledById String?   @map("settled_by_id")
  settledAt   DateTime? @map("settled_at")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  order     Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  settledBy User? @relation(fields: [settledById], references: [id], onDelete: SetNull)

  @@unique([provider, providerRef])
  @@index([orderId, createdAt])
  @@map("payments")
}
```

**Pourquoi deux endroits, et pourquoi ce ne sont pas deux vérités.**
`Order.paymentStatus` est ce que chaque liste relit, à chaque affichage. `payments` est la
trace, celle qu'on ouvre pour enquêter, et qui garde mot pour mot ce que le fournisseur a
répondu. L'une sert la lecture courante, l'autre sert la preuve ; elles n'ont ni le même
usage ni la même durée de vie.

**`@@unique([provider, providerRef])` est ce qui rend le webhook idempotent.** Un
fournisseur rejoue ses webhooks, c'est le cas normal et non l'exception. Sans cette
contrainte, un rejeu créerait une seconde ligne et le payload de la première deviendrait
introuvable. PostgreSQL traite les `NULL` comme distincts dans un index unique, donc les
paiements hors ligne, qui n'ont ni `provider` ni `providerRef`, ne s'y heurtent jamais.

**`settledBy` est `SetNull`, et `order` est `Cascade`.** Supprimer un compte ne doit pas
emporter la preuve d'un encaissement ; supprimer une commande n'a aucune raison de laisser
ses paiements orphelins.

## 5. Le port, le registre, l'adapter simulé

### Le port

Dans `apps/api/src/modules/payments/` :

```ts
export interface IPaymentStart {
    orderId: string;
    reference: string;
    amount: number;
    currency: string;
    returnUrl: string;
}

export interface IPaymentStarted {
    providerRef: string;
    redirectUrl: string;
}

export interface IPaymentEvent {
    providerRef: string;
    // `PENDING` est légitime : un fournisseur annonce souvent une étape avant l'issue.
    // Réduire l'événement à un booléen forcerait à lire « pas réglé » comme « échoué ».
    status: "PENDING" | "SETTLED" | "FAILED";
}

export interface IPaymentAdapter {
    readonly provider: string;
    start(input: IPaymentStart): Promise<IPaymentStarted>;
    interpret(raw: string, headers: Readonly<Record<string, string>>): IPaymentEvent | null;
}
```

C'est la forme de `IEmailSender` de T1a : un port, des adapters, et un domaine qui ne
connaît que le port.

**`interpret` rend `null` sur signature fausse, et ne lève pas.** Une signature fausse est un
cas ordinaire, c'est un robot qui tape une URL publique, et non une panne à remonter. Lever
ferait apparaître dans les journaux d'erreurs un bruit permanent qui finirait par masquer
les vraies pannes.

### Le registre

Une table de `E_PAYMENT_METHOD` vers `IPaymentAdapter`, montée par le module. Ce qu'elle ne
contient pas est hors ligne. L'écran du vendeur n'offre que ce qu'elle sait servir, plus les
méthodes hors ligne, et `POST /payments/start` refuse une méthode sans adapter avec une
erreur nommée.

### L'adapter simulé

`provider = "SIMULATED"`, monté seulement si `PAYMENT_SIMULATOR=1`. Il sert `CARD` et
`MOBILE_MONEY` en développement.

Son `start` rend une URL servie par l'API elle-même. Cette page affiche le montant, la
référence de la commande, et deux boutons : « Payer » et « Échouer ». Chacun fait appeler
par l'API son propre webhook, avec un corps signé en HMAC-SHA256 par
`PAYMENT_SIMULATOR_SECRET`.

Le détour par son propre webhook est délibéré. Marquer le paiement directement depuis la
page du simulateur serait plus court, et n'exercerait ni la signature, ni la normalisation,
ni l'idempotence, c'est-à-dire exactement les trois choses qu'un vrai fournisseur mettra à
l'épreuve.

## 6. Les trois routes

**`POST /payments/start`**, corps `{ orderId }`. Session obligatoire, l'acheteur doit être
celui de la commande. Refuse si la commande est annulée, si son paiement est déjà `SETTLED`,
ou si sa méthode n'a pas d'adapter. Sinon, crée une tentative `PENDING`, appelle `start` et
rend `{ redirectUrl }`.

**`POST /payments/webhook/:provider`**, aucune session, corps **brut**. L'adapter du
fournisseur vérifie la signature et normalise ; `null` donne un `400` sans rien écrire. Sinon
la tentative désignée par `providerRef` prend le statut normalisé, son payload chiffré est
stocké, et `Order.paymentStatus` suit, le tout dans une transaction. Un événement `PENDING`
stocke son payload et ne change aucun statut : il dit où en est le fournisseur, pas où en est
l'argent.

La contrainte d'unicité fait qu'un rejeu ne crée jamais de seconde ligne. Il ne change rien
non plus **à partir du moment où la tentative est tranchée** : `SETTLED` ou `FAILED` ne se
rouvre pas. Avant cela, deux livraisons d'un même événement `PENDING` retrouvent une
tentative encore `PENDING` et la réécrivent : `updatedAt` bouge et `rawPayload` est remplacé
par un payload identique. Aucun statut ne bouge, ni celui de la tentative ni celui de la
commande, donc le dégât est borné à la trace. Fermer ce dernier cas demanderait que le port
porte un identifiant d'ÉVÉNEMENT distinct de `providerRef` ; l'ajouter avant de connaître ce
qu'un vrai fournisseur émet reviendrait à inventer sa forme.

**`POST /payments/:orderId/settle`**, session obligatoire, l'appelant doit être membre de la
boutique de la commande. Refuse si la méthode est en ligne, refuse si le paiement est déjà
`SETTLED`. Sinon enregistre une tentative `SETTLED` avec `settledById` et `settledAt`, et
`Order.paymentStatus` suit.

Les lectures ne passent par aucune route : les pages lisent `orders` et `payments`
directement, comme elles lisent déjà tout le reste.

## 7. Le navigateur appelle l'API

Le bouton « Payer » et le bouton « Paiement reçu » sont des composants clients. Ils appellent
`NEXT_PUBLIC_API_URL` en `credentials: "include"` : le cookie de session voyage, et le
`SessionGuard` de l'API le présente à la **même** instance Better Auth que les fronts. Aucun
jeton à inventer, aucun format à tenir synchrone, ce que T1a avait prévu en montant Better
Auth dans l'API.

Trois conséquences, à poser le même jour que les routes.

**CORS**, avec les origines des trois fronts nommées, lues dans `NEXT_PUBLIC_STOREFRONT_URL`,
`NEXT_PUBLIC_VENDOR_URL` et `NEXT_PUBLIC_ADMIN_URL`, et `Access-Control-Allow-Credentials`.
Jamais le joker : un joker est incompatible avec l'envoi d'un cookie, et le navigateur refuse
sans rien expliquer.

**Une vérification d'`Origin` sur les routes qui écrivent.** Une écriture entre deux origines
depuis un navigateur est précisément la surface que Better Auth protège sur ses propres
routes ; les nôtres doivent la protéger elles-mêmes. Le webhook en est exempté : il ne vient
pas d'un navigateur, et sa preuve est sa signature.

**Le cookie traverse déjà.** En développement les fronts et l'API sont sur `localhost` à des
ports différents, et les navigateurs n'isolent pas les cookies par port. En production,
`COOKIE_DOMAIN` le porte, comme pour le partage de session entre les fronts.

## 8. Le chiffrement du payload

`node:crypto`, AES-256-GCM. Clé de 32 octets en base64 dans `PAYMENT_PAYLOAD_KEY`. On stocke
la concaténation de l'IV, du sceau d'authentification et du chiffré, dans une colonne
`Bytes`.

**La variable est obligatoire et l'API refuse de démarrer sans elle.** Un payload stocké en
clair est pire qu'un payload absent, parce que rien ne le signalerait : la colonne se
remplirait, les écrans fonctionneraient, et la faute ne se découvrirait qu'à la première
personne qui lit la base.

GCM et non CBC : le sceau fait échouer le déchiffrement d'un payload altéré, au lieu de
rendre des octets qui ressemblent à du JSON.

L'utilitaire vit dans le module `payments`, seul endroit qui chiffre ou déchiffre. Le mettre
dans `packages/core` offrirait un outil générique à un seul appelant.

## 9. L'éligibilité et la migration

### Une règle, quatre lectures qui doivent s'accorder

| Lecture | Où | Condition ajoutée |
| --- | --- | --- |
| Liste du catalogue | SQL de `catalog.repository.ts` | `cardinality(s.payment_methods) > 0` |
| Décompte des devises | le même SQL | la même |
| Variante achetable | `eligibleVariantWhere` | `paymentMethods: { isEmpty: false }` |
| Fiche produit et vitrine | `readPublishedProduct`, `readShop` | la même |

T3 a corrigé le désalignement de la fiche produit, qui proposait un achat que le panier
refusait. Ne pas le recréer est la moitié du travail de cette section.

### La migration

La colonne arrive avec `DEFAULT '{}'`, puis les boutiques existantes reçoivent
`{OFF_PLATFORM}` : aucune ne disparaît du catalogue le jour du déploiement.

Les commandes existantes reçoivent `OFF_PLATFORM`, avec `SETTLED` si elles sont déjà
`SHIPPED` et `PENDING` sinon. Une commande expédiée qui afficherait « paiement en attente »
serait une affirmation fausse sur de l'argent, et c'est le genre d'affirmation qu'on ne
rattrape pas.

## 10. Les écrans

### Espace vendeur, la boutique

`shop-form.tsx` gagne un groupe de cases : les méthodes hors ligne, plus celles que le
registre sait servir. Décocher la dernière fait sortir la boutique du catalogue, donc
l'écran le dit **avant** de laisser décocher, et non après coup.

### Storefront, la validation

Chaque bloc de boutique a déjà son mot depuis T3 ; il gagne le choix de la méthode, parmi ce
que **cette** boutique accepte.

**Aucun défaut présélectionné** : préchoisir pour quelqu'un comment il paie est le genre de
confort qui se paie en litige.

L'exigence « une méthode par boutique » est portée par `placeOrders`, et non par
`checkoutSchema`. Ce schéma valide une adresse ; il ne connaît pas les boutiques du panier,
et les lui injecter demanderait de lire le panier deux fois. `placeOrders` est le seul
endroit qui voie à la fois les boutiques du panier et leurs méthodes vivantes, dans la
transaction verrouillée.

Les méthodes se lisent dans la même transaction que les prix. Une boutique qui décoche
pendant que l'acheteur remplit son adresse fait donc refuser la validation, exactement comme
un prix qui change la fait déjà refuser.

Après succès, T3 redirige vers la première commande. Avec deux boutiques et deux paiements à
faire, montrer la première et taire la seconde ne tient plus : une référence unique garde le
comportement d'aujourd'hui, plusieurs envoient vers `/orders`.

### Storefront, la commande

La méthode et l'état de l'argent, à côté de l'état de l'expédition.

Pour une méthode en ligne en attente, un bouton « Payer » appelle `/payments/start` et suit
la redirection. Un échec laisse réessayer, et la tentative précédente reste dans la trace.

Pour une méthode hors ligne, une phrase traduite par méthode et les coordonnées de la
boutique, puisque le vendeur ne renseigne aucune instruction.

Tant que le paiement est en attente, la page le redemande par intervalles et s'arrête dès
qu'il bouge.

### Espace vendeur, la commande

L'axe de l'argent s'affiche à côté de celui de l'expédition, avec les tentatives et leur
date. Pour une méthode hors ligne non réglée, un bouton « Paiement reçu ».

Les boutons d'avancement restent **tous ouverts**. L'écran dit que le paiement n'est pas
arrivé, il ne l'interdit pas.

## 11. Les libellés

Les cinq méthodes, les trois états de paiement, la phrase d'explication par méthode hors
ligne, l'avertissement avant de décocher la dernière, les refus de `/payments/start` et de
`/payments/settle`, et les deux boutons.

Le storefront a ses deux catalogues, français et anglais. **Le front vendeur n'en a qu'un,
français**, comme celui d'administration : c'est l'état du dépôt, et cette tranche ne le
change pas. Y déposer un catalogue anglais réduit à ses seules clés de paiement donnerait
une traduction que rien ne lit et que personne ne saurait compléter.

Les montants passent par les utilitaires de `money.utils.ts` : jamais de division par cent
codée en dur, XOF et XAF ayant un exposant de 0.

## 12. Les cas limites

**L'acheteur abandonne la redirection.** La commande existe, son paiement reste `PENDING`,
et le bouton « Payer » reste disponible sur sa page. C'est la conséquence directe des deux
axes, et elle est voulue : une commande abandonnée reste visible du vendeur, qui peut
l'annuler.

**Le webhook arrive avant le retour de l'acheteur.** C'est le cas courant chez un vrai
fournisseur. La page de retour est un rendu serveur neuf, donc elle affiche déjà l'état à
jour.

**Le webhook arrive deux fois.** La contrainte d'unicité le couvre, et un test d'intégration
l'épingle.

**Le webhook désigne une tentative inconnue.** `404`, sans rien écrire. Un paiement dont la
plateforme n'a aucune trace de démarrage n'est pas le sien.

**Le vendeur décoche une méthode après qu'une commande l'a choisie.** La commande garde sa
méthode, qui est figée. Seules les validations suivantes sont touchées.

**Un paiement en ligne échoue puis réussit.** Deux tentatives, deux payloads, et
`Order.paymentStatus` qui suit la dernière. La trace garde l'échec, ce qui est précisément ce
qu'une enquête cherche.

**Deux onglets démarrent le même paiement.** Deux tentatives `PENDING` avec deux références
différentes. Celle qui aboutit règle la commande ; l'autre reste `PENDING` sans effet, et
l'écran affiche la commande, pas les tentatives mortes.

## 13. Pièges déjà payés qui s'appliquent ici

- **`expect(...).rejects.toThrow(CONST)` compare par sous-chaîne** et passe pour la mauvaise
  raison. Les refus se vérifient avec `rejects.toMatchObject({ message: CONST })`.
- **Attendre ce que l'action a produit, jamais un mot que l'écran porte peut-être déjà.**
  Ce piège a mordu en T2a, T2e et T3. Après « Payer », attendre la page du simulateur ; après
  le retour, attendre l'état `SETTLED`, pas le mot « paiement ».
- **`revalidatePath` prend le motif de route**, `/[locale]/orders/[reference]`, et non le
  chemin rendu.
- **Un `upsert` sur une colonne unique n'est pas atomique entre deux transactions.** Le
  webhook écrit sous contrainte d'unicité : il doit traiter le `P2002` comme un rejeu, et non
  le laisser remonter.
- **Aucune configuration Prettier dans ce dépôt.** L'indentation à 4 espaces est tenue à la
  main ; lancer Prettier reformaterait du code écrit.
- **`packages/db` ne peut pas importer `packages/domain`.** Les constantes voyagent en
  paramètres.

## 14. Tests

**Unitaires.** La règle « en ligne, c'est avoir un adapter ». Le chiffrement aller-retour, et
un chiffré altéré que le sceau refuse. L'adapter simulé : signature valide, signature fausse
qui rend `null`, corps tronqué. Le schéma de validation qui exige une méthode par boutique.

**Intégration, sur Testcontainers.** L'idempotence du webhook est le test central : même
référence deux fois, une seule ligne, un seul changement d'état. Puis le refus de pointer un
paiement en ligne à la main, le refus pour un non-membre de la boutique, le refus de démarrer
un paiement d'une commande qui n'est pas la sienne, et l'éligibilité vue par les quatre
lectures, qui doivent s'accorder sur une boutique sans méthode.

**Bout en bout.** Un parcours hors ligne, de la validation au pointage par le vendeur. Un
parcours en ligne par le simulateur, une fois en payant, une fois en échouant puis en
réessayant.

## 15. Critères d'acceptation

1. Un vendeur coche ses méthodes, et une boutique qui n'en a aucune n'apparaît ni au catalogue, ni
   en vitrine, ni sur une fiche produit, par le même prédicat.
2. L'écran du vendeur prévient avant de laisser décocher la dernière méthode.
3. Un acheteur choisit une méthode par boutique, et ne peut pas valider sans l'avoir fait.
4. Une commande naît avec sa méthode figée et un paiement en attente, quelle que soit la
   méthode.
5. Une méthode en ligne mène à une redirection, un retour, et un paiement réglé par le
   webhook, sans qu'aucun écran ne mente entre les deux.
6. Le même webhook rejoué ne crée jamais de seconde ligne, et ne change plus rien dès que
   la tentative est tranchée. Voir la section 6 pour ce qu'un événement en attente rejoué
   réécrit.
7. Le payload brut est en base, chiffré, et un payload altéré refuse de se déchiffrer.
8. Un vendeur pointe un encaissement hors ligne, et ne peut pas pointer un paiement en ligne.
9. Les boutons d'avancement restent ouverts quel que soit l'état du paiement.
10. `lint`, `typecheck`, les tests unitaires, les tests d'intégration et la suite bout en bout
    passent en CI.

## 16. Risques

**L'API devient publiquement joignable, ce qu'elle n'était pas.** CORS, vérification
d'origine et un webhook sans session sont trois surfaces neuves le même jour. C'est le risque
principal de la tranche, et la raison pour laquelle le webhook ne fait rien avant d'avoir
vérifié une signature.

**Le pointage d'un encaissement hors ligne n'a aucune preuve.** Assumé : la plateforme ne
détient pas les fonds et ne peut rien vérifier. La trace dit qui a pointé et quand, ce qui
est tout ce qu'elle peut honnêtement dire.

**Rien n'empêche d'expédier un impayé.** Décision prise, écrite plus haut avec sa raison.

**Un panier à deux boutiques en ligne demande deux redirections.** Conséquence directe du
choix par boutique.

**`cardinality(...)` entre dans la requête la plus chère du dépôt.** C'est une condition sur
une colonne de `vendors`, déjà jointe, donc sans jointure nouvelle. La revue de T2d avait
mesuré que le coût de cette requête tient au `GROUP BY` et à la jointure latérale d'image, pas
au nombre de conditions.

**L'adapter simulé peut donner une fausse confiance.** Il prouve la forme, pas l'intégration :
un vrai fournisseur apportera ses propres codes d'état, ses rejeux, ses délais et son format
de signature. C'est exactement pourquoi le port existe, et pourquoi le simulateur passe par
son propre webhook plutôt que par un raccourci.
