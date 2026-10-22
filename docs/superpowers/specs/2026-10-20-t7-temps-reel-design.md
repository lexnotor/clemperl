# ClemPerl, T7 : le temps réel

**Date** : 2026-10-20
**Statut** : exécutée, PR #18
**Tranche** : T7. La feuille de route de T0 l'appelait « temps réel et notifications » et y
rangeait aussi les courriels transactionnels et la messagerie ; ce MVP n'en garde que le temps
réel, voir la section 6
**S'appuie sur** : `2026-09-17-t0-fondations-monorepo-design.md` (Socket.IO porté par
`apps/api`), `2026-09-24-t2c-pipeline-medias-design.md` (la file BullMQ des photos, qui est le
modèle de celle-ci), `2026-10-09-t3-panier-commande-design.md`,
`2026-10-11-t4-paiement-design.md` (l'interrogation par intervalles que T7 remplace) et
`2026-10-19-t6d-litiges-design.md`, toutes livrées

C'est un **MVP**, voulu comme tel.

---

## 1. L'intention, et le pourquoi

Une application sans temps réel ne se prend pas au sérieux. Aujourd'hui, ce qui change
ailleurs, chez le vendeur, chez le prestataire de paiement ou dans un traitement de fond, ne
se voit qu'en rechargeant la page, ou au prix d'une interrogation par intervalles.

Cinq moments forment le MVP :

1. **le suivi de commande** : le vendeur, ou l'administration, accepte, expédie ou annule, et
   la commande de l'acheteur suit ;
2. **le paiement** : un webhook du prestataire règle ou refuse le paiement, ou le vendeur
   pointe un paiement hors ligne, et l'acheteur le voit ;
3. **la nouvelle commande** : le vendeur la voit arriver ;
4. **les photos de produit** : le traitement d'une image finit ou échoue, et le vendeur le
   voit ;
5. **les litiges** : un message, une décision ou une déclaration « servi » de l'autre partie
   apparaît.

**La personne est avertie où qu'elle soit** dans son application, pas seulement sur la page
concernée : un vendeur qui regarde ses produits apprend qu'une commande vient d'arriver.

## 2. Ce que T7 décide

### Les événements partent de l'API, et d'elle seule

L'API est le seul point d'émission. Le webhook de paiement, le pointage hors ligne et le
traitement d'images y vivent déjà : ils émettent directement. Les trois fronts, qui écrivent
en base depuis leurs actions serveur, **déposent un événement dans une file BullMQ** après
chaque écriture concernée ; l'API la consomme et émet.

Raison : décidée au cadrage. Le temps réel a un seul propriétaire, et le jour où l'on voudra
faire signaler les changements par la base elle-même (`LISTEN/NOTIFY` de PostgreSQL), seule
l'entrée de l'API changera. La file plutôt qu'un appel HTTP suit le précédent des photos, qui
passent déjà d'un front à l'API par BullMQ, et n'expose aucune route à protéger.

### Un front dit « quoi » et « sur quoi », jamais « à qui »

Un événement porte son genre et l'identifiant de ce qu'il concerne, par exemple
`order.status_changed` et un `orderId`. **C'est l'API qui relit la commande, le litige ou
l'image et décide qui prévenir.** Un front ne peut donc pas envoyer un événement à la
mauvaise personne, ni en inventer le destinataire.

### Un dépôt raté ne défait jamais l'écriture

L'écriture est faite et commitée avant le dépôt. Si Redis est injoignable, le dépôt échoue,
l'erreur est journalisée, et l'action rend son résultat normal : la commande est expédiée,
seule l'alerte se perd. Comme on n'alerte que qui est en ligne, la page de l'autre partie se
met à jour à son prochain chargement.

### On n'alerte que qui est en ligne

Aucune notification n'est conservée. Un vendeur hors ligne quand la commande arrive la
découvre en ouvrant sa liste, comme aujourd'hui. Les notifications conservées viendront
plus tard ; le modèle ne les ferme pas : c'est dans le consommateur de la file de l'API
qu'une ligne de notification s'écrira, à côté de l'émission.

### Le risque d'oubli est le point à surveiller

Faire signaler par la base aurait garanti qu'aucun chemin d'écriture n'oublie de prévenir ;
déposer depuis le code ne le garantit pas, et la leçon de `shippedAt` en T6d est exactement
celle-là. La parade tient en trois points :

- **un seul utilitaire** de dépôt, partagé par les trois fronts, dans un paquet ;
- **la liste exhaustive des écritures concernées**, dans la section 4 ;
- **un test par action** qui vérifie qu'elle dépose son événement, et pas seulement qu'elle
  écrit.

## 3. Le modèle

Aucune table, aucune migration. Les événements ne sont pas conservés.

**Les genres d'événements** forment un vocabulaire fermé, écrit une fois dans un paquet que
les fronts et l'API partagent :

| Genre | Porte | Qui est prévenu |
| --- | --- | --- |
| `order.placed` | `orderId` | les membres de la boutique |
| `order.status_changed` | `orderId`, `by` | l'acheteur ; et la boutique quand `by` vaut `ADMIN` |
| `payment.status_changed` | `orderId`, `by` | l'acheteur ; et la boutique, sauf quand `by` vaut `VENDOR` |
| `product_image.processed` | `imageId` | les membres de la boutique |
| `dispute.opened` | `disputeId` | les membres de la boutique |
| `dispute.message_posted` | `disputeId`, `by` | l'autre partie |
| `dispute.decided` | `disputeId` | l'acheteur et la boutique |
| `dispute.served` | `disputeId` | les membres de la boutique |

`by` vaut `BUYER`, `VENDOR`, `ADMIN` ou, pour un paiement réglé par le webhook du
prestataire, `PROVIDER`. Il ne désigne aucun compte : il sert seulement à ne pas alerter la
partie qui vient elle-même d'agir, comme le vendeur qui pointe un paiement hors ligne.

« L'acheteur » se reçoit dans la boutique, « la boutique » dans l'espace vendeur : voir les
salles, ci-dessous.

**Les salles Socket.IO** sont dérivées de la session ET de l'application qui se connecte.
Un même compte achète et vend, et la session est partagée entre les fronts : sans ce
cloisonnement, un onglet de la boutique annoncerait « nouvelle commande dans votre boutique »,
et l'espace vendeur « votre commande est expédiée » pour un achat personnel du vendeur.

- une connexion **de la boutique** rejoint la salle du compte, `user:<id>`, et reçoit ce qui
  concerne l'acheteur ;
- une connexion **de l'espace vendeur** rejoint une salle par boutique dont le compte est
  membre, `shop:<vendorId>`, toutes s'il en a plusieurs, et reçoit ce qui concerne la
  boutique.

L'application se reconnaît à l'origine de la poignée de main, comparée aux adresses
configurées de la boutique et de l'espace vendeur ; une origine inconnue est refusée.
L'administration n'a pas de salle dans ce MVP.

Lecture du cadrage, où il a été dit que le vendeur est averti « dans son espace ».

**Ce que reçoit le navigateur** : le genre, et de quoi composer l'alerte (la référence de
la commande, le titre du produit, l'état de l'image), jamais plus que ce que la page de cette
personne affiche déjà. L'identifiant concerné n'y est pas, et c'est voulu : le navigateur ne
fait qu'alerter puis rafraîchir, et la page relit ses propres données, avec ses propres
gardes. Un futur « ne rafraîchir que la page concernée » devra l'y ajouter.

