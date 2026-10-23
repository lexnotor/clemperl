# ClemPerl, T8 : le commerçant suit ses commandes depuis son téléphone

**Date** : 2026-10-23
**Statut** : approuvée le 2026-10-23, exécution non commencée
**Tranche** : T8. La feuille de route l'appelait « API GraphQL pour le mobile » ; le cadrage
en a fait l'application mobile du vendeur ET l'API qui la sert, découpées en six marches,
T8a à T8f, chacune sa branche, son plan et sa pull request
**S'appuie sur** : `2026-09-17-t0-fondations-monorepo-design.md` (le partage entre Next et
NestJS), `2026-09-18-t1a-identite-design.md` (Better Auth et la session),
`2026-10-09-t3-panier-commande-design.md` (les transitions de commande),
`2026-10-11-t4-paiement-design.md` (le pointage d'un paiement hors ligne) et
`2026-10-20-t7-temps-reel-design.md` (la passerelle Socket.IO et le vocabulaire des
événements), toutes livrées

C'est un **MVP**, voulu comme tel.

---

## 1. L'intention, et le pourquoi

Le commerçant ne doit jamais rater une commande, même loin de son ordinateur. Le moment qui
porte la tranche : une commande arrive pendant qu'il est à l'atelier, le téléphone en poche.
Une notification sonne. Il la touche, la commande s'ouvre, il l'accepte ou la refuse sur
place, puis il en mène tout le suivi depuis le téléphone, jusqu'à l'expédition.

ClemPerl aura deux applications mobiles, une pour les vendeurs et une pour les acheteurs.
Celle du vendeur vient d'abord.

Ce que le commerçant fait depuis le téléphone, à la fin de T8 :

1. se connecter et se déconnecter, avec le compte qu'il a déjà sur le web ;
2. voir la liste de ses commandes, avec pour chacune la référence, le client et le statut ;
3. ouvrir une commande, l'accepter, l'expédier ou l'annuler, et pointer un paiement reçu à la
   livraison ;
4. voir ses produits, et activer ou désactiver chacun ;
5. entendre une notification quand une commande arrive.

**La tranche a une seconde intention, qui fixe sa forme.** Le propriétaire découvre GraphQL
et veut le comprendre en avançant. Sa façon d'apprendre : lire un genre de pièce une
première puis une deuxième fois, et écrire la troisième lui-même. D'où le découpage en
petites marches qu'il lit à mesure, et des séries de trois pièces du même genre dont il
écrit la dernière (section 3). Une marche trop grosse pour être lue est un échec de la
tranche, même si elle fonctionne.

---

## 2. Ce que T8 décide

### Le web garde son accès direct à la base

C'est la question que T0 laissait à cette tranche : les fronts Next cessent-ils de lire la
base pour passer par l'API ? **Non, pas dans T8.** Le téléphone passe par l'API, le web ne
change pas.

Le risque que T0 nommait, la même règle écrite à deux endroits qui divergent en silence, est
tenu autrement : un résolveur GraphQL appelle **les mêmes fonctions** que la server action
qui fait la même chose, celles de `packages/db` et de `packages/domain`. Accepter une commande
depuis le téléphone passe par `readOrderForVendor`, `advanceOrder` et `setOrderStatus`, comme
`advanceOrderAction` dans `apps/vendor/src/app/orders/[id]/actions.ts`. La règle reste écrite
une fois, seul le transport diffère.

Si l'enchaînement d'une server action porte une règle à lui, il est extrait dans une
fonction partagée que les deux appellent, plutôt que recopié. Recopier la lecture, l'appel au
domaine et l'écriture reste admis : c'est du transport. Recopier une vérification
d'appartenance, une transition ou l'état `from` qui rend une écriture sûre ne l'est pas.

Faire passer le web par l'API est un chantier à part entière, qui toucherait chaque écran sans
rien apporter de visible au commerçant. Il n'est pas de cette tranche.

### GraphQL, décrit par des classes, avec son schéma versionné

L'API ajoute un point d'entrée GraphQL, par `@nestjs/graphql` et `@nestjs/apollo` 14.0.3, qui
demandent NestJS 12 et acceptent TypeScript 6, ceux du dépôt. Le schéma est décrit **par le
code** : une classe décorée d'`@ObjectType()` dit ce qu'une commande montre au téléphone, et
NestJS en tire le fichier de schéma.

Ce fichier est **versionné**. Le propriétaire lit côte à côte la classe qu'il écrit et le
contrat qu'elle produit, et un test échoue si le fichier versionné ne correspond plus au code.

En développement, l'API ouvre un terrain de jeu GraphQL dans le navigateur : on y tape une
requête, on lit la réponse, et le schéma s'y explore. Il est fermé en production.

### Le téléphone n'importe aucun paquet du monorepo

Ni `@clemperl/db`, ni `@clemperl/domain`, ni `@clemperl/core`. Ce que l'écran doit savoir,
l'API le lui donne. Les actions qu'une commande permet, par exemple, arrivent dans la réponse,
calculées par `allowedOrderActions` côté serveur, comme l'écran web construit ses boutons depuis
cette même liste. Le téléphone n'a donc aucune règle à recopier, et Metro n'a aucun paquet
serveur à assembler.

Seule exception admise : les catalogues de traduction de `packages/i18n`, qui sont des
fichiers JSON.

### Le même compte, par le module Expo de Better Auth

La connexion passe par `@better-auth/expo` **1.7.5**, la version qui correspond exactement à
Better Auth 1.7.5 du dépôt. Aucune montée de version n'est nécessaire ; les versions suivantes
du module exigent un Better Auth plus récent.

Le gestionnaire Better Auth reste celui que la boutique monte déjà : le téléphone s'y connecte,
garde la session dans le stockage sécurisé du téléphone, et la présente ensuite à l'API, qui la
demande à la même instance Better Auth, comme `SessionGuard` le fait déjà. Le module Expo
s'ajoute à la configuration unique de `packages/auth`.

Connexion par courriel et mot de passe seulement. L'inscription, la vérification du courriel
et l'ouverture d'une boutique restent sur le web : un compte sans boutique voit un écran qui
l'y renvoie.

### Sur l'iPhone du propriétaire, dans Expo Go

L'application vit dans `apps/vendor-mobile`, en TypeScript, avec Expo Router. Elle tourne
dans **Expo Go**, sur l'iPhone du propriétaire. Aucune publication sur l'App Store ni sur
Google Play.

Expo Go n'accepte qu'un SDK, le plus récent : **58** au 2026-10-23. L'application suit ce
SDK. React Native 0.88 demande React `^19.3.0`, la version des fronts Next : le monorepo n'a
qu'une version de React.

L'application a ses propres composants, aux couleurs de ClemPerl : `packages/ui` est fait
pour le navigateur. Elle est en français, et en anglais selon la langue du téléphone.

### Les notifications : prouvées application ouverte, écrites application fermée

**Application ouverte**, elle se branche à la passerelle de T7, et une commande qui arrive
fait sonner une notification locale. Expo Go sait le faire : c'est prouvé sur le téléphone.

**Application fermée**, la sonnerie demande une notification envoyée par le serveur, qui
passe par Apple. Expo Go ne la reçoit plus sur Android depuis le SDK 53, et la documentation
d'Expo n'est pas nette pour l'iPhone. Une version de l'application construite pour le
téléphone la recevrait, mais elle exige un compte développeur Apple, payant, que le
propriétaire ne prend pas maintenant.

T8 écrit donc la partie serveur, l'enregistre et la teste sans téléphone, et dit en toutes
lettres qu'elle n'est **pas prouvée sur un appareil**. Voir T8f.

---

## 3. Les six marches

Chaque marche a sa branche, son plan, son commit et sa pull request, comme T6a à T6d. Une
marche ne commence qu'une fois la précédente fusionnée. Chacune se lit seule, en une séance :
les fichiers qu'Expo ou un outil génère sans retouche n'entrent pas dans cette lecture, et la
pull request les liste à part.

**La pièce du propriétaire.** Deux marches comptent une série de trois pièces du même genre.
Le constructeur écrit les deux premières et en commente le pourquoi. La troisième, le
propriétaire l'écrit, de bout en bout côté GraphQL : le type et le résolveur dans l'API, et le
document GraphQL que le téléphone envoie. Il en écrit aussi **un morceau de React Native** :
le constructeur pose l'écran et délimite ce morceau, le rendu d'une ligne de la liste ou le
branchement de la mutation sur l'interrupteur, par exemple. Le propriétaire veut suivre Expo,
qui a beaucoup changé depuis sa dernière manipulation.

Pour cette pièce, le constructeur écrit les tests d'abord, les voit échouer, et s'arrête. Le
propriétaire écrit le code, le constructeur lance les tests et relit avec lui. La marche ne se
ferme pas sans cette pièce, sauf si le propriétaire la rend.

**Deux guides qui grandissent.** `docs/graphql.md` explique chaque notion de GraphQL au moment
où elle entre dans le code : le schéma, un type, une requête, un résolveur, le contexte, une
mutation, une erreur, le client et ses types générés. `docs/expo.md` fait de même pour Expo et
React Native, en signalant ce qui a changé dans les versions récentes : Expo Router, le SDK 58,
Expo Go. Chaque marche y ajoute ses notions, avec le renvoi au fichier qui les montre. Les
commentaires du code gardent leur règle : ils disent pourquoi, pas comment marche GraphQL ou
Expo.

### T8a, GraphQL entre dans l'API

L'API reçoit GraphQL, son terrain de jeu et son fichier de schéma versionné, avec son test.
Une seule requête, « qui suis-je » : le compte connecté et sa boutique, ou aucune boutique.
Pas encore de téléphone : la preuve se fait dans le terrain de jeu, avec une session ouverte
sur la boutique web.

`docs/graphql.md` naît avec ses premières notions.

**Acceptée quand** le propriétaire, connecté sur la boutique web, tape la requête « qui
suis-je » dans le terrain de jeu et lit son compte et sa boutique ; déconnecté, la même
requête est refusée.

### T8b, l'application naît

`packages/auth` reçoit le module Expo. L'application naît dans `apps/vendor-mobile` : elle se
connecte, appelle « qui suis-je », affiche le nom de la boutique, ou l'écran qui renvoie vers
le web quand le compte n'en a pas, et se déconnecte. Elle a déjà ses deux langues, son thème,
et son client GraphQL avec les types tirés du fichier de schéma.

Le téléphone doit joindre la boutique et l'API de développement depuis le réseau local. La
marche le rend possible et documente comment, dans la mise en route de l'application, sans
rien qui décrive un poste particulier.

`docs/expo.md` naît avec ses premières notions.

**Acceptée quand** le propriétaire, sur son iPhone, dans Expo Go, se connecte avec son compte
vendeur, lit le nom de sa boutique, puis se déconnecte.

### T8c, les lectures

Trois requêtes, une série de trois :

1. **la liste des commandes** de la boutique : référence, client, statut, la plus récente en
   tête, comme `listOrdersForVendor` ;
2. **le détail d'une commande** : ses lignes, son total, son paiement, l'adresse de livraison,
   les actions qu'elle permet, et un signal quand un litige est ouvert, à traiter sur le web ;
3. **la liste des produits** : titre, statut publié ou brouillon. **C'est la pièce du
   propriétaire.**

L'application gagne les écrans correspondants. Toucher une commande de la liste l'ouvre.

**Acceptée quand** les trois écrans montrent sur le téléphone ce que l'espace vendeur web
montre pour la même boutique, et qu'une commande d'une autre boutique ne se lit pas, ni par
l'écran ni par le terrain de jeu.

### T8d, les écritures

Trois mutations, une série de trois :

1. **faire avancer une commande** : accepter, expédier, annuler, par la même chaîne que
   `advanceOrderAction` ;
2. **pointer un paiement reçu**, par le même service que `POST /payments/:orderId/settle`, que
   l'espace vendeur appelle déjà ;
3. **activer ou désactiver un produit**, par `setProductStatus`, avec le même refus qu'un
   produit sans photo prête. **C'est la pièce du propriétaire.**

Les deux premières changent une commande ou un paiement : elles émettent l'événement de T7
correspondant, directement, puisque c'est l'API qui écrit, comme le pointage le fait déjà.
L'acheteur, sur le web, reçoit son alerte comme aujourd'hui. Une écriture refusée parce que
la commande a bougé ailleurs le dit, comme l'écran web, dans la langue du téléphone : le
filtre d'exception et le contexte de requête de la section 4 entrent ici.

**Acceptée quand** le propriétaire accepte puis expédie une commande depuis le téléphone, que
la page de l'acheteur passe à « Expédiée » sans être rechargée, et qu'il désactive puis
réactive un produit.

### T8e, le temps réel dans l'application

L'application ouverte rejoint les salles de ses boutiques sur la passerelle de T7. Une
commande qui arrive fait sonner une notification locale et rafraîchit l'écran affiché. Au
retour au premier plan, l'écran se rafraîchit une fois, comme une page web qui se reconnecte.

**La passerelle doit reconnaître le téléphone sans affaiblir le filtre des navigateurs.**
Aujourd'hui elle reconnaît l'application à l'origine de la poignée de main, et refuse une
origine inconnue ou absente. Un navigateur envoie toujours cette origine, et une page ne peut
pas la falsifier : c'est ce qui empêche un site tiers d'ouvrir une connexion avec la session de
son visiteur.

React Native, lui, en envoie une aussi, déduite de l'adresse de la socket, donc celle de l'API
(`WebSocketModule` sur Android, SocketRocket sur iPhone). L'accepter ouvrirait la passerelle
aux pages que l'API sert elle-même dans un navigateur, le simulateur de paiement et le terrain
de jeu. D'où la règle : l'application **impose sa propre origine**, une valeur fixe tirée de son
schéma d'adresse, qu'aucune page web ne peut porter, et la passerelle reconnaît cette valeur
comme l'application vendeur mobile, qui rejoint les salles de ses boutiques. Toute autre
origine reste jugée par `appForOrigin`, à l'identique. Les deux plateformes laissent un
en-tête fourni par l'appelant remplacer l'origine déduite ; le constructeur le vérifie en tête
de la marche, sur le téléphone.

Les événements qui sonnent sont ceux des commandes : `order.placed`, `order.status_changed`
et `payment.status_changed`, dans les cas où T7 prévient la boutique. Les autres genres,
photos et litiges, ne sonnent pas.

**Acceptée quand**, l'application ouverte sur le téléphone, une commande passée sur la
boutique web fait sonner le téléphone et apparaît dans la liste sans geste.

### T8f, les notifications application fermée

L'API tient un registre des téléphones : à la connexion, une fois la permission accordée,
l'application enregistre son jeton de notification ; à la déconnexion, elle le retire. Une
commande qui arrive part vers chaque téléphone enregistré de chaque membre de la boutique, par
le service de notifications d'Expo.

L'envoi passe par sa propre file BullMQ : un service extérieur lent ne retarde pas les
alertes de T7, et un échec se relance. Un jeton qu'Expo déclare mort est retiré du registre.
Un envoi raté ne touche jamais la commande.

La seule notification envoyée est celle de la commande qui arrive, le moment de la section 1.

**Ce qui n'est pas prouvé.** Les tests établissent que la bonne demande part au bon moment,
vers les bons téléphones, contre un faux service d'Expo. Personne ne voit un iPhone sonner,
application fermée. Le constructeur essaie quand même d'obtenir un jeton dans Expo Go sur
l'iPhone : s'il l'obtient et qu'une notification arrive, la preuve est faite et la passation
le dit ; sinon, elle dit ce qui manque.

Cette tentative demande un compte Expo gratuit, que le propriétaire accepte d'ouvrir : un jeton
de notification se rattache à un projet Expo, dont l'identifiant entre dans la configuration de
l'application, versionnée. Cet identifiant n'est pas un secret. Aucun jeton d'accès au compte
n'entre dans le dépôt.

**Acceptée quand** les tests de l'envoi passent, que le registre suit connexions et
déconnexions, et que la passation dit exactement ce qui a été vu sur un appareil et ce qui ne
l'a pas été.

---

## 4. Le contrat, en esquisse

Pour fixer les idées, pas les noms : le constructeur les arrête dans T8a et T8c.

```graphql
type Query {
  me: Me!
  orders: [OrderSummary!]!
  order(id: ID!): Order
  products: [ProductSummary!]!
}

type Mutation {
  advanceOrder(orderId: ID!, action: OrderAction!): Order!
  settleOrderPayment(orderId: ID!): Order!
  setProductPublished(productId: ID!, published: Boolean!): ProductSummary!
  registerPushDevice(token: String!): Boolean!
  unregisterPushDevice(token: String!): Boolean!
}
```

Toute requête exige une session, et chaque lecture est bornée à la boutique du compte, par la
signature des fonctions du dépôt, comme sur le web. Une commande d'une autre boutique répond
comme une commande qui n'existe pas : dire « interdit » confirmerait qu'elle existe.

**`/graphql` sert le téléphone, et le terrain de jeu en développement. Les fronts web ne
l'appellent pas.** Une requête du téléphone n'a pas d'origine : `fetch` en React Native n'en
envoie pas. Le point d'entrée accepte donc une requête **sans origine**, refuse toute origine
présente, `null` compris, et n'admet en développement que celle du terrain de jeu. Ce n'est
pas plus faible qu'`OriginGuard` sur le pointage REST : une requête forgée par un site tiers
part d'un navigateur, et un navigateur envoie toujours l'origine d'une requête `POST`. La
protection contre ces requêtes qu'Apollo active par défaut reste active.

Une erreur rendue au téléphone suit `docs/conventions/erreurs.md`, qui l'emporte sur toute
autre forme : l'exception porte une clé et ses arguments, et un filtre global de l'API la
traduit dans la langue de la requête, celle que le téléphone annonce, en
`message: string[]`. L'API n'a encore ni ce filtre ni le contexte de requête qui porte la
langue (`docs/conventions/contexte-requete.md`). Ils entrent dans la marche qui rend le
premier refus que le commerçant doit lire, les écritures, et pas avant. Une session absente
n'est pas un message à traduire : le téléphone revient à l'écran de connexion. Les catalogues
de l'API suivent la règle 4 de la convention, toutes les langues dans le même changement.

---

## 5. Non-buts

- **L'application acheteur.** Elle est prévue, et c'est une tranche à elle.
- **Le stock.** Il n'existe pas (spec T3, « Aucun stock ») ; le mettre à jour depuis le
  téléphone supposerait de le créer d'abord, pour le web aussi. Une tranche ultérieure.
- **Les litiges, les photos et l'édition des produits sur le téléphone.** Ils restent sur le
  web ; le détail d'une commande signale seulement un litige ouvert.
- **L'inscription, la connexion Google et l'ouverture d'une boutique sur le téléphone.**
- **Le choix entre plusieurs boutiques.** L'espace vendeur web n'en connaît qu'une par compte
  (`readVendorForMember`), le téléphone fait pareil.
- **La publication sur les stores**, la construction d'une version installable, la
  configuration Android des notifications.
- **Le web qui passe par l'API.**
- **Des notifications conservées** : ni historique, ni compteur de non-lus, comme T7.
- **Le regroupement des lectures** (DataLoader) : les listes d'une boutique sont courtes.

## 6. Anti-buts

T8 échoue, même si tout fonctionne, si :

- une règle est écrite une seconde fois dans un résolveur : une transition, une vérification
  d'appartenance, l'état `from` d'une écriture ;
- le téléphone lit ou modifie une commande ou un produit d'une autre boutique ;
- la passerelle accepte une poignée de main de navigateur qu'elle refuse aujourd'hui ;
- un envoi de notification raté retarde, refuse ou défait une commande ;
- la passation ou une pull request laisse croire que la sonnerie application fermée a été vue
  sur un appareil alors qu'elle ne l'a pas été ;
- une marche arrive trop grosse pour que le propriétaire la lise.

## 7. Les cas limites

| Cas | Ce qui se passe |
| --- | --- |
| Un collègue a accepté la commande entre l'affichage et le geste | L'écriture est refusée, le téléphone dit que la commande a bougé, et l'écran se rafraîchit |
| Le compte connecté n'a pas de boutique | Un écran le renvoie vers le web, aucune requête de boutique ne part |
| La boutique est suspendue | Le téléphone le signale comme l'espace vendeur web (`ShopOffline`) |
| La session a expiré | Retour à l'écran de connexion, sans message d'erreur technique |
| Un produit sans photo prête qu'on active | Refusé, avec la même raison que sur le web |
| Le téléphone change de compte | L'ancien jeton est retiré du registre, le nouveau enregistré, les salles changent |
| Expo déclare un jeton mort | Il est retiré du registre, sans erreur pour personne |
| Redis ou le service d'Expo injoignable | La commande et l'écriture réussissent ; la notification se perd ou se relance |
| L'API injoignable depuis le téléphone | Un écran le dit, et propose de réessayer |

## 8. Tests

`apps/api` garde ses règles et son seuil de 100 % (`docs/conventions/tests.md`). Chaque
résolveur a son test unitaire ; les lectures et les écritures ont leur test d'intégration
contre une vraie base, qui prouve aussi le bornage à la boutique ; un test HTTP de bout en bout
passe par `/graphql` avec une vraie session. L'envoi des notifications a son test de contrat
contre une réponse figée du service d'Expo.

Le fichier de schéma versionné a son test : il échoue si le code ne produit plus ce fichier.

L'application mobile suit l'outillage standard d'Expo pour ses tests ; le constructeur le
choisit, sans seuil, comme les fronts. La preuve d'une marche sur le téléphone est faite par
le propriétaire, et la passation dit ce qu'il a vu.

## 9. Ce qui est laissé au constructeur

- les noms exacts du schéma, l'organisation du module GraphQL dans `apps/api`
  (`docs/conventions/nestjs.md`) ;
- le client GraphQL du téléphone et la génération de ses types depuis le fichier de schéma ;
- la façon dont le téléphone joint les serveurs de développement ;
- l'intégration HTTP d'Apollo Server 5 avec Express sous NestJS, à vérifier en début de T8a ;
- l'outillage de test de l'application ;
- la forme du registre des téléphones et sa migration ;
- la façon dont le téléphone affiche un montant, sans recopier la règle de `formatPrice`.

## 10. Choix faits pendant le cadrage, à relire

Le propriétaire a validé le tableau d'ensemble. Ces points sont des choix du rédacteur, qu'il
peut contester :

- Apollo côté API, et le schéma décrit par des classes ;
- `apps/vendor-mobile` et Expo Router ;
- le français et l'anglais dans l'application, alors que l'espace vendeur web n'a qu'un
  catalogue français ;
- la pièce du propriétaire écrite contre des tests déjà posés, et les deux guides
  `docs/graphql.md` et `docs/expo.md` ;
- T8a prouvée dans le terrain de jeu, avec une session ouverte sur la boutique web, avant que
  le téléphone existe ;
- seuls les événements de commande sonnent application ouverte, et seule la commande qui
  arrive sonne application fermée ;
- une file BullMQ à part pour l'envoi des notifications ;
- le signal d'un litige ouvert sur le détail d'une commande ;
- l'origine imposée par l'application sur la passerelle, plutôt qu'un espace de noms
  Socket.IO à part ou l'origine de l'API ;
- `/graphql` qui accepte une requête sans origine et refuse toutes les autres hors terrain de
  jeu ;
- les erreurs traduites par l'API selon la convention, et le filtre qui le fait livré avec les
  écritures.