## 4. Les écritures qui déposent un événement

La liste est **exhaustive** : toute écriture qui change l'un des cinq moments y figure, et un
test le vérifie pour chacune.

| Où | Écriture | Événement |
| --- | --- | --- |
| Boutique, validation de commande | `placeOrders` | `order.placed`, un par commande créée |
| Espace vendeur, action de commande | `setOrderStatus` | `order.status_changed`, `by: VENDOR` |
| Administration, action de commande | `setOrderStatusAsAdministrator` | `order.status_changed`, `by: ADMIN` |
| API, webhook de paiement | `applyProviderEvent` | `payment.status_changed`, `by: PROVIDER`, quand l'état de paiement de la commande est écrit, un refus sur une commande déjà refusée compris ; rien pour un rejeu, un événement en attente, ni l'issue tardive d'une tentative dont la commande est déjà réglée |
| API, pointage hors ligne | `settleOffline` | `payment.status_changed`, `by: VENDOR` |
| API, traitement d'images, dans le worker | `markImageReady`, `markImageFailed` | `product_image.processed` |
| Boutique, litige | `openDispute` | `dispute.opened` |
| Boutique, litige | `postDisputeMessageAsBuyer` | `dispute.message_posted`, `by: BUYER` |
| Espace vendeur, litige | `postDisputeMessageAsVendor` | `dispute.message_posted`, `by: VENDOR` |
| Administration, litige | `decideDispute` | `dispute.decided` |
| Boutique, litige | `markDisputeServed` | `dispute.served` |

Le dépôt se fait **après** l'écriture et **hors** de sa transaction : un événement pour une
écriture annulée annoncerait ce qui n'a pas eu lieu.

Deux précisions. `placeOrders` rend des références et non des identifiants : l'événement
porte l'identifiant, que le dépôt rend ou que l'action relit. `markImageFailed` est aussi
appelé par l'espace vendeur quand la file des photos est injoignable ; ce chemin-là
n'émet pas, la page du vendeur se mettant déjà à jour par sa propre action.

## 5. L'émission, et les écrans

### Côté API

Un module `realtime` porte la passerelle Socket.IO, le consommateur de la file et le service
qui résout les destinataires.

**La connexion est authentifiée par la session**, demandée à la même instance Better Auth
que les applications, à partir du cookie de la poignée de main, exactement comme le fait
`SessionGuard`. Une connexion sans session est refusée. Les origines acceptées sont celles de
la configuration CORS existante, `allowedOrigins`.

**Plusieurs exemplaires de l'API** : un événement de la file n'est consommé que par un seul
exemplaire, qui ne joint que les navigateurs connectés à lui. L'adaptateur Redis de Socket.IO
relaie l'émission à tous les exemplaires ; sans lui, un second exemplaire perdrait la moitié
des alertes en silence.

**La résolution des destinataires** relit en base ce qui est concerné, par des lectures
portées du dépôt : la commande donne l'acheteur et la boutique, le litige donne sa commande,
l'image donne la boutique de son produit.

### Côté navigateur

La boutique et l'espace vendeur ouvrent **une connexion par onglet**. La boutique ne se
connecte qu'avec une session : un visiteur sans compte ne se connecte pas. L'espace vendeur se
connecte sur chacune de ses pages sans lire la session, puisque toutes exigent une
appartenance, et la passerelle refuse une poignée de main sans session.

À chaque événement :

1. **une alerte brève** s'affiche, où que l'on soit dans l'application, dans la langue de la
   personne, et annoncée aux lecteurs d'écran ;
2. **la page affichée se met à jour** d'elle-même, par un rafraîchissement des composants
   serveur : c'est la page qui relit ses données, avec ses propres gardes, jamais l'événement
   qui les apporte.

**À la reconnexion**, la page se rafraîchit une fois, pour rattraper ce qui a pu être manqué.
Une première connexion qui aboutit après des tentatives ratées fait de même : la page a été
rendue sans connexion.

**À une première connexion réussie d'emblée**, seule une page qui ATTEND se rafraîchit une
fois : la commande dont un paiement en ligne attend la réponse du prestataire, et la page des
photos tant qu'une image est en traitement. Un événement arrivé entre le rendu de la page et
l'ouverture de la connexion serait sinon perdu, et c'est précisément le retour de chez un
vrai prestataire, dont le webhook arrive un instant après, que l'interrogation couvrait. Les
autres pages ne se rafraîchissent pas à la connexion : l'espace vendeur navigue par des liens
ordinaires, donc chaque navigation est un chargement complet, et elle rendrait deux fois.

**Un seul rafraîchissement de secours**, sur la commande qui attend son prestataire : elle
redemande la page au serveur une fois, une minute après son affichage, au cas où l'avis se
serait perdu, parti avant que la connexion n'ait rejoint sa salle, ou pendant que Redis ou
l'API étaient injoignables. La page des photos n'en a pas.

**L'interrogation par intervalles disparaît** : `payment-watch` dans la boutique, et la boucle
de rafraîchissement de la page des photos dans l'espace vendeur. Le secours de la commande
n'en est pas une : il ne se répète jamais.

## 6. Non-buts

**Les notifications conservées**, et donc tout historique ou compteur de non-lus : voir la
section 2.

**Les courriels de transition de commande**, rangés sous T7 par T0. Aucune transition
n'envoie encore de courriel ; c'est un sujet à part.

**La messagerie libre entre acheteur et vendeur.** Le fil d'un litige existe déjà ; une
messagerie hors litige est une autre tranche.

**Le temps réel côté administration** : ni salle, ni alerte.

**Les notifications de l'application mobile**, qui viendront avec T8.

**La présence, l'indicateur de saisie, les accusés de lecture.**

**Les traitements planifiés**, que T1b et T2c avaient renvoyés « à T7, avec les traitements
planifiés » : le balayage des objets orphelins du stockage et celui des photos restées en
attente. Ils restent repoussés, et la passation les rattache à une tranche ultérieure au lieu
de les laisser pointer vers T7.

## 7. Anti-buts

**Un événement reçu par quelqu'un qu'il ne concerne pas.** Les salles sont dérivées de la
session et les destinataires de la base ; si un compte reçoit l'événement d'une commande qui
n'est pas la sienne ou d'une boutique dont il n'est pas membre, la tranche a échoué.

**Une écriture qui échoue parce que le temps réel est en panne.** Redis ou l'API injoignables
ne doivent jamais faire échouer une validation de commande, une expédition ou une décision.

**Une écriture qui oublie de prévenir**, en silence. C'est la raison de la liste et des tests
de la section 4.

**Une page qui reste figée en se disant à jour.** D'où le rafraîchissement à la reconnexion.

## 8. Les cas limites

Un compte connecté dans deux onglets : les deux reçoivent l'alerte, chacun dans sa salle.

Un membre de deux boutiques : il rejoint les deux salles et reçoit les événements des deux.

Un vendeur qui achète aussi : son onglet de la boutique ne reçoit que ses achats, son onglet
de l'espace vendeur que sa boutique.

Une session expirée pendant la connexion : l'émission continue jusqu'à la prochaine poignée de
main, qui la refuse. Accepté pour un MVP : aucune donnée ne transite, seulement de quoi
composer une alerte sur ce que la page affichait déjà.

Un événement dont l'objet a disparu entre le dépôt et la consommation : il est abandonné sans
erreur.

Un webhook rejoué qui ne change rien : `applyProviderEvent` rend déjà `changed: false`, et
rien n'est émis.

## 9. Tests

**Pur, dans un paquet** : le vocabulaire des genres, et la règle « qui prévenir » par genre,
`by` compris.

**Intégration, contre le vrai PostgreSQL** : les lectures qui résolvent les destinataires
d'une commande, d'un litige et d'une image.

**Unitaire, dans l'API** : la poignée de main refusée sans session ou depuis une origine
inconnue, les salles dérivées de la session ET de l'application, l'émission vers les bonnes
salles pour chaque genre, `by` compris.

**Unitaire, dans les trois fronts** : chaque action de la section 4 dépose son événement
après une écriture réussie, et rien sur un refus. Qu'un dépôt raté ne fasse jamais échouer
l'action se prouve une fois, sur l'utilitaire de dépôt partagé : il ne rejette jamais, et son
attente est bornée à deux secondes.

**Navigateur** : l'acheteur voit sa commande passer à « Expédiée » sans recharger, avec
l'alerte, pendant que le vendeur l'expédie dans un autre contexte ; le vendeur, sur la page de
ses produits, est averti d'une nouvelle commande ; la page de paiement suit le simulateur de
paiement en ligne sans interrogation par intervalles.

## 10. Critères d'acceptation

1. Les cinq moments de la section 1 apparaissent sans recharger chez la personne concernée,
   avec une alerte, où qu'elle soit dans son application
2. Personne ne reçoit un événement qui ne le concerne pas
3. Une écriture réussit même quand Redis ou l'API sont injoignables
4. Chaque écriture de la section 4 dépose son événement, et un test le vérifie
5. L'interrogation par intervalles des pages de paiement et de photos a disparu
6. À la reconnexion, la page affichée se rafraîchit
7. `lint`, `typecheck`, `test`, `test:e2e` et les seuils de couverture passent

## 11. Ce qui est laissé au constructeur

Le nom de la file, des fonctions et du paquet qui portent le vocabulaire et l'utilitaire de
dépôt, en anglais, suivant les conventions du dépôt.

La forme de l'alerte, sur le modèle des retours existants (`role="status"`), et son texte, par
genre, dans les catalogues de chaque application.

Les options de rétention de la file, sur le modèle de la file des photos.
