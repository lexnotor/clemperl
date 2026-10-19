# Passation

> **Portée** : tout le dépôt. Ce document dit **où en est le travail** et **ce qu'il
> faut pour le reprendre ailleurs**. Il ne répète ni les conventions
> (`docs/conventions/`), ni les faits du dépôt (`CLAUDE.md`), ni la mise en route
> (`README.md`, `docker/README.md`).

Dernière mise à jour : 2026-10-19.

## Où en est le projet

Le travail avance par tranches. Chacune a son cycle propre : idéation, spécification,
plan, exécution, un commit.

| Tranche | Objet | État |
| --- | --- | --- |
| T0 | Fondations du monorepo | **Livrée**, commit `6918645` |
| T1a | Identité et sessions | **Livrée**, commit `15e276a` |
| T1b | Vendeurs : demande d'ouverture et validation | **Livrée**, `ef68c6c`..`c33188c` |
| T2a | Espace vendeur et boutique | **Livrée** |
| T2b | Produit et variantes | **Livrée** |
| T2c | Pipeline médias (BullMQ, sharp, worker) | **Livrée** |
| T2d | Catalogue public : liste, filtres, fiche | **Livrée**, PR #6 |
| T2e | Collections de produits | **Livrée**, PR #7 |
| T3 | Panier et commande | **Livrée** |
| T4 | Paiement, point d'extension | **Livrée** |
| T5 | Activer et suspendre une boutique | **Livrée** |
| T6a | Modérer le catalogue | **Livrée**, PR #12 |
| T6b | Gérer les comptes et les rôles | **Livrée**, PR #13 |
| T6c | Surveiller les commandes et débloquer | **Livrée**, PR #14 |
| T6d | Litiges | **exécutée**, PR #15 à fusionner |
| T7 | Temps réel | non commencée |
| T8 | API GraphQL pour le mobile | à cadrer |

**La liste du catalogue n'est pas cacheable page entière.** La devise vit dans un cookie,
donc la page est personnelle, et un lien partagé ne montre pas la même chose à deux
personnes. C'est la conséquence assumée du choix de T2d ; le poids réel reste sur les
images, qui gardent le cache d'un an de la route de relais. Le jour où la liste coûte trop
cher, la sortie est de passer la devise dans l'URL, ce qui rend la page cacheable par
adresse.

**Le catalogue coûte environ 300 ms par page à cinquante mille produits, et c'est
structurel.** Mesuré par la revue de T2d, sur un jeu synthétique : le `GROUP BY p.id`
empêche de pousser le `LIMIT`, donc PostgreSQL agrège toute la table avant d'en garder
vingt-quatre ; la jointure latérale d'image tourne une fois par ligne candidate ; et
`unaccent` est `STABLE`, pas `IMMUTABLE`, donc aucun index d'expression n'est possible sans
l'envelopper. L'index `products_status_category_idx` n'apparaît dans aucun plan mesuré.

Rien de tout cela ne gêne un catalogue qui n'a pas encore de produits, et la sortie n'est
pas le `tsvector` que la spec évoque : il ne règle que le troisième point. Les deux premiers
tiennent à la forme de la requête, et se traitent le jour où le volume existe, pas avant.

**La requête du catalogue est la seule du dépôt écrite en SQL.** Prisma ne sait pas trier
une liste de produits par le minimum du prix de leurs variantes, et on a refusé de
dénormaliser une colonne pour contourner cette limite. Trois règles la rendent sûre :
valeurs paramétrées, tri choisi dans une table fermée, conditions assemblées par
`Prisma.join`. Y ajouter un filtre, c'est ajouter un fragment à `conditions`, jamais
concaténer une chaîne.

**Les dépôts ne reçoivent que des primitives, jamais un type du domaine.**
`packages/domain` dépend de `@clemperl/db`, donc l'inverse fermerait un cycle que Turbo ne
saurait pas ordonner. La page traduit les filtres avant d'appeler le dépôt. Même raison
pour la clé de combinaison, construite des deux côtés et épinglée par un test
d'intégration de `apps/api`, seul paquet qui voit les deux.

**L'ordre d'une collection est réécrit en entier à chaque mouvement.** `position` ne porte
AUCUNE contrainte d'unicité, et c'est délibéré : PostgreSQL vérifie une contrainte à chaque
instruction et non en fin de transaction, donc échanger deux rangs la violerait avant de la
rétablir. Chaque déplacement réécrit donc toutes les lignes de la collection, ce qui
referme au passage les trous laissés par un retrait. Une collection est un choix humain,
donc une poignée de lignes ; le jour où elle est longue, la sortie est un pas d'incrément
et des positions espacées. Voir la section 4 de la spec T2e.

**`collections` est un mot réservé dans le slug d'un produit.** Next résout un segment
statique avant un segment dynamique, donc un produit ainsi nommé serait masqué par
`/shops/<shop>/collections/<slug>` et répondrait 404 sans message. Le refus est porté par
`slugifyProductTitle`, et la migration vérifie qu'aucun produit existant ne porte ce slug,
en échouant si c'en est un.

**La page publique d'une collection n'a pas sa propre requête.** Elle ajoute un fragment à
`conditions()` du catalogue, et une jointure interne sur `collection_items` qui n'existe
que lorsqu'une collection est demandée. Recopier les conditions d'éligibilité créerait la
seconde vérité que la revue de T2d a déjà payée sur le décompte des devises. La jointure
est posée dans les DEUX requêtes, celle des lignes et celle du décompte.

**L'API passera en GraphQL, et ce sera sa propre tranche.** La raison n'est pas une
préférence de style : une application mobile React Native (Expo) est prévue, donc l'API
aura un consommateur hétérogène, ce qui n'est pas le cas aujourd'hui, où les trois
fronts Next attaquent PostgreSQL directement par leurs server actions, comme T0 l'a
décidé.

Cette tranche devra trancher une question de niveau T0 : les fronts Next cessent-ils de
parler à la base pour passer par l'API ? Deux chemins de lecture sur les mêmes données,
c'est exactement le risque que T0 nommait : la même règle écrite à deux endroits, qui
divergent en silence. La réponse conditionne le périmètre de la tranche, pas l'inverse.

T1b a tenu la décision de T1a : le rôle vendeur est une **relation**
(`vendor_members`), jamais une colonne du compte. La spécification T1a, section 1, porte
cette décision et sa raison ; `docs/superpowers/specs/2026-09-19-t1b-vendeurs-design.md`
porte le modèle qui en découle.

## T6d est exécutée, au 2026-10-19

Un acheteur conteste une commande expédiée depuis moins de quatorze jours : il désigne les
articles, choisit un motif, raconte, joint jusqu'à trois preuves. La boutique est prévenue
par courriel et répond dans le même fil. Un litige sans échange depuis sept jours est à
trancher ; l'administration tranche, avant ou après, pour l'un ou pour l'autre, avec un
commentaire que les deux parties reçoivent par courriel. L'acheteur, et lui seul, se déclare
servi. Prouvé dans un navigateur par `e2e/disputes.spec.ts`, de la commande jusqu'à
« Servi ».

La tranche s'appelait « litige et remboursement constaté » ; elle devient « Litiges ». La
spec : `docs/superpowers/specs/2026-10-19-t6d-litiges-design.md`. Le plan :
`docs/superpowers/plans/2026-10-19-t6d-litiges.md`, dix tâches, exécutées dans une seule
session, sans commit d'étape : le travail part en un commit de chantier.

### Les décisions qui comptent

**La plateforme tranche, elle ne rembourse pas.** Elle ne détient jamais les fonds : une
décision pour l'acheteur somme le vendeur de le servir, à sa façon. Après la décision, la
plateforme ne fait plus rien ; la suite se règle hors de ClemPerl, et la suspension de T5
reste un geste séparé.

**Le litige est un objet à côté de la commande**, qui garde `SHIPPED`. La machine à états de
T3 n'a pas bougé, et la règle « l'acheteur n'a aucune action sur sa commande » tient : il agit
sur un litige.

**Aucune horloge.** « À trancher » est une condition calculée à la lecture par
`isDisputeRipe`, jamais un état écrit. La liste de l'administration rend TOUS les litiges
ouverts, du plus ancien échange au plus récent, ce qui met d'office les mûrs en tête.

**Les deux délais sont en dur**, quatorze et sept jours, dans
`packages/domain/src/constants/dispute.constant.ts`. Les rendre réglables est voulu et
repoussé ; le vendeur n'en règlera jamais aucun, libre de mettre zéro il ne recevrait plus
aucun litige.

**`Order.shippedAt` s'écrit dans `writeOrderStatus`**, l'aide commune au vendeur et à
l'administration, et nulle part ailleurs : un chemin qui l'oublierait retirerait en silence
tout recours à ses acheteurs. Aucun rattrapage : les commandes expédiées avant n'ouvrent rien,
sans coût puisque la plateforme n'a aucune commande réelle.

**La langue de l'acheteur est retenue sur le litige**, à l'ouverture : elle n'est enregistrée
nulle part ailleurs.

**Les preuves vont dans le bucket privé des justificatifs**, sous `disputes/<uuid>/`, et
chaque application les sert par sa propre route, qui revérifie la portée à chaque requête.
Tout refus répond 404. L'espace vendeur accepte désormais 16 Mo par action, pour trois
preuves de 5 Mo.

**Une ouverture réussie, comme une décision, redirige** vers la page du litige avec un avis
dans l'URL (`?notice=opened`, `decided` ou `mail_failed`). Un message porté par l'état du
formulaire disparaîtrait avec lui, puisque la page le remplace aussitôt. Un courriel raté ne
défait rien, et l'écran le dit.

**Les pièces se contrôlent aussi dans le navigateur, avant l'envoi**, par la même règle du
domaine, `attachmentViolations`, exportée par `browser.ts`. Au-delà de 16 Mo, Next refuse le
corps de l'action sans qu'elle tourne : quatre photos de téléphone feraient sinon tomber la
page et perdre le récit, sans qu'un message dise pourquoi. Le serveur reste juge.

**« J'ai été servi » demande une confirmation**, derrière un `details` : la décision clôt le
litige pour de bon, et la commande n'en ouvre pas de second.

### Ce que la revue de branche a changé

Un relecteur neuf a lu la branche entière : aucun défaut critique. Cinq points ont été
corrigés, chacun avec un test vu rouge : l'avis d'échec de courriel perdu après une décision,
la page d'erreur au-delà de 16 Mo, la confirmation de « J'ai été servi », deux gardes
d'action sans test, et un parcours navigateur qui n'exerçait ni la route des pièces du
vendeur ni son dépôt. Huit points mineurs restent ouverts, listés plus bas.

### Ce que T6d ne fait pas

Aucun délai réglable, aucune quantité ni motif par ligne, aucun second litige sur la même
commande, aucun courriel à chaque message, aucun message de l'administration dans le fil,
aucun mouvement d'argent ni constat de remboursement, aucune sanction automatique. Le type et
la taille des pièces sont ceux que le navigateur déclare : les octets ne sont pas lus, comme
pour les justificatifs de candidature.

### Deux pièges payés, consignés dans `docs/pieges.md`

**Un champ de fichier vide arrive en `File` nommé `blob`** dans une action serveur Next. Le
filtre sur le nom vide le laissait passer, et toute réponse sans pièce était refusée « format
non accepté ». Trouvé par le parcours navigateur, alors que tous les tests unitaires étaient
verts ; `submittedFiles` filtre désormais sur la taille seule.

**Les conteneurs des fronts gardent l'ancien client Prisma** après un changement de schéma,
et le régénérer dedans relit l'ancien schéma de leur image : seul `pnpm docker:up` les
répare. Symptôme : la boutique en 500 et six échecs sans rapport dans
`media-route.int-spec.ts`.

### Les décomptes, mesurés

| Couche | Résultat |
| --- | --- |
| `disputes.int-spec.ts`, neuf | 27 tests |
| Intégration, couche entière | 21 suites, 289 tests |
| Domaine | 249 tests, couverture 100 % |
| `packages/core` | 45 tests, couverture 100 % |
| Boutique, vendeur, administration | 50, 9 et 47 tests unitaires |
| `lint`, `typecheck`, `test` | 15/15 chacun ; `verify:thresholds` sans orphelin |
| `build` | 9/9 |
| `e2e/disputes.spec.ts`, seul | 3 exécutions au vert avant la revue, 2 après |
| Suite navigateur complète, `--workers=1` | avant la revue : 34 passés, 1 en échec ; après : 35 passés |

### Ce que la vérification n'a PAS établi

**`sign-up.spec.ts:80` est instable, et ce n'est pas T6d.** La réinitialisation de mot de
passe tombe parfois sur l'attente du retour à l'accueil après la connexion : rouge dans la
première suite complète, puis une fois vert et une fois rouge seul, enfin vert dans la
seconde suite complète. T6d ne touche aucun fichier de ce parcours, et ce test échouait déjà
dans la CI le 2026-10-10, sur `main`. Non diagnostiqué, signalé tel quel.

**La maturité à sept jours n'est pas jouée dans un navigateur.** Elle est éprouvée aux deux
frontières par le domaine, et l'ordre qui met les mûrs en tête par l'intégration.

**Les refus d'écran périmé** (un message posté sur un litige tranché entre-temps, servir un
litige qui a bougé) ne sont épinglés que par les tests unitaires des actions et par
l'intégration. Aucun parcours navigateur ne les provoque.

**Le lien du courriel de décision vers un acheteur anglophone**, préfixé `/en`, n'est vérifié
que par le test unitaire de l'action : le parcours navigateur est joué en français.

**Un formulaire de plus de 16 Mo n'a pas été soumis pour de vrai.** Le parcours vérifie que
le navigateur bloque quatre pièces avant l'envoi ; il ne force pas le refus 413 de Next.

### Les mineurs laissés ouverts par la revue

- Une violation par fichier : trois pièces trop lourdes affichent trois fois la même phrase.
- Le champ de fichier natif est libellé dans la langue du navigateur ; donner un mode
  `multiple` au `FileField` du kit le réglerait.
- La page du litige de l'acheteur ne rappelle ni le motif ni les articles contestés.
- La liste des commandes du vendeur ne signale pas un litige tranché contre lui.
- La forme d'un message de litige est déclarée deux fois dans des props `.tsx`.
- Des identifiants français dans le code neuf (`envois`, `litiges`, `lignes`, `fil`,
  `piece`, `langue`, `motif`), contre la règle du dépôt.
- Deux styles de lecture des tables de traduction, accès direct et `Object.hasOwn`.
- Les en-têtes de réponse d'une pièce existent en quatre copies.

## T6c est livrée, au 2026-10-18

L'administration liste les commandes de toutes les boutiques, filtre par état et par boutique,
et fait avancer n'importe laquelle selon la table des transitions, y compris celle qu'un
vendeur silencieux a laissée dormir. Le parcours est prouvé dans un navigateur par
`e2e/order-oversight.spec.ts` : une commande est passée, le vendeur ne fait rien,
l'administration l'annule, et l'acheteur la voit annulée depuis la vitrine.

La T6c d'origine, « surveiller les commandes et arbitrer », a été coupée en deux au cadrage : le
chemin du litige demande un modèle que cette tranche n'ajoute pas, et la plateforme ne détient
jamais les fonds, donc un remboursement ne peut qu'être constaté, pas effectué. Cette part est
T6d, non commencée.

### Ce qui a été livré

- Une écriture d'état sans portée de boutique dans `packages/db`, à côté de celle du vendeur,
  qui exige toujours l'appartenance. Les deux refusent un état lu périmé.
- Une lecture de toutes les commandes, paginée sur un ordre clos par l'identifiant, avec le
  décompte lu dans le même instantané que la page.
- Deux écrans dans l'administration : `/orders` (filtres, pagination, nom de boutique ET
  slug sur chaque ligne) et `/orders/[id]` (les seules actions possibles, rendues d'après
  `allowedOrderActions`).
- Un avertissement avant l'annulation d'une commande dont le paiement est reçu : l'annuler
  ne rembourse rien. Sa condition est `shouldWarnSettled`.

### Deux décisions du commanditaire, à relire

La spec les consigne comme des décisions du commanditaire, la seconde contre l'avis de son
rédacteur. Elles sont réversibles à peu de frais : il faut le savoir avant de les trouver
trop larges.

**L'administration peut effectuer toutes les transitions que le vendeur peut.** Elle peut donc
déclarer expédié un colis qu'elle n'a jamais vu. La spec en
assume le coût : le contrepoids est humain, pas technique. *Suggestion, non décidée :* la
restreindre à l'annulation ne demanderait que de filtrer les actions offertes par la page et
par l'action serveur, sans toucher à la machine à états.

**Aucun auteur n'est enregistré.** Un vendeur ne peut pas distinguer ce qu'il a fait de ce que
l'administration a fait à sa place : une commande annulée ou expédiée par elle se lit comme
s'il l'avait fait lui-même. Deux colonnes sur la commande suffiraient, l'acteur et l'instant,
écrites par les deux chemins d'écriture.

### Ce que le parcours navigateur a établi

- L'avertissement du paiement reçu est atteint dans un navigateur : le vendeur pointe le
  paiement à la livraison, la commande reste reçue, et l'administration voit l'avertissement
  avant le clic sur « Annuler ». Une mutation de la page, qui passe une chaîne vide à la place
  de l'appel à `shouldWarnSettled`, fait échouer le parcours sur cette assertion. C'est la
  seule chose qui l'attrape : les tests unitaires ne voient que la fonction.
- Chaque absence de bouton a sa présence avec le même sélecteur : « Annuler » et « Accepter »
  sont constatés sur la commande reçue, « Expédier » sur la commande acceptée par
  l'administration, avant que chacun soit constaté absent. L'acceptation par l'administration,
  transition qu'aucun autre parcours ne lui voit faire, est elle-même exercée.

### Où ranger ce genre d'aide, et l'index à ajouter

- **Les trois aides pures de cette tranche vivent au mauvais endroit.** Les deux lecteurs de
  paramètres d'URL et la condition de l'avertissement sont dans `apps/admin`, qui n'a aucun
  seuil de couverture : rien en CI ne remarque qu'une de leurs branches perd son test.
  `packages/domain` existe pour cela et porte un seuil de 100 pour cent. Il contient déjà leur
  jumelle, `src/utils/catalog-filters.utils.ts`, qui résout les mêmes problèmes pour le
  catalogue : lecture de la page, assainissement des paramètres, premier d'un paramètre
  répété, constructeur de lien et taille de page. La prochaine tranche les y déplace plutôt
  que d'écrire une quatrième copie.
- **La garde contre la pollution de prototype est écrite deux fois**, dans l'action du
  vendeur et dans celle de l'administration. Un garde de type à côté de `advanceOrder`
  rendrait un troisième appelant sûr par construction.
- **L'index que la nouvelle requête voudra.** La liste non filtrée de l'administration trie
  toute la table des commandes par date de création, avec un décompte sur chaque ligne, et
  aucun index ne la sert. Une migration est volontairement hors de cette tranche.
  `@@index([createdAt, id])` sur la commande est la première chose qu'un test de charge ou la
  tranche suivante réclamera.

### Pour reprendre

- Trois fois dans cette tranche, une condition a dû être sortie d'un composant serveur pour
  devenir testable : les deux lecteurs de paramètres d'URL et la condition de l'avertissement.
  Une fonction enfouie dans un composant serveur ne se teste pas, et ce dépôt n'a aucun outil
  pour la tester en place. Le réflexe à garder : l'extraire dans son propre module dès qu'elle
  porte une règle, et laisser au navigateur le soin de prouver que la page l'appelle.
- Deux pièges payés par cette tranche sont dans `docs/pieges.md` : les deux `packages/db/dist`
  (hôte et conteneur) qui divergent, et le test unitaire qui passe par accident à travers un
  mock non configuré.
- La suite navigateur complète a tourné une fois sur cette machine : 33 réussis, et un échec,
  `collection.spec.ts` (correction du titre d'une collection, « Soldes d ete » reçu au lieu de
  « Soldes d été »), qui est antérieur à cette tranche. `order-oversight.spec.ts` a passé trois fois de
  suite seul dans sa forme finale, et dans la suite complète avant l'ajout de l'acceptation. Le lancement s'est fait contre `pnpm docker:up`, jamais
  `pnpm e2e:up`, dont le limiteur de débit refuse les créations de comptes.


### Les deux constats de CodeRabbit, vérifiés puis traités, au 2026-10-19

Chacun a été confronté au code avant d'être appliqué. Le premier est juste en entier, le
second à moitié. Il ne reste qu'à fusionner la PR #14.

**Un paiement reçu entre l'affichage et le clic : juste.** `applyProviderEvent` et
`settleOffline` écrivent `paymentStatus` sans toucher à `status`, et la comparaison-et-échange
de `writeOrderStatus` ne porte que sur `status`. L'annulation passait donc sans que
l'administrateur ait vu l'avertissement que le cinquième critère d'acceptation promet.

Le formulaire renvoie désormais l'état de paiement affiché, et l'action refuse une annulation
quand la relecture dit `SETTLED` alors que l'écran ne le disait pas, avec son propre message.
Elle ne refuse que dans ce sens, et c'est plus étroit que ce que CodeRabbit proposait : un
paiement reçu ne revient jamais en arrière, et un passage de `PENDING` à `FAILED` ne change
rien à l'avertissement, donc le refuser ferait recharger pour rien.

Ce qui reste ouvert, et c'est assumé : la relecture et l'écriture sont deux instructions. Un
paiement reçu dans les millisecondes qui les séparent passe encore. Fermer cette fenêtre-là
demanderait de porter l'état de paiement dans le `where` de `writeOrderStatus`, donc d'ouvrir
le dépôt pour un avertissement qui n'est qu'informatif. La fenêtre fermée est celle où la page
reste ouverte, qui se compte en minutes.

**Le numéro de page : à moitié juste.** `"2junk"` rendait bien 2, comme `"7abc"`, `"3.9"`,
`"+4"` et `" 3"`. La fonction exige désormais des chiffres et rien d'autre.

**Le plafond, en revanche, n'a PAS été posé, et c'est la partie du constat qu'il ne fallait
pas suivre.** Deux raisons, l'une mesurée, l'autre lue :

- contre une base jetable aux migrations à jour, Prisma 7 accepte un `skip` de 1,8·10¹⁷ et
  rend une liste vide, sans erreur. Le décalage sort bien de la précision sûre, mais une page
  au-delà des données est vide quelle que soit sa valeur exacte ;
- recopier le plafond du catalogue, mille, ferait boucler le lien « suivant » sur la page
  mille dès que la liste dépasse vingt mille commandes, en répétant les mêmes lignes. C'est
  exactement ce que le premier critère d'acceptation interdit. Le catalogue plafonne pour borner
  le coût du tri final sur une vitrine que personne ne parcourt si loin ; l'administration, elle,
  doit pouvoir atteindre chaque commande.

Un commentaire dans `search-params.ts` le dit, pour que personne ne recopie le jumeau.

**Ce qui épingle les deux correctifs.** Quatre tests unitaires neufs, 36 au lieu de 32 côté
administration. Chacun a été vu en échec avant le code, sauf les deux qui gardent contre une
correction excessive : « laisse annuler une commande impayée » et « laisse annuler une
commande payée quand l'écran l'affichait déjà payée ». Cinq mutations jouées, chacune tuée
par un seul test : refuser toute annulation payée, oublier la condition sur le paiement reçu
(qui bloquait toute annulation d'une commande impayée), rendre le message générique, et
retirer chacune des deux ancres de l'expression. `lint`, `typecheck` et `test` à 15 sur 15.

`order-oversight.spec.ts` passe contre `pnpm docker:up`, sur un conteneur vérifié porteur du
nouveau code. Il annule une commande impayée puis une commande payée sous avertissement : le
champ caché fait donc l'aller-retour dans les deux cas. Le REFUS lui-même, un paiement reçu
pendant que la page est ouverte, n'est épinglé que par le test unitaire de l'action. Aucun
parcours navigateur ne le provoque.

## T6b est livrée, au 2026-10-17

Un super_admin invite un administrateur depuis `/accounts` : la personne reçoit UN courriel
portant un lien à usage unique, choisit son mot de passe, et entre dans l'administration sans
voir l'option de nommer un super_admin. Le parcours est prouvé dans un navigateur par
`e2e/accounts.spec.ts`.

### Ce qui a été livré

- `SUPER_ADMIN` dans `E_USER_ROLE`, et une matrice pure dans `packages/domain` par laquelle
  passent tous les tests de rôle du dépôt.
- Un dépôt dans `packages/db` qui protège le dernier super_admin sous verrou consultatif, et
  refuse un changement de rôle quand la cible a bougé depuis sa lecture.
- L'écran `/accounts` : inviter, retirer, renvoyer l'invitation, élever en super_admin.
- L'invitation écrit un `User` SANS `Account`, puis demande une réinitialisation. L'état
  « en attente » est l'absence de toute ligne `Account`, et c'est `resetPassword` qui crée le
  justificatif au choix du mot de passe. `sendResetPassword` choisit entre le message de
  bienvenue et la réinitialisation ordinaire sur cette même condition.
- Le jeton de réinitialisation vaut trois jours, pour tous les parcours.

### Ce que le parcours navigateur a établi

- `user.id` est bien renseigné dans `sendResetPassword` pour un compte sans `Account` : la
  personne invitée reçoit le message de bienvenue, objet « Votre compte d'administration
  ClemPerl est prêt », et non la réinitialisation ordinaire.
- Un seul courriel part pour une invitation, compté dans Mailpit à la fin du parcours.

### Deux décisions de plan à relire

Elles étaient en tête du plan et ont été suivies telles quelles. Elles sont reportées ici pour
être relues plutôt qu'oubliées.

**L'élévation en super_admin est rendue sur la ligne de l'administrateur**, visible du seul
super_admin. Sans ce bouton, la case « nommer un super_admin » de la matrice serait
inatteignable : l'adresse d'un collègue déjà administrateur est prise, et l'invitation sur une
adresse existante est refusée.

**Un compte retiré ne peut pas revenir.** Retirer ramène à `CUSTOMER`, les clients ne sont pas
listés, et promouvoir un client existant est un non-but. Qui est retiré par erreur garde un
compte qu'aucun écran ne peut re-nommer. C'est la conséquence des non-buts, choisie et non
découverte.

*Suggestion de l'implémentation, hors spec, non décidée :* lister les clients, ou accepter
l'invitation sur l'adresse d'un client, lèverait ce blocage. Cela contredit deux non-buts de
la spec, aucune gestion des clients et aucune promotion d'un client existant : le décider
revient à les rouvrir.

### Pour reprendre

- Trois pièges payés par cette tranche sont dans `docs/pieges.md` : le schéma Prisma qui
  n'atteint pas `storefront`, `vendor` et `admin` dans la pile de développement, `$queryRaw` qui
  ne lit pas un `interval`, et la durée globale du jeton de réinitialisation.
- Après un `switch` qui touche `schema.prisma`, régénérer sur l'hôte et rebâtir les images
  avec `pnpm docker:up`.
- La suite navigateur complète n'est pas verte sur cette machine, comme avant cette tranche.
  Au dernier passage, `collection.spec.ts` (correction du titre d'une collection) et
  `vendor-product-images.spec.ts` ont échoué, et un test n'a pas tourné ; `accounts.spec.ts`
  a passé cinq fois de suite seul, et dans la suite. La CI sur son poste dédié tranche.

## Où en est T6b, au 2026-10-16

> Historique de la préparation. La tranche est livrée : voir la section précédente.

Spec approuvée, plan écrit, exécution pas commencée. Tout est sur la branche
`feat/accounts-and-roles`, qui porte aussi, au passage, le correctif de la ligne du tableau
que T6a avait laissée « en cours » : la branche `docs/t6a-roadmap-row` a été repliée dedans
plutôt que laissée à pendre.

- La spec : `docs/superpowers/specs/2026-10-16-t6b-comptes-et-roles-design.md`, commit
  `f827ef5`.
- Le plan : `docs/superpowers/plans/2026-10-16-t6b-comptes-et-roles.md`, sept tâches.

### Reprendre : la question qui attend une réponse

Le plan est posé, pas lancé. Il se termine sur le choix de la méthode d'exécution, et c'est
la seule chose qui bloque : sous-agents, un par tâche avec un relecteur neuf entre chaque,
ou natif, les sept tâches dans la session puis une revue de branche à la fin.

**Le natif était recommandé**, pour deux raisons : les tâches s'enchaînent par leurs
interfaces, la 3 consommant la 2, la 4 la 3, les 5 et 6 la 4 ; et le plan porte déjà les
signatures et les assertions, donc le modèle qui exécute n'a pas de conception à refaire.
C'est aussi ce vers quoi T3 avait basculé en cours de route.

### Deux décisions de plan à relire avant de lancer

Ce sont les deux endroits où la spec laisse deux lectures. Elles sont en tête du plan, et
elles changent ce qui se construit.

**L'élévation d'un administrateur en super_admin est rendue sur sa ligne.** La matrice de la
section 2 accorde « Nommer un super_admin » à un super_admin, mais la section 6 ne décrit que
le formulaire de création. Sans bouton sur la ligne, cette case est inatteignable : l'adresse
d'un collègue déjà administrateur est prise, et la section 9 refuse l'invitation sur une
adresse existante. Le bouton est donc rendu, visible du seul super_admin.

**Un compte retiré ne peut pas revenir.** Retirer ramène à `CUSTOMER`, les clients ne sont
pas listés, et promouvoir un client existant est un non-but explicite. Qui est retiré par
erreur garde donc un compte qu'aucun écran ne peut re-nommer. C'est la conséquence des
non-buts, pas un oubli, mais elle mérite d'être choisie plutôt que découverte.

### Ce que la préparation a établi, et qui n'est pas dans la spec

**Le `grep` de la section 4 donne neuf sites de production, pas huit.** Le neuvième est
`apps/admin/src/app/setup/page.tsx:12`, la barrière d'amorçage au rendu, qui double celle de
l'action. Le tableau complet est dans la tâche 3 du plan.

**`canDecide` et `canViewApplication` ne sont appelées par aucun code de production.**
L'écran de décision sur une candidature s'appuie sur `requireAdministrator` seul. Le risque
que nomme la section 4 de la spec, « un super_admin perdrait le droit d'examiner les
dossiers », est donc porté par `apps/admin/src/lib/session.ts`, pas par le domaine. Les deux
fonctions restent à élargir pour ne pas piéger leur premier appelant, mais ce n'est pas là
que la garde se joue.

**Le risque de la section 10 est largement tranché par lecture, et la mesure reste à
faire.** `better-auth@1.7.5` crée le justificatif de mot de passe quand il n'en existe aucun,
au moment du `resetPassword` : `dist/api/routes/password.mjs`, branche
`if (!await findCredentialAccount(userId))`. La piste 1 n'a donc pas besoin d'écrire une
ligne `Account` à la main : écrire la ligne `User` seule, puis demander une
réinitialisation, suffit, et c'est la personne qui crée son justificatif en choisissant son
mot de passe. Cela donne aussi une dérivation propre de l'état « en attente », à savoir
l'absence de toute ligne `Account`.

La tâche 1 mesure quand même, et surtout les trois points qu'une lecture ne tranche pas :
combien de messages partent réellement, si `resetPassword` crée bien le justificatif absent,
et si `auth.api.requestPasswordReset` appelée **côté serveur** traverse le `originCheck`
posé sur `redirectTo`. Ce dernier point est le plus susceptible de casser : ce paramètre
relatif n'a jamais été exercé que depuis le navigateur, par la page `/forgot-password`.

**La piste 2 de la section 10 n'existe pas sous la forme où la spec l'imagine.**
`emailVerification.sendOnSignUp` est lue à l'inscription comme
`sendOnSignUp ?? requireEmailVerification` : la poser à `false` coupe le courriel de
vérification de TOUTES les inscriptions, pas de ce chemin seul.

**`resetPasswordTokenExpiresIn` existe, est typée, et vaut des SECONDES**, un défaut d'une
heure. Trois jours valent donc `259200`. Elle est bien globale, comme la spec le supposait :
aucun réglage par flux n'existe dans cette version.

**Le courriel d'invitation ne peut pas être celui de réinitialisation.** Le texte existant
dit « Si vous n'êtes pas à l'origine de cette demande, ignorez ce message ». Envoyé à
quelqu'un qu'on vient d'embaucher, il lui conseille d'ignorer la seule chose qui lui ouvre
son compte. `sendResetPassword` choisira donc entre deux messages, sur la même condition que
la colonne « en attente ».

### Avant de lancer la tâche 1

Elle a besoin de la pile de développement levée, Mailpit compris : c'est une mesure contre
le vrai relais, pas contre un bouchon. `pnpm docker:up`, puis vider la boîte avant de
compter.

Et le rappel habituel après un `switch` qui touche `schema.prisma` :
`packages/db/generated/` est ignoré par Git, donc rebâtir. Ici, rien ne touche encore au
schéma, mais la tâche 3 le fera.

## T6a est livrée, au 2026-10-15

Un administrateur retire du catalogue un produit qui n'a rien à y faire, avec un motif que le
vendeur reçoit, sans punir toute la boutique. Cinq tâches, faites sur deux machines.

### Les décisions qui comptent

**Le retrait est un AVERTISSEMENT.** Il dépublie et prévient, et le vendeur peut republier.
Aucun état nouveau : on écrit `status: DRAFT`, ce qu'une dépublication ordinaire écrit déjà.
Ce qui distingue les deux est le MOTIF et le courriel, pas l'état. Coût assumé : un contenu
illicite revient d'un clic, et le recours redevient la suspension de T5.

**Publier efface `REVIEWED`, pour TOUTE publication.** C'est ce qui donne son mordant à
l'avertissement : sans cela, un vendeur republie ce qu'on lui a retiré et ne repasse devant
personne. Distinguer une republication après retrait d'une republication ordinaire
demanderait de retenir qu'un retrait a eu lieu, donc le journal que T6 a écarté.

**Les tags système sont un vocabulaire FERMÉ**, un tableau d'énumération sur `Product`, à la
manière de `Vendor.paymentMethods`. Il démarre avec `REVIEWED` seul : un tag entre quand un
écran en a besoin, et chaque ajout coûte une migration, ce qui est une friction utile.

**La file se définit comme « publiés sans `REVIEWED` »**, du plus récent au plus ancien, et
elle SE VIDE. C'est sa propriété importante : un administrateur sait qu'il a fini. L'écran
dit aussi combien il reste, sans quoi personne ne saurait où il en est, la file démarrant
avec tout le catalogue déjà publié.

**Les motifs dérivent de l'ÉNUMÉRATION**, pas du catalogue de traduction, qui ne fournit que
les libellés. Une valeur ajoutée sans libellé s'affiche brute, donc se voit, au lieu de
disparaître en silence.

**Le motif n'a pas de valeur par défaut.** Un `select` sans choix neutre sélectionne le
premier motif d'office, et confirmer sans choisir aurait accusé de contrefaçon quelqu'un
qu'on voulait seulement rappeler à l'ordre. Aucune garde ne l'aurait attrapé, le motif étant
du vocabulaire. Le choix vide est refusé côté serveur aussi.

### Un produit validé se modifie librement, et c'est assumé

Décidé le 2026-10-15, après qu'une revue l'a soulevé.

**Ce qui se passe.** Seule une REPUBLICATION efface la marque `REVIEWED`. Or `saveProduct`
ne touche ni `status` ni `systemTags`, et le dépôt d'images ne bloque que la suppression de
la DERNIÈRE image prête d'un produit publié. Un vendeur peut donc faire examiner un article,
puis en changer le titre, la description et les photos sans jamais quitter `PUBLISHED` : la
marque demeure, et la file ne le revoit plus.

**La décision.** Un produit validé se modifie à volonté. La remise en file sur édition est
remise à plus tard, avec la question du renommage.

**Ce qu'il en coûte si on se trompe.** Un vendeur peut publier un article inoffensif, le
faire valider, puis l'éditer en tout autre chose sans qu'aucun administrateur ne le revoie.
C'est la route la moins chère pour contourner ce que la modération existe pour empêcher, et
elle est moins coûteuse que dépublier puis republier, qui ramène en file.

**La sortie, le jour où cela gêne.** Effacer `REVIEWED` dans `saveProduct` et sur toute
écriture d'image, exactement comme `setProductStatus` le fait déjà. Trois points d'appel, pas
une refonte. Il faudra alors décider si une correction de faute d'orthographe renvoie en
file, sans quoi la file se remplira de bruit.

### Une dette qui ne fait aucun bruit

**Le filtre de `REVIEWED` est écrit pour un futur que rien ne garde.** `setProductStatus`
efface la marque PAR FILTRE et non par remise à zéro, afin qu'un futur tag ne disparaisse pas
quand quelqu'un republie. Mais `E_PRODUCT_TAG` n'ayant qu'une valeur, aucun test ne distingue
aujourd'hui un filtre d'une remise à zéro : la mutation l'a vérifié et ne tue rien.

Le code est juste, le test est vert, et l'un ne prouve pas l'autre. **Le jour où un second tag
entrera dans l'énumération, il faudra ajouter le test qui distingue**, et personne ne s'en
souviendra si ce n'est pas écrit ici.

### Ce que T6a ne fait pas

Aucun journal des actes : qui a retiré quoi n'est conservé nulle part, et le courriel parti
chez le vendeur en est la seule trace. Aucun compteur de récidive, puisque rien n'est
conservé. Aucune modération du nom, de la description ou des images d'une boutique, ni des
collections : le levier y reste la suspension de T5. Aucun signalement par les visiteurs : la
file part des nouveautés, et le signalement sera sa propre tranche le jour où le volume
dépassera ce qu'un humain parcourt.

### Trois noms et une largeur, corrigés en route

`ERROR_MODERATION_PRODUCT_NOT_FOUND` et non `ERROR_PRODUCT_NOT_FOUND`, ce dernier étant déjà
pris par le dépôt des produits. Les deux restent distincts volontairement : `PRODUCT_NOT_FOUND`
est une SOUS-CHAÎNE de l'autre, et les actions comparant par `includes`, les confondre aurait
fait passer un test qui ne prouvait rien.

La vignette se demande en **320**, pas en 200 : `DERIVATIVE_WIDTHS` vaut `[320, 800, 1600]` et
la route de relais refuse le reste. En 200, toutes les vignettes auraient été cassées.

### Les décomptes, mesurés

| Couche | Résultat |
| --- | --- |
| `moderation.int-spec.ts` | 12 tests |
| Domaine, motif et courriel | 6 tests |
| Intégration, couche entière | 18 suites, 231 tests |
| `lint`, `typecheck`, `test` | 15/15 chacun |
| `build` | 9/9 |
| Parcours navigateur de T6a, lancés seuls | 2 tests, 5 exécutions au vert |

### Ce que la vérification n'a PAS établi

**La suite navigateur n'est pas verte d'un bloc sur cette machine, et ce n'est pas une
régression de T6a.** Trois exécutions complètes, trois jeux d'échecs DIFFÉRENTS, aucun test
tombant deux fois : modération au premier passage, suspension et paiement au deuxième,
commande et candidature au troisième. C'est mot pour mot le comportement documenté depuis
T2e, et la consigne qui l'accompagne tient : ne pas s'acharner, la CI tranche sur un runner
dédié.

**Deux assertions ont tout de même été corrigées**, parce qu'elles relevaient d'une classe
diagnostiquée et non de la charge : elles attendaient CINQ secondes une action serveur suivie
d'une revalidation et d'un re-rendu. Mesuré : cinq exécutions isolées du parcours de
modération passent, et seule la suite complète le faisait tomber. Le délai est passé à trente
secondes dans `e2e/moderation.spec.ts` et `e2e/shop-suspension.spec.ts`, avec la mesure en
commentaire. Allonger ne masque rien : si l'action n'avait pas lieu, l'écran ne changerait
jamais.

**L'échec du parcours de paiement n'a PAS été compris.** Un titre de page qui ne correspond
pas, dans un parcours de T4, tombé une fois sur trois. Non diagnostiqué, non touché, signalé
tel quel.

## Où en est l'exécution de T6a, à la coupure du 2026-10-15

**Le plan est écrit** : `docs/superpowers/plans/2026-10-14-t6a-moderation-catalogue.md`,
cinq tâches. Exécution NATIVE. **Reprendre le plan à la tâche 5**, la dernière.

Branche `feat/catalogue-moderation`, partie de `main` à `bd20daf`. Cinq commits, plus
celui de cette passation :

| Commit | Contenu |
| --- | --- |
| `c61ca4f` | La spec |
| `160503d` | Tâche 1 : deux énumérations, `Product.systemTags`, la migration, le plan |
| `280d96e` | Tâche 2 : motifs, décision et courriel de retrait, tous purs |
| `8f4ce82` | Tâche 3 : le dépôt de modération |
| `e3f8aa1` | Tâche 4 : l'écran de modération |

**Un commit par tâche, et non le commit unique que demande `docs/conventions/git.md`.**
C'est une dérogation assumée : le ledger d'exécution vit sous `.superpowers/`, ignoré par
Git, donc il ne voyage pas d'une machine à l'autre. Seul un commit voyage. L'écrasement à
la fusion aplatit le tout.

**NE PAS toucher au fichier de migration** `20261014120000_product_moderation`, commentaire
compris : son `sha256` est enregistré dans `_prisma_migrations`, et le modifier fait diverger
la somme. Consigné dans `docs/pieges.md`.

### Ce que les tâches 2 à 4 ont livré

**Tâche 2**, dans `packages/domain` : `MODERATION_REASONS`, `validateModerationDecision`
levant `InvalidDecisionError`, et `buildRetirementMessage(titre, motif, locale)` avec repli
français. Aucun export depuis `browser.ts`, qui tirerait `node:net`. 24 fichiers, 200 tests,
couverture 100/100/100/100.

**Tâche 3**, dans `packages/db` : `listProductsToModerate`, `markProductReviewed`,
`retireProduct`, et la constante `ERROR_MODERATION_PRODUCT_NOT_FOUND`. `setProductStatus`
efface `REVIEWED` **par filtre** à la publication, jamais par remise à zéro. Treize tests
d'intégration annoncés par le plan, **douze écrits**, parce que le bloc de code du plan en
contient douze : le compte du plan était faux, pas la couverture. Toute la couche à 18
suites et 231 tests.

**Tâche 4**, dans `apps/admin` : `/moderation`, ses deux actions serveur, sa ligne cliente et
le lien de navigation. `lint` 15/15, `typecheck` 15/15, `build` 9/9. Vérifiée **avec une
vraie session d'administrateur**, et pas seulement par le 307 de la garde : 200, les lignes
rendues, le compteur juste, les cinq motifs dans le `select`, les vignettes servies.

### Trois décisions de ces tâches, qui engagent la suite

**La constante de la modération s'appelle `ERROR_MODERATION_PRODUCT_NOT_FOUND`**, pas
`ERROR_PRODUCT_NOT_FOUND` comme l'écrit le plan : ce nom est déjà pris par
`packages/db/src/repositories/product.repository.ts`, avec la valeur `PRODUCT_NOT_FOUND`, et
le baril refusait de compiler. Les deux refus restent distincts, et c'est volontaire :
`PRODUCT_NOT_FOUND` est une SOUS-CHAÎNE de `MODERATION_PRODUCT_NOT_FOUND`, donc réutiliser
l'ancienne aurait fait passer un test qui ne prouvait rien, les actions comparant par
`texte.includes(...)`.

**La vignette se demande en 320, pas en 200.** Le plan demande `derivativePath(chemin, 200)`,
largeur que le worker ne produit pas : `DERIVATIVE_WIDTHS` vaut `[320, 800, 1600]` et la route
de relais refuse le reste. En 200, toutes les vignettes auraient été cassées.

**Le motif de retrait n'a pas de valeur par défaut.** Le `select` du plan n'a pas de choix
vide, donc le premier motif, `COUNTERFEIT`, était sélectionné d'office : ouvrir le bloc de
retrait et confirmer sans rien choisir accusait de contrefaçon quelqu'un qu'on voulait
seulement rappeler à l'ordre, et aucune garde ne l'attrapait, le motif étant bien du
vocabulaire. L'écran porte donc un choix neutre obligatoire, refusé aussi côté serveur.

### Les deux consignes de pré-vol, tenues

**Les motifs dérivent de l'ÉNUMÉRATION**, `MODERATION_REASONS`, et le catalogue ne fournit
que les libellés. Une valeur ajoutée à `E_MODERATION_REASON` sans libellé s'affiche brute,
donc se voit, au lieu de disparaître en silence.

**L'écran dit combien il reste** à examiner, au-dessus de la liste. La mesure annoncée de 193
articles venait d'une autre machine ; celle-ci en comptait 55 publiés non tagués. Le chiffre
dépend de la base, la propriété ne dépend de rien.

### Trois pièges payés, à porter dans `docs/pieges.md` en tâche 5

**`packages/db/generated/` est ignoré par Git** (`.gitignore:20`). Tirer une branche qui
AJOUTE une énumération Prisma laisse donc un client généré qui ne la connaît pas. Le symptôme
nomme l'énumération absente, jamais la génération. Remède : `pnpm --filter @clemperl/db
build`, qui enchaîne `db:generate` et le `tsc`. `prisma generate` nu échoue faute de
`DATABASE_URL` ; le script `db:generate` en fournit une factice, et ne se connecte à aucune
base.

**Les tests d'intégration résolvent `@clemperl/db` par `dist/src/`**, le champ `exports` du
paquet, et non par la source. Une mutation reste donc sans effet tant que le build n'a pas
réussi. Mesuré : une mutation a échoué à bâtir sur un `TS6133`, et les douze tests sont passés
contre l'ANCIEN `dist`, faux négatif qui ressemble trait pour trait à « la mutation ne tue
rien ». Vérifier la mutation dans `dist/src/`, pas seulement dans la source, et noter que le
chemin est `dist/src/...` et non `dist/...`.

**`packages/i18n/messages/admin/fr.json` est indenté à DEUX espaces**, pas aux quatre du code.
Le réécrire avec l'indentation du code reformate quatre-vingt-treize lignes pour vingt-quatre
d'ajout réel.

### Ce que la preuve par mutation a dit, et ce qu'elle n'a pas dit

Retirer `suspendedAt: null` du filtre de la file tue « ne rend pas un produit d'une boutique
suspendue », et lui seul.

Remplacer le filtre de `REVIEWED` par une remise à zéro ne tue RIEN, et c'était annoncé :
`E_PRODUCT_TAG` n'a qu'une valeur, donc aucun test ne distingue aujourd'hui un filtre d'une
remise à zéro. Le filtre est écrit pour le jour où un second tag existera ; le test garde la
propriété sans la prouver. Dit plutôt qu'enjolivé.

### Ce que la tâche 5 doit faire

Le parcours navigateur se lance contre `pnpm docker:up`, la pile de DÉVELOPPEMENT, et surtout
pas `pnpm e2e:up` : la superposition de production allume le limiteur de débit de Better Auth
et la création de comptes prend des 429. Mesuré en T5.

Les identifiants d'administration de la pile de développement sont ceux des aides du
navigateur : `administration@clemperl.test` et `motdepasse123`.

## Où en est T6a, au 2026-10-14

**T5 est fusionnée**, PR #11 en écrasement, `main` à `bd20daf`.

**T6 a été DÉCOUPÉE en trois tranches**, parce que le mot recouvrait trois sous-systèmes qui
ne partagent ni modèle, ni écran, ni risque :

- **T6a, modérer le catalogue.** Cadrée, spec écrite, plan à écrire. C'est la suite.
- **T6b, gérer les comptes et les rôles.** `E_USER_ROLE` ne connaît que `CUSTOMER` et `ADMIN`,
  et seul l'amorçage crée un administrateur : personne n'en nomme un second depuis
  l'interface. La plus petite des trois.
- **T6c, surveiller les commandes et arbitrer.** La plus lourde : elle touche la machine à
  états de T3, bâtie sur la règle « seul le vendeur fait avancer ». Un arbitrage est une
  exception à cette règle, et il faudra décider si elle reste une règle avec une porte ou
  cesse d'en être une. *La tranche a été coupée depuis : voir « T6c est livrée » plus haut pour
  ce qui a été livré, et T6d pour l'arbitrage.*

### Reprendre T6a

Spec : `docs/superpowers/specs/2026-10-14-t6a-moderation-catalogue-design.md`, approuvée en
conversation, non encore relue en entier par l'utilisateur. Le plan est écrit depuis, et
l'exécution en est à la tâche 5 : voir plus haut, « Où en est l'exécution de T6a ».

### Les décisions de T6a, et ce qu'elles coûtent

**Le retrait est un AVERTISSEMENT.** Il dépublie et prévient, et le vendeur peut republier.
Aucun état nouveau : on écrit `status: DRAFT`, ce qu'une dépublication ordinaire écrit déjà.
Le coût assumé : un contenu illicite revient d'un clic, et le recours redevient la suspension
de toute la boutique, livrée en T5.

**Ce qui distingue un retrait d'une dépublication est le MOTIF, pas l'état.** Motif codé,
commentaire obligatoire quand il vaut « autre », et courriel dans la langue du vendeur, sur
la forme que T1b a écrite pour les refus de candidature. Réutiliser plutôt que réinventer :
la règle du commentaire obligatoire vit déjà dans `packages/domain`, éprouvée.

**Les tags système sont un tableau d'énumération sur `Product`**, vocabulaire FERMÉ, à la
manière de `Vendor.paymentMethods`. Un produit en porte zéro, un ou plusieurs. Le vocabulaire
démarre avec `REVIEWED` seul, et c'est voulu : un tag entre quand un écran en a besoin. Pas
d'étiquettes libres, deux administrateurs écriraient « a-verifier » et « à vérifier ».

**La file de modération, c'est « publiés sans `REVIEWED` », du plus récent au plus ancien.**
Elle se VIDE, ce qui est sa propriété importante : un administrateur sait qu'il a fini. Pas
de table de signalements, pas de bouton public.

**Republier retire le tag `REVIEWED`.** C'est la décision la moins évidente, et celle qui
donne son mordant à l'avertissement : sans elle, un vendeur republie un contenu retiré et ne
repasse devant personne. La règle vaut pour TOUTE republication, qu'un retrait l'ait précédée
ou non, parce que distinguer les deux demanderait de retenir qu'un retrait a eu lieu, donc le
journal que T6 a écarté. Elle couple `setProductStatus` à la modération, assumé.

### Ce que T6a ne fait pas

Aucun journal des actes : qui a retiré quoi n'est conservé nulle part, et le courriel parti
chez le vendeur en est la seule trace. Aucune modération du nom, de la description ou des
images d'une boutique, ni des collections : le levier y reste la suspension. Aucun compteur
de récidive, puisque rien n'est conservé.

### Le test instable des collections est corrigé, et il portait la mauvaise propriété

Le 2026-10-15, après qu'il a fait rougir la CI.

**Le code de production était CORRECT.** `renameCollection` et `setCollectionStatus` prennent
le même verrou, donc les deux écritures se sérialisent. Mais un verrou ne décide pas laquelle
passe en premier, et les deux ordres honorent la règle du produit :

- publication d'abord, le renommage lit `publishedAt` non nul et laisse le slug ;
- renommage d'abord, la collection est encore un brouillon, le slug suit le titre, puis la
  publication le fige.

**Le test exigeait que la publication gagne toujours**, ce que rien ne promet et que rien ne
peut garantir sans ordonner deux actions que le vendeur déclenche en parallèle. Son
commentaire affirmait « quel que soit l'ordre des deux écritures », soit exactement ce qu'il
ne vérifiait pas.

**Il éprouve désormais la garantie qui existe** : les deux ordres sont acceptés, puis la
collection publiée est renommée une seconde fois et son slug ne bouge plus alors que son
titre change. C'est cette propriété qui protège un lien déjà partagé.

Ce n'est pas un test rendu tolérant pour qu'il cesse de gêner : il est PLUS fort qu'avant.
L'ancien ne touchait jamais au gel après publication. Mutation faite : retirer le gel du slug
fait rougir le nouveau, et l'ancien ne l'aurait pas vu. Huit exécutions consécutives au vert,
là où il échouait environ une fois sur trois.

### Ce qui reste ouvert, hors T6a

**Le test instable de `collection.int-spec.ts:582`**, laissé ouvert sur décision. Sept
exécutions isolées, deux échecs. Le trancher demande de décider ce que `renameCollection`
doit garantir face à une publication concurrente : la publication gagne toujours, ou le
dernier arrivé gagne. Le code permet les deux, le test exige le premier, et son commentaire
affirme que l'ordre n'importe pas, ce qui est faux dans les deux cas.

**La suite navigateur contre les images de production.** Voir l'entrée dédiée de
`docs/pieges.md` : Better Auth y allume son limiteur de débit et la création de comptes prend
des 429. La CI ne le rencontre pas, elle lance `pnpm docker:up`. Aucune sortie de production
n'a donc jamais été exercée par une suite complète.

**Ce document grossit.** Il a servi deux fois le 2026-10-14, dont une pour trouver une somme
de contrôle, donc il est utile. Mais il approche de la taille où personne ne le lit en
entier, et les sections d'avant le 2026-10-09 gagneraient à être élaguées.

## T5 est livrée, au 2026-10-14

Un administrateur suspend une boutique, ses articles quittent le catalogue, et ses membres
gardent leur espace. Six tâches, toutes faites. Branche `feat/vendor-subscriptions`, son nom
datant du cadrage d'avant, celui des abonnements.

### Les décisions qui comptent, et pourquoi

**La suspension n'est PAS `deletedAt`, et les deux colonnes se ressemblent dangereusement.**
`deletedAt` est une boutique FERMÉE : elle ne revient pas, et ses membres perdent leur
espace, `readVendorForMember` la filtrant. `suspendedAt` est une boutique qui ne vend plus
POUR L'INSTANT : elle sort du catalogue, et ses membres continuent de travailler. Confondre
les deux ferait perdre son écran à quelqu'un qui doit encore expédier ce qu'il a vendu. Un
test tient cette distinction dans `shop-suspension.int-spec.ts`, et sa portance a été
prouvée par mutation : ajouter la condition à `readVendorForMember` fait rougir ce test seul.

**C'est la BOUTIQUE qui est suspendue, jamais la personne.** Un compte peut être membre de
plusieurs boutiques, et suspendre l'une ne touche pas les autres. Le libellé du bandeau le
dit comme cela : « votre boutique n'apparaît pas au catalogue », jamais « vous êtes
suspendu ».

**Ce que la suspension ne touche pas**, et que `shop-suspension.int-spec.ts` épingle :
les commandes restent lisibles des deux côtés, le vendeur peut les faire AVANCER et pas
seulement les regarder, et son espace reste ouvert. Le panier d'un acheteur garde sa ligne :
c'est la validation qui refuse, avec le même message qu'un article devenu indisponible, parce
que vider le panier à sa place lui ferait croire qu'il a renoncé.

**La condition vit à SIX endroits et s'écrit une fois** par lecture : `eligibleVariantWhere`,
`conditions()`, `listCatalogCurrencies`, `readPublishedProduct`, `readPublishedShop`. Le
décompte des devises a son propre SQL, et c'est celui que la revue de T2d avait trouvé
désaligné de la liste. Un seul test les éprouve toutes, chacune sur son assertion.

**Aucun montant, aucune devise, aucune échéance dans la plateforme.** Le prix d'un abonnement
dépend de qui déploie ClemPerl, donc il se négocie et s'encaisse dehors. La plateforme
n'offre qu'un levier : active, ou suspendue. C'est ce qui a fait abandonner le cadrage du
2026-10-12, celui des formules et des quotas.

**Le MVP part sans aucune notion de quota.** S'ils servent un jour, ils se poseront à côté de
cette colonne, sans la remplacer : un quota borne ce qu'on peut AJOUTER, une suspension coupe
ce qu'on peut VENDRE, et ce ne sont pas les mêmes leviers.

**Rétablir efface la trace de la suspension précédente.** Les deux colonnes repassent à nul
ensemble, et il n'existe aucun journal des mouvements. On sait qu'une boutique est suspendue,
depuis quand et par qui ; on ne sait pas combien de fois elle l'a été. Si cet historique
devient nécessaire, c'est une table à part, sur la forme de `vendor_decisions`.

**`User.name` est NULLABLE**, ce que le typage a révélé en écrivant l'écran. L'état d'une
ligne a donc trois formes et non deux, et la troisième arrive de deux façons réelles : le
compte qui a suspendu a été supprimé, et le `SetNull` a effacé le lien sans lever la
suspension ; ou ce compte existe sans nom.

**Un compte membre de plusieurs boutiques n'en voit qu'une** dans l'espace vendeur,
`readVendorForMember` rendant la première trouvée. Limite PRÉEXISTANTE, que T5 ne crée pas
mais rend un peu plus visible : suspendre l'une des deux boutiques d'un même membre affiche
le bandeau selon celle que la requête a choisie.

### Un panier détruit par une suspension, et c'est assumé

Décidé le 2026-10-14, après que deux revues l'ont soulevé.

**Ce qui se passe.** Un visiteur sans compte met au panier un article d'une boutique qu'on
suspend ensuite. Il se connecte : `mergeLocalCart` retire la ligne serveur puis la rajoute,
l'ajout est refusé par la condition de suspension, et `local-cart-sync.tsx` vide le panier
local sans condition. L'article ne revient PAS au rétablissement de la boutique.

**L'asymétrie, qui est la partie surprenante.** Un acheteur DÉJÀ connecté garde sa ligne :
`readCart` ne filtre aucune éligibilité, et c'est la validation qui refuse. La même
suspension produit donc deux résultats opposés selon qu'on était connecté ou non.

**Pourquoi c'est accepté.** Vider le panier local sans condition est ce qui empêche la
remontée de représenter les mêmes refus à chaque visite, message compris. Distinguer les
refus réversibles des définitifs demanderait de porter cette distinction jusque dans
`CART_REJECTION`, donc d'ouvrir le panier de T3 depuis T5.

**Ce qu'il en coûte si on se trompe.** Un acheteur perd silencieusement un article pour une
suspension de dix minutes. Le jour où cela se voit, la sortie est de ne pas vider les lignes
dont le refus est réversible, et elle n'a pas besoin de changer le modèle.

### Les décomptes, mesurés

| Couche | Résultat |
| --- | --- |
| `shop-suspension.int-spec.ts`, neuf | 12 tests |
| `payment-eligibility.int-spec.ts`, dont 2 neufs | 6 tests |
| Intégration, couche entière | 17 suites, 219 tests |
| `lint`, `typecheck`, `test` | 15/15 chacun |
| `build` | 9/9 |
| Parcours navigateur, `pnpm docker:up` | 30 passés, dont le parcours neuf |

### Ce que la vérification n'a PAS établi

**La suite navigateur n'a jamais tourné en entier contre les sorties de production.** Lancée
contre `docker-compose.e2e.yml`, elle tombe sur le limiteur de débit que Better Auth allume
en production, et la création de comptes prend des 429. Mesuré le 2026-10-14 : 17 passés,
8 en échec, 5 non exécutés. Ce n'est pas un défaut de T5, et la CI ne le rencontre pas
puisqu'elle lance `pnpm docker:up`. Entrée dédiée dans `docs/pieges.md`.

Ce que cela dit, et qui dépasse les tests : aucune sortie de production n'a jamais été
exercée par une suite complète sur ce dépôt.

## Où en est le cadrage de T5, au 2026-10-12

**T4 est fusionnée** (PR #9, en écrasement), et la PR #10 derrière elle, en rebase, qui
ferme cinq défauts trouvés en la relisant. `main` est à `cfffe6c`. Rien n'est en cours.

**T5 est en cadrage, et rien n'est écrit.** Ni spec, ni plan, ni code. Ce qui suit est tout
ce qui a été décidé, et c'est la seule trace : la discussion n'existe nulle part ailleurs.
Reprendre, c'est relancer l'idéation à partir de ces réponses, trancher les trois points
restés ouverts, puis écrire la spec.

### Où en est l'exécution de T5, au 2026-10-13

**La spec et le plan sont écrits et commités.** Spec :
`docs/superpowers/specs/2026-10-13-t5-suspension-boutique-design.md`. Plan :
`docs/superpowers/plans/2026-10-13-t5-suspension-boutique.md`, six tâches. Reprendre, c'est
reprendre le plan à la tâche 2.

**La tâche 1 est faite** : `Vendor.suspendedAt` et `Vendor.suspendedById` avec la relation
`SuspendedShops` vers `User` en `SetNull`, et la migration `20261012234243_shop_suspension`,
appliquée. Les deux colonnes naissent nulles, donc toutes les boutiques existantes sont
actives. `prisma validate`, `migrate status` et `typecheck` passent.

**Les tâches 2 à 6 restent** : la condition dans le prédicat d'éligibilité et le test de ce
que la suspension ne touche PAS, les deux fonctions de dépôt, l'écran d'administration, le
bandeau du vendeur, puis le bout en bout et les documents.

**Le cadrage a changé plusieurs fois pendant l'idéation**, et c'est la version ci-dessous qui
fait foi, pas celle du 2026-10-12 : pas de quotas dans le MVP, aucun prix dans la plateforme,
aucune échéance, on active et on désactive.

### La somme de contrôle de la migration des paiements, sur UNE machine seulement

**Mesuré le 2026-10-14 sur la machine de développement principale : elle n'est PAS
touchée.** Les dix sommes enregistrées y correspondent aux fichiers, `prisma migrate status`
répond « Database schema is up to date! », et le service `migrate` du compose sort en 0.
Vérifié aussi que `_prisma_migrations.checksum` est bien un `sha256` du fichier de migration,
sur les neuf migrations d'alors, ce qui n'était jusqu'ici qu'affirmé.

L'écart n'existe donc que là où la migration a été appliquée AVANT la réécriture de son
commentaire. Le titre précédent disait « la machine d'origine », ce qui a envoyé chercher sur
la mauvaise. Avant de jouer le remède, mesurer : si `migrate status` dit que le schéma est à
jour, il n'y a rien à corriger sur cette machine-là.

Elle a mordu : `prisma migrate dev` refuse de tourner sur la machine touchée et propose une
réinitialisation. La migration des paiements a vu un commentaire réécrit après application,
donc son sha256 a bougé et `_prisma_migrations` garde l'ancien. La tâche 1 a contourné par
`migrate diff`, qui est en lecture seule, et a vérifié que la base correspond bien aux
migrations commitées : l'écart est la seule somme.

Le remède, une ligne, à passer sur la machine qui porte cette base :

    docker exec clemperl_dev_postgres psql -U clemperl -d clemperl -c \
      "UPDATE _prisma_migrations \
         SET checksum = '73a867cd4b29f8eaded37b2ae0db1d9e30cf8b347923b0d682659bda22ca56ac' \
       WHERE migration_name = '20261010233701_payments' \
         AND checksum = '7bd87e2f93c0b2b3c7a79f447836dd19f80e465e6fc4c1d8257fc6bc744b6ea5';"

Il doit répondre `UPDATE 1`. `UPDATE 0` signifie que la somme stockée n'est plus celle-là,
ou que le nom est mal recopié. Une base NEUVE n'a pas le problème : elle applique la
migration depuis le fichier courant et enregistre la bonne somme.

### Ce qui est décidé

**À quoi sert un abonnement.** Deux choses à la fois : le droit de vendre, et des quotas de
catalogue.

**Une formule gratuite bornée existe.** Un vendeur validé démarre dessus et vend dès le
premier jour. Il paie quand il grandit. Conséquence voulue : les boutiques déjà ouvertes
atterrissent sur la gratuite sans que rien ne casse.

**Les quotas portent sur trois axes** : le nombre de produits, le nombre d'images par
produit, le nombre de collections. Pas sur le nombre de membres de la boutique, écarté
explicitement.

**Un quota atteint bloque la CRÉATION, et rien d'autre.** Une boutique à deux cents produits
qui se retrouve sur une formule qui en permet dix les garde tous, visibles et vendables, et
ne peut plus en ajouter. Rien ne se dépublie, rien ne disparaît, un vendeur ne se réveille
jamais amputé. Le prix assumé de ce choix : le quota ne ramène personne à la formule
supérieure une fois dépassé.

**Le paiement d'une formule se fait HORS LIGNE**, et un administrateur le pointe, exactement
comme un vendeur pointe un paiement hors ligne en T4. Conséquence importante pour le
chiffrage : **aucun adaptateur de paiement n'est à construire**, et le port de T4 n'est pas
touché. Il est de toute façon taillé pour une commande ponctuelle (`IPaymentStart` porte
`orderId`, `reference`, `amount`, et `start()` rend une redirection unique), sans aucune
notion de mandat ni de prélèvement récurrent.

**La fin d'un abonnement payant fait retomber sur la gratuite, et un OPÉRATEUR le fait.**
Décision structurante, et plus large que la question posée : **aucune transition
automatique**. Pas d'ordonnanceur, pas de tâche planifiée, pas d'horloge qui déclasse
personne. L'administration voit ce qui est échu et agit. C'est l'esprit de T4 étendu au
cycle de vie entier.

### Ce qui en découle, et qui n'a pas été dit explicitement

« Quitter le catalogue » n'arrive donc JAMAIS par non-paiement, puisque la gratuite est le
plancher de tout le monde et qu'elle laisse au catalogue. Ce serait une suspension décidée
par un administrateur. Elle n'est pas prévue dans T5, sauf décision contraire.

### Les trois points restés ouverts

Ils changent le modèle de données, donc ils se tranchent avant la spec.

**La devise des formules.** Chaque boutique a la sienne, figée dès son premier produit, euro
ou franc CFA. Une formule à 15 000 vaut quinze mille francs ou quinze mille euros selon la
boutique. Deux sorties : un tarif dans une devise unique de plateforme, ou un prix par
devise sur chaque formule.

**La période.** Mensuelle, annuelle, ou les deux au choix du vendeur.

**Le nombre de formules, et où elles vivent.** Combien, et leurs quotas et prix en base,
modifiables par un administrateur, ou en dur dans le code comme une donnée de référence.

### Ce qu'il faudra regarder en écrivant la spec

`Vendor` n'a aujourd'hui AUCUNE notion de formule ou de plan : table rase, rien à migrer
dans le modèle existant.

La condition d'éligibilité du catalogue vit en trois endroits qui disent déjà la même chose,
`eligibleVariantWhere` dans `cart.repository.ts`, la liste de `catalog.repository.ts`, et
`readPublishedProduct`. T4 y a ajouté `paymentMethods: { isEmpty: false }`. Si T5 doit un
jour sortir une boutique du catalogue, c'est là que ça se passe, et aux trois endroits à la
fois.

## Où en est le travail, au 2026-10-11

**T4, paiement, est complète : les dix tâches.** La branche est `feat/payments`.

Un vendeur coche les paiements que sa boutique accepte. Un acheteur en choisit un par boutique
à la validation, et la commande le porte figé, avec un état de paiement à elle, séparé de
celui de l'expédition. Hors ligne, le vendeur pointe lui-même l'encaissement. En ligne,
l'acheteur est redirigé chez un fournisseur, et un webhook signé règle la commande ; un
simulateur de développement joue ce fournisseur. Chaque tentative laisse une ligne dans la
trace, y compris l'échec, qui n'est pas une fin : l'acheteur réessaie.

La spec est `docs/superpowers/specs/2026-10-11-t4-paiement-design.md`, le plan
`docs/superpowers/plans/2026-10-11-t4-paiement.md`.

### Ce qui a été vérifié, et ce que ça vaut

Relevé le 2026-10-11, sans cache, sur la branche entière :

- `lint` : 15 tâches sur 15, plus `eslint e2e playwright.config.ts`, sans reproche.
- `typecheck` : 15 tâches sur 15, plus `tsc --noEmit -p tsconfig.e2e.json`, sans erreur.
- `build` : 9 tâches sur 9.
- Tests unitaires, 464 au total : `domain` 191, `api` 154 (15 suites Jest), `core` 39, `ui` 32,
  `storefront` 29, `db` 8, `auth` 7, `i18n` 4. `admin` et `vendor` n'en ont aucun.
- Intégration : **204 tests en 16 suites, tous verts, dans le conteneur de l'API**, comme la CI
  les lance. Depuis l'hôte, `pnpm --filter @clemperl/api test:integration` en passe 185 sur 13
  suites et en échoue 19 sur 3 (`product-image-worker`, `media-route`, `document-storage`) :
  elles ont besoin du réseau Docker : `STORAGE_URL` ne parvient pas à la commande lancée depuis
  l'hôte, ou un nom de conteneur ne s'y résout pas (`getaddrinfo ENOTFOUND storefront`). Ce n'est pas
  une régression, mais la commande de l'hôte n'est pas verte.
- API, couche supertest (`jest.config.e2e.ts`) : 3 tests, verts.
- Bout en bout : **29 tests en 11 fichiers, tous verts, en série (`--workers=1`)**, contre la
  pile de développement que la CI exerce. À deux workers, deux tests ont échoué, chacun sur un
  délai de cinq secondes (`collection.spec.ts`, le renommage ; `vendor-product-images.spec.ts`, le
  refus de publier sans photo), la charge étant à plus de 8 sur quatre cœurs. Rejoués en série,
  ils passent. La charge expliquait ces deux échecs, pas un défaut du code.

**Le banc de production ne tient toujours pas la suite entière, et ce n'est pas T4.**
`pnpm e2e:up` puis `pnpm test:e2e` : 16 verts, 8 rouges, 5 non joués. Les rouges butent sur la
connexion, qui répond `429` : Better Auth limite `/sign-in/email` à trois requêtes par fenêtre
et le banc de production en crée davantage qu'aucun humain (mesuré : `401 401 401 429 429 429`
sur six essais d'affilée). C'est la limitation déjà consignée dans « Ce qui reste ouvert ».
Les deux parcours de paiement y passent, chacun rejoué seul : 16 s pour le parcours hors
ligne, 15 s pour le parcours en ligne. Le build de production exerce donc bien le CORS, le
cookie envoyé à l'API, `NEXT_PUBLIC_API_URL` lue par le serveur puis passée au bouton, et le
webhook signé.

**Dans la surcharge de production, le `NODE_ENV` du conteneur de l'API vaut `development`.** L'image fixe
`ENV NODE_ENV=production`, mais `env_file: ../.env` porte `NODE_ENV=development`, et le fichier
l'emporte : `docker exec clemperl_dev_api printenv NODE_ENV` rend `development`, avec
`PAYMENT_SIMULATOR=1`. Le démarrage n'échoue donc pas, et la garde qui refuse le simulateur en
production n'est exercée par aucune suite qui démarre l'API : seul son test unitaire la
couvre.

Les parcours e2e lisent l'état du paiement dans un PARAGRAPHE, texte entier. Côté acheteur, le
mot « Payé » se lit deux fois dès qu'une tentative existe, dans le paragraphe et dans la ligne de
la trace, et « Reçu » est une sous-chaîne de « Reçue », le statut de la commande ; côté vendeur,
« Reçu » est aussi une sous-chaîne du bouton « Paiement reçu ». Chaque ligne de la trace de
l'acheteur porte `data-testid="tentative"`.

### Les décisions prises en route, et ce qu'elles coûtent si elles sont fausses

**Rien n'empêche d'expédier un impayé, par décision du propriétaire du dépôt.** L'écran
prévient, et les boutons d'avancement restent ouverts quel que soit l'état du paiement : le
vendeur connaît peut-être son client, ou a reçu les fonds par un chemin que la plateforme
ignore. ClemPerl orchestre et trace, elle ne détient jamais les fonds d'un tiers. Le coût est
nommé : la plateforme ne pourra pas dire qu'elle avait empêché, seulement qu'elle avait prévenu.
Le parcours hors ligne épingle que « Accepter » reste actif sur une commande impayée.

**Une seule chose est fermée : un paiement en ligne ne se pointe pas à la main.** Là, seul le
fournisseur dit ce qui s'est passé, et un pointage manuel rendrait la trace fausse à l'endroit
précis où elle sert de preuve. L'écran n'offre pas le bouton, et l'API refuse même si l'écran
dérive : le registre des adapters décide ce qui est en ligne, il n'y a aucun booléen à tenir à
jour à côté. Le parcours en ligne épingle l'absence du bouton.

**Ce qui est EN LIGNE se déclare à un seul endroit, `packages/domain`.** Deux listes y
partitionnent l'enum des méthodes : celles qui ne redirigent jamais, et celles qui ont besoin
d'un fournisseur. `onlinePaymentMethods` répond à partir de `PAYMENT_SIMULATOR`, le registre
de l'API bâtit ses adapters sur la même liste, et les trois écrans du paiement l'interrogent
depuis leurs composants serveur. Aucun front ne recopie de liste, et `registry.spec.ts`
compare le registre au domaine dans les deux environnements : ils ne peuvent plus diverger
sans qu'un test tombe. Le coût est nommé : l'API et les fronts doivent recevoir le MÊME
`PAYMENT_SIMULATOR`, ce que le compose garantit par un `env_file` commun. S'ils le recevaient
différent, les écrans n'offriraient pas une redirection que l'API sait servir, ce qui est
l'échec le moins cher des deux.

**Une boutique qui accepte une méthode que plus aucun adapter ne sert la GARDE.** Le
formulaire du vendeur continue de la montrer, cochée : la faire disparaître la retirerait de
la base au premier enregistrement, sans que personne ne l'ait décidé. Le vendeur la décoche
s'il le veut, et elle ne revient pas. Partout ailleurs elle se lit comme une méthode hors
ligne, ce que l'API en fait déjà faute d'adapter : l'acheteur voit les coordonnées de la
boutique au lieu d'un bouton « Payer » qui finirait en 409, et le vendeur voit « Paiement
reçu », que `settleOffline` accepte. Le coût est une phrase d'explication inexacte côté
acheteur, « Réglez en ligne », sur une méthode réglée hors ligne.

**Une boutique sans méthode sort du catalogue.** Même prédicat que la devise, écrit une fois :
la liste, le décompte des devises, la fiche produit, la vitrine et l'éligibilité du panier
l'appliquent ensemble. Une boutique sans méthode n'a donc ni vitrine, ni page de collection :
elles répondent 404. La phrase qui le dit, sur l'écran du vendeur, est PERMANENTE et non une
alerte à la dernière case décochée, qui arriverait après la décision qu'elle devait éclairer ;
le parcours hors ligne l'épingle visible avant de cocher, et toujours là après.

**L'API est désormais joignable depuis un navigateur.** Trois surfaces neuves le même jour :
CORS avec des origines NOMMÉES et `credentials`, parce qu'un joker est incompatible avec l'envoi
d'un cookie ; `Origin` vérifié sur les écritures ; et un webhook sans session, dont la preuve
est sa signature, calculée sur les octets reçus, ce qui exige `{ rawBody: true }` à la création
de l'application. C'est le risque principal de la tranche, et la raison pour laquelle le
webhook ne fait rien avant d'avoir vérifié la signature.

**L'adapter simulé prouve la FORME, pas l'intégration.** Il passe par son propre webhook plutôt
que par un raccourci, donc la signature, la normalisation et l'idempotence sont exercées. Mais
un vrai fournisseur apportera ses propres codes d'état, ses rejeux, ses délais et son format
de signature : le premier branchement réel écrira un second adapter, et le port est fait pour
cela. Rien dans cette tranche ne dit que le port suffira tel quel.

**Le simulateur refuse de démarrer en production, et la garde a une limite.** `readPaymentsEnv`
lève, en nommant `PAYMENT_SIMULATOR`, quand il est allumé alors que `NODE_ENV` vaut
`production`. Mais `.env.example` livre `NODE_ENV=development`, le simulateur allumé, un secret
et une clé publics : un déploiement qui expédierait ce fichier tel quel passerait la garde. Le
simulateur règle une commande sans aucun paiement, sans demander ni session, ni origine, ni
signature, et la référence est remise à l'acheteur dans sa propre URL de redirection. La vérité
plus large est que `.env.example` est un gabarit de développement et non une configuration de
production, et cela vaut aussi pour le secret d'authentification, la clé de payload et le mot de
passe de la base. Sa première ligne le dit.

**Le temps réel est une interrogation, et T7 la remplacera.** Un composant relit la page de
commande toutes les cinq secondes, soixante fois au plus, et seulement tant qu'une tentative
EN LIGNE n'a pas de réponse. T7 passera à Socket.IO, une fois, pour les commandes, la
messagerie et les notifications ensemble : ne pas y brancher un autre mécanisme d'ici là.

**Le pointage hors ligne n'a aucune preuve.** La plateforme ne détient pas les fonds et ne
peut rien vérifier. La trace dit qui a pointé et quand, ce qui est tout ce qu'elle peut dire
honnêtement ; côté acheteur, la lecture ne porte jamais le nom de celui qui a pointé, un test
l'épingle.

**Et il se pointe sur une commande ANNULÉE, là où le paiement en ligne est refusé.**
`readOrderToPay` refuse une commande annulée, `settleOffline` ne la regarde pas : le vendeur
peut donc cocher « Paiement reçu » après l'annulation, et l'acheteur lit alors « Annulée »
au-dessus de « Payé ». C'est conforme à la spec, et défendable, puisque l'argent a pu changer
de mains avant l'annulation. L'asymétrie est nommée ici parce qu'aucun autre document ne la
nommait.

**Un panier à deux boutiques payées en ligne demande deux redirections.** Conséquence directe
d'une méthode par boutique, plutôt que d'une méthode unique que deux boutiques sans point
commun rendraient impossible à choisir.

### Trois suites existantes réparées

Une boutique n'accepte aucune méthode à sa naissance, donc elle est hors du catalogue tant
qu'on n'en a pas coché une. Trois suites créaient une boutique et attendaient de la voir :

- `order.spec.ts` validait un panier sans choisir de méthode, et sa boutique n'en avait aucune :
  ses produits n'étaient plus éligibles du tout. Les deux tests cochent maintenant « Paiement à
  la livraison » et choisissent ce bouton radio à la validation.
- `catalog.spec.ts` : le visiteur ne voyait plus le produit, ni la vitrine.
- `collection.spec.ts` : les trois tests visitent la vitrine ou la page publique d'une
  collection, qui répondent 404 sans méthode.

Les deux aides sont dans `e2e/helpers/accounts.ts` : `acceptPaymentMethods`, qui attend la
confirmation de l'ACTION puis recharge pour prouver que la base porte le choix, et
`publishProduct`, qui existait en deux exemplaires et en aurait eu trois.

### Ce que T4 laisse ouvert

Les revues ont relevé cinquante-trois constats mineurs. Ceux qui bloquaient sont corrigés ;
les autres partent ici avec leur raison, parce qu'une liste qui vit dans un espace de travail
jetable n'existe pas.

**Une action vous attend, et elle ne concerne que la machine de développement d'origine.**
La ligne de `_prisma_migrations` de cette base garde l'ancienne somme de contrôle de la
migration des paiements, dont un commentaire a été réécrit après application. Rien ne casse,
c'est mesuré : `migrate deploy` sort en 0 et `migrate status` répond « up to date ». Seul un
futur `migrate dev` sur CETTE machine s'en plaindra. L'entrée de `docs/pieges.md` sur le
sha256 porte la commande gardée et la façon de l'exécuter.

**Un import à resserrer, qui est à un mot-clé d'une panne obscure.**
`apps/vendor/src/app/shop/shop-form.tsx` importe `TPaymentMethod` depuis `@clemperl/domain`
et non `@clemperl/domain/browser`. C'est un `import type`, donc effacé à la compilation et
sans danger aujourd'hui ; si quelqu'un retire le mot `type`, l'assemblage Turbopack échoue
sur `node:net` avec une erreur qui ne nomme aucun maillon. Réexporter le type depuis
`browser.ts` ferme le risque.

**Le prédicat d'éligibilité est écrit à la main en cinq endroits.** La prose de la spec dit
« une seule vérité » et son propre tableau en prescrit cinq copies ; `currency` était déjà
recopiée ainsi. Le filet existe et il est réel : `payment-eligibility.int-spec.ts` vérifie
les cinq lectures dans un seul test, décompte des devises compris, et chaque retrait de
condition le fait échouer sur sa propre assertion. Un fragment partagé serait plus propre.

**Du confort d'écran, visible et non trompeur.** Les boutons radio de la validation n'ont pas
`required`, donc un oubli coûte un aller-retour serveur. Après le départ vers le fournisseur
le bouton reste désactivé : si un navigateur restaure la page depuis son cache arrière, un
acheteur qui abandonne trouverait un bouton mort, ce qui demande un navigateur pour être
tranché. Une tentative morte affiche « En attente » à côté d'une commande réglée. Les dates
suivent le fuseau du serveur. Un seul libellé couvre tous les refus de pointage sauf celui du
collègue plus rapide. Et la ligne de liste anglaise porte l'espacement français.

**Des aides de test à durcir.** Le sondage de `raceBehindLock` compte les attentes de toute la
base et non les seules sessions bloquées par son détenteur ; son `isLocked` ne se résout
jamais si le SQL du détenteur échoue, donc le test pend jusqu'au délai de Jest au lieu de
montrer l'erreur ; et sur une erreur de sondage les appels ne sont pas attendus. Le spec du
chiffrement redéclare les longueurs au lieu de lire celles du module. `PAYMENT_TRACE` trie
par date sans départage par identifiant, donc deux tentatives de la même milliseconde ont un
ordre instable.

**Deux restes de la source unique.** `isOnline` dans le registre n'a plus d'autre lecteur que
son propre test, et `vendor.repository.ts` garde une copie locale de `TPaymentMethod` que
`packages/domain` exporte désormais.

**Le premier test des trois fronts tourne sans configuration vitest**, sur les défauts. Il en
faudra une le jour où un test aura besoin d'un DOM.

### Pièges payés pendant T4

Cinq entrées de `docs/pieges.md` sont nées de cette tranche : le sha256 d'une migration
appliquée que décale la moindre retouche de commentaire, `packages/db/dist` que Jest importe
et que Git ignore, le motif `*.spec.ts` qui ne reconnaît pas `*.int-spec.ts`, le serveur de
développement de Next qui sert l'ancienne page serveur, et `raceBehindLock` qui exige quatre
connexions au pool. Une seule y était déjà et s'est reposée : le filtrage des variables
d'environnement par Turborepo, qui exige que chaque variable nouvelle entre dans `globalEnv`.

L'entrée sur le sha256 **semble contredire** celle de T1b sur les tables au pluriel, qui
annonce un `migrate deploy` en échec là où T4 l'a mesuré silencieux, et prescrit un `down -v`
qui détruit les volumes.

Personne n'a tranché, et il n'est pas même établi que les deux décrivent le même geste : le
commit de T1b est un écrasement qui a supprimé deux migrations et en a créé une sous un autre
nom, là où T4 a édité le commentaire d'une migration déjà appliquée. Les deux entrées se
citent désormais l'une l'autre et disent comment reconnaître sa situation par l'observation,
ce qui suffit pour ne pas détruire une base par erreur.

## Où en est le travail, au 2026-10-09

**T3, panier et commande, est complète : les huit tâches.** La branche est
`feat/cart-and-orders`.

Un visiteur sans compte remplit un panier que son navigateur garde, le retrouve à la
connexion, valide avec son adresse et un mot par boutique, et le vendeur fait avancer la
commande jusqu'à l'expédition. Le `mailto:` qui tenait lieu d'achat depuis T2d a disparu,
ainsi que ses trois libellés de traduction.

**Deux revues par contexte neuf ont tourné sur les tâches 1 à 4**, avant d'écrire les
écrans. Huit constats corrigés, sept laissés ouverts et consignés plus bas. La seconde
revue a trouvé que deux des corrections de la première en avaient cassé d'autres : valider
la quantité APRÈS avoir retiré la ligne serveur détruisait une ligne légitime, et la garde
n'existait que sur un des deux chemins d'écriture.

La spec est `docs/superpowers/specs/2026-10-09-t3-panier-commande-design.md`, le plan
`docs/superpowers/plans/2026-10-09-t3-panier-commande.md`. Le plan a été corrigé dix fois
pendant l'exécution, chaque correction venant d'un défaut trouvé à l'usage : il est à jour,
et les tâches 5 à 8 s'y lisent telles qu'elles doivent être faites.

### Ce qui existe

**Tâche 1.** Les quatre modèles `Cart`, `CartItem`, `Order`, `OrderItem`, l'enum
`E_ORDER_STATUS`, et la migration `20261009120000_cart_and_orders`, appliquée. Les
transitions de commande vivent en donnée dans `order-transitions.constant.ts`, avec
`canAdvanceOrder`, `advanceOrder` et `allowedOrderActions`.

**Tâche 2.** Les règles pures : `boundQuantity`, `variantLabel`, `groupByShop`, `sumLines`,
et `checkoutSchema`. Couverture du domaine à 100 % sur les quatre axes, 177 tests.

**Tâche 3.** `cart.repository.ts` : lire, ajouter, changer la quantité, retirer, remonter un
panier local. 19 tests d'intégration.

**Tâche 4.** `order.repository.ts` : valider un panier en commandes, une par boutique, dans
une transaction verrouillée ; lire et lister côté acheteur et côté vendeur ; faire avancer.
13 tests d'intégration.

Couche d'intégration complète : 165 tests, verte.
`lint` et `typecheck` à 15/15.

### Ce que la spec ne promet PAS, et que la page doit dire quand même

Le critère 1 dit qu'un visiteur sans compte « retrouve » son panier **après connexion**.
Voir le contenu avant d'être connecté n'en fait pas partie, et le nommer demanderait de
résoudre chaque identifiant côté serveur.

Mais afficher « Votre panier est vide » à quelqu'un qui vient d'y mettre un article est
faux. `LocalCartNotice` annonce donc un NOMBRE, lu dans le navigateur, et renvoie vers la
connexion. Les deux parcours e2e visent ce compte, jamais les titres : un test qui
chercherait le nom de l'article décrirait une promesse que personne n'a faite.

**Les deux manques du plan sont corrigés.** `readPublishedProduct` rend l'identifiant des
variantes, sans quoi la fiche sait afficher un prix mais pas désigner ce qu'elle vend. Et
elle applique désormais la MÊME éligibilité que la liste et que `eligibleVariantWhere` :
publié, boutique ouverte avec une devise, au moins une image prête. Sans cet alignement la
fiche proposerait un achat que le panier refuse, et l'acheteur lirait un refus sans cause
visible. Un test d'intégration épingle le nouveau comportement.

### Les décisions prises en route, et ce qu'elles coûtent si elles sont fausses

Elles vivaient dans un journal sous `.superpowers/`, que Git ignore. Les voici.

**`browser.ts` n'exporte pas les transitions de commande.** Ce fichier est le point d'entrée
sans dépendance serveur. `order-transitions.utils.ts` importe les erreurs du domaine, donc
`@clemperl/core`, donc nodemailer, donc `node:net`. L'exporter aurait fait échouer
l'assemblage Turbopack du premier composant client, en tâche 7, avec une erreur ne nommant
aucun maillon. Vérifié : l'écran vendeur qui construit les boutons est un composant SERVEUR.
Si un composant client en a besoin un jour, il exportera le fichier de constantes, qui
n'importe rien.

**`country` est mis en majuscules dans `checkoutSchema`**, comme
`application-submission.schema.ts` le fait déjà pour le même champ. Sans cela « be » et
« BE » s'enregistrent comme deux valeurs, et tout regroupement par pays se scinde en
silence.

**La borne de quantité reste une règle d'appelant.** `mergeLocalCart` ne borne pas lui-même :
`packages/db` ne peut pas importer `packages/domain`, qui dépend déjà de lui. C'est la
tâche 6 qui applique `boundQuantity`, et c'est écrit dans son code.

**`addCartItem` rejoue une fois sur collision d'unicité.** Deux ajouts simultanés sur un
panier inexistant tentent tous deux sa création, et le perdant recevait un `P2002` brut
jusqu'à l'écran. Un double-clic suffit à le produire : mesuré, 1 échec sur 5 avant la
reprise, 6 sur 6 au vert après.

**`mergeLocalCart` ne mappe que les deux erreurs qu'il connaît et laisse remonter le reste.**
Avant, une panne de base était annoncée à l'acheteur comme « cet article n'est plus
disponible », ce qui est faux et non actionnable. Désormais l'appelant garde le panier local
intact et la remontée se retentera.

**`placeOrders` refuse une ligne de panier sans libellé fourni** (`ERROR_LINE_MISSING`), au
lieu de figer une chaîne vide. Le figeage est définitif : une commande qui perd sa
déclinaison ne peut plus jamais dire ce qui a été acheté. Le refus porte sur l'ABSENCE de
l'entrée, jamais sur un libellé vide, qui est légitime pour un produit sans axe.

**Le contrôle du total passe AVANT celui des libellés**, et cet ordre compte. Le cas réel
d'une ligne manquante est un panier qui a grossi dans un autre onglet, lequel a forcément un
autre total : l'acheteur doit lire « le total a changé », qui est vrai et actionnable.

**`newReference` n'a aucune reprise sur collision.** `CMD-<année>-<six>` sur un alphabet de
32 caractères donne environ un milliard de tirages. Une collision lève un `P2002` et fait
échouer la validation. Accepté : une boucle de reprise est du code non testé sur le chemin
de l'argent, pour un événement négligeable à ce volume.

**Le panier d'un visiteur ne suit pas d'un appareil à l'autre.** Il vit dans son navigateur
et se perd si celui-ci est nettoyé. C'est le prix de n'avoir aucune table pour qui n'a pas de
compte, ni panier orphelin à balayer.

**Aucun stock, donc aucune réservation.** Deux acheteurs peuvent commander le dernier
exemplaire : les deux commandes existent, et c'est le vendeur qui en annule une.

### Sept constats de revue laissés ouverts sur T3, et pourquoi

Deux revues par contexte neuf ont tourné le 2026-10-10. Huit constats ont été corrigés,
sept sont restés ouverts par décision de l'utilisateur.

**La raison tient à ce qu'il n'y a encore NI produit NI acheteur réel**, et non à l'absence
d'écrans : ceux-ci sont livrés par cette même tranche, donc les chemins décrits ci-dessous
sont désormais atteignables par un parcours ordinaire. Les trois premiers méritent d'être
repris avant d'ouvrir la boutique à de vrais acheteurs.

**Le `SELECT ... FOR UPDATE` de `placeOrders` ne couvre que la ligne `carts`, pas
`cart_items`.** PostgreSQL ne prend qu'un verrou `KEY SHARE` sur le parent, donc un
`UPDATE cart_items SET quantity = ...` concurrent passe librement pendant la fenêtre de
validation. La commande part avec l'ancienne quantité et le `cart.delete` emporte la
nouvelle : l'acheteur est livré d'un article au lieu de trois, sans erreur nulle part. Ce
n'est pas un scénario d'attaque, deux onglets d'un même acheteur suffisent.

**`orders.total_amount` est un `int4` que rien ne borne.** `MAX_PRICE_AMOUNT` vaut
2 147 483 647 et `MAX_CART_QUANTITY` vaut 100 : leur produit dépasse la colonne. Un
article à 30 millions d'unités mineures en franc CFA, quantité 100, donne trois
milliards. La comparaison avec `expectedTotal` passe, puis PostgreSQL rejette, et le
panier devient invalidable sans message actionnable. Le plafond par unité a été raisonné,
le total non.

**L'ordre des lignes est arbitraire.** `orderBy: { id: "asc" }` sur des `cuid(2)`, qui ont
abandonné la monotonie par conception. Ni `CartItem` ni `OrderItem` ne porte de `createdAt`
ou de `position`, donc le corriger demande une migration. `placeOrders` lit d'ailleurs
`cart.items` sans aucun `orderBy`, ce qui rend l'ordre d'écriture d'une commande figée
dépendant du plan PostgreSQL.

**Quatre constats plus légers :** `order_items` indexe `variant_id` mais pas `order_id`,
qui est le chemin chaud ; `cart_items.variant_id` n'a pas d'index utilisable pour sa
cascade ; `newReference` n'a aucune reprise sur collision, contrairement à `addCartItem` ;
et `placeOrders` fait un N+1 dans la transaction, dont la correction donnerait au passage
le nom de l'article devenu inéligible, que `ERROR_ITEM_INELIGIBLE` ne dit pas.

### Deux pièges payés pendant T3, à porter dans `docs/pieges.md`

**`expect(...).rejects.toThrow(CONST)` compare par SOUS-CHAÎNE.** Le message d'une erreur de
validation Prisma cite la ligne de code fautive, laquelle contient le NOM de la constante.
L'assertion passe donc pour la mauvaise raison. Mesuré : la condition de devise retirée du
prédicat d'éligibilité, le test « boutique sans devise » restait VERT. Le remède est
`rejects.toMatchObject({ message: CONST })`, qui compare par égalité. Toutes les assertions
de refus de T3 l'emploient.

**Un `upsert` sur une colonne unique n'est pas atomique entre deux transactions.** Deux
appels concurrents tentent tous deux la création et le perdant reçoit un `P2002`. L'erreur
ne ressemble pas à une course et remonte telle quelle jusqu'à l'écran.

**Il n'y a AUCUNE configuration Prettier dans ce dépôt.** L'indentation à 4 espaces est tenue
à la main. Lancer `prettier` applique son défaut de 2 espaces : vérifié, à 4 espaces il
désapprouve déjà 2 fichiers existants sur 3, donc le lancer reformaterait du code écrit. Ne
pas le lancer.

### La suite e2e n'est pas verte d'un bloc sur cette machine

Mesuré le 2026-10-10 : quatre échecs sur vingt-trois à deux workers, charge à 10,6 sur
quatre cœurs. Rejoués en série, six des sept repassent. Le septième était un vrai défaut de
`catalog.spec.ts`, corrigé : il cherchait le titre de l'article dans le panier d'un visiteur
ANONYME, qui n'affiche qu'un compte.

La leçon tient à la séparation : la charge expliquait trois échecs sur quatre, pas le
quatrième, et les distinguer demandait de rejouer plutôt que de supposer. La CI, sur un
runner dédié, est le banc qui tranche.

### Un test instable, hors T3, à traiter

`apps/api/test/collection.int-spec.ts:582`, « ne change jamais le slug d'une collection qui
vient d'être publiée ». Il échoue environ une fois sur trois dans la couche complète, et
jamais lancé seul. Code de T2e, déjà fusionné, non touché par T3.

Le test épingle UNE issue d'une course réelle entre un renommage et une publication. Si le
renommage gagne, le slug devient le nouveau puis se fige, ce qui est une séquence légitime ;
le test exige que la publication gagne. C'est donc un test instable, et peut-être une course
de production à rendre déterministe. Le trancher demande de décider ce que `renameCollection`
doit garantir, ce qui est une question de conception pour T2e. Il fera rougir la CI par
intermittence d'ici là.

## Où en est le travail, au 2026-10-05

**T2d est fusionnée** par la PR #6, en rebase. La CI y est passée du premier coup, puis un
test instable de `catalog.spec.ts` a été corrigé par-dessus (`22bf142`).

**T2e est livrée, PR #7, CI verte du premier coup**, e2e comprise. Branche
`feat/product-collections`, un seul commit, 34 fichiers. Elle attend une relecture
humaine : CodeRabbit ne lit pas ce dépôt, public, sans demande manuelle.

Un vendeur crée une collection, y range des articles, choisit leur ordre à la main, et la
publie sous un slug propre à sa boutique.

Quatre constats mineurs de T2d restent ouverts, consignés dans son commit de revue :
décompte et liste hors transaction, pluriel ICU absent sur le nombre de résultats, lien
« suivante » au-delà de la millième page, et repli de casse limité à l'ASCII en
collation C.

**La suite bout en bout n'est pas verte d'un bloc sur cette machine, et ce n'est pas une
régression.** Deux exécutions, deux jeux d'échecs différents, aucun test tombant deux
fois. Chacun repasse isolément. La charge montait à 10,8 sur quatre cœurs : en mode
développement Next compile chaque route au premier accès, et deux workers Playwright
suffisent à saturer. C'est la raison d'être de la surcharge de production, décrite plus
bas.

**La CI a tranché : elle est passée d'un bloc.** Ce que la machine locale ne pouvait pas
établir, le runner dédié l'a fait. Devant une suite instable ici, ne pas s'acharner :
ouvrir la PR et lire le verdict de la CI coûte quatre minutes.

**Deux filets ne sont PAS tendus par défaut, et les deux se croient tendus.**

`ci.yml` se déclenche sur `pull_request` et sur les poussées vers `main`. Une branche
poussée seule n'est donc vérifiée par rien. Une tranche peut vivre plusieurs jours sur une
branche, être annoncée « vérifiée » sur la foi des couches lancées à la main, et n'avoir
jamais rencontré la CI. Ouvrir la PR est ce qui la déclenche.

**CodeRabbit ne relit rien automatiquement sur ce dépôt.** Son premier message sur chaque
PR le dit : « This repository does not receive automatic reviews because it has fewer than
10 stars. » Ce n'est pas un réglage du projet, c'est sa politique pour les dépôts peu
suivis. La revue se demande à la main, en commentant `@coderabbitai review` sur la PR, et
sans cela une PR reste ouverte sans qu'aucun relecteur externe la voie. Vérifié le
2026-10-05 sur la PR #7, ouverte la veille et jamais relue.

**Les conteneurs écrivent sous `root`, et `sudo` n'est PAS nécessaire pour le réparer.**
Une version antérieure de ce document conseillait `sudo rm -rf` pour
`apps/api/test/.fixtures-uid1000/`. C'est inutile : le conteneur qui a créé ces fichiers
peut aussi corriger leurs droits.

Le cas s'est reposé le 2026-10-04 avec une migration générée par Prisma, sortie en `uid 0`
et donc impossible à compléter à la main. Le remède, sans toucher à son propre système :

    docker compose --env-file .env -f docker/docker-compose.dev.yml \
      run --rm --no-deps --user root migrate \
      sh -c "chown -R 1000:1000 /app/packages/db/prisma/migrations" 

## Reprendre sur une autre machine

Le dépôt ne suffit pas : cinq choses n'y sont pas.

**Les ports publiés peuvent entrer en conflit avec un autre projet.** Depuis `456dfb9`, les
six ports du compose se lisent dans l'environnement, avec les valeurs habituelles par
défaut : `STOREFRONT_PORT`, `VENDOR_PORT`, `ADMIN_PORT`, `API_PORT`, `MAILPIT_PORT`,
`STORAGE_PORT`. Sur l'ancienne machine, un Grafana d'un autre projet occupait `3001`, donc
l'espace vendeur y tournait sur `3011`.

Ce choix ne voyage pas, puisqu'il vit dans `.env`. Sur la nouvelle machine, partir des
valeurs par défaut, et ne les changer que si un port est déjà pris. **Changer un port oblige
à changer l'URL correspondante** : le port dit à Docker où publier, l'URL dit au navigateur
où aller, et rien ne signale leur désaccord. Les deux blocs sont côte à côte dans
`.env.example` pour cette raison.

**`.env` n'est pas versionné.** Le partir de `.env.example`, puis :

- `DEV_HOST` porte l'adresse locale **de la machine**, au format sslip.io
  (`10-0-10-176.sslip.io` désigne `10.0.10.176`). Elle change avec le réseau. Elle ne
  sert qu'à joindre la stack depuis un autre appareil : un téléphone, pour vérifier la
  réactivité de l'interface. Le développement sur la machine elle-même passe par
  `localhost` et l'ignore.
- `BETTER_AUTH_SECRET` peut rester la valeur d'exemple en développement. Changer de
  secret invalide toutes les sessions ouvertes, rien de plus.
- `COOKIE_DOMAIN` reste **vide** en développement. Les applications sont sur `localhost`
  à des ports différents, et les navigateurs n'isolent pas les cookies par port : le
  partage de session est déjà acquis. Cette variable n'a de sens qu'en production.

**Les identifiants Google n'existent pas.** `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`
sont vides, et le bouton « Continuer avec Google » n'apparaît que si
`NEXT_PUBLIC_GOOGLE_ACTIF` vaut `1`. Sans eux, le parcours par mot de passe est entier :
rien n'est bloqué. `docker/README.md` donne les URL de rappel à déclarer dans la console
Google le jour où on les crée.

**La base a besoin de l'extension `unaccent`.** La recherche du catalogue compare des
titres sans tenir compte des accents, et une migration de T2d pose l'extension. Elle est
livrée avec PostgreSQL, donc le conteneur du compose l'accepte sans rien installer. Sur une
base gérée qui refuserait `CREATE EXTENSION`, la migration échoue au démarrage : il faudrait
alors la faire poser par un administrateur, ou retomber sur un `ILIKE` sans `unaccent`, ce
qui rendrait « etole » incapable de trouver « Étole ».

**Les volumes Docker sont locaux.** La base de la nouvelle machine part vide. Le service
`migrate` du compose déploie les migrations avant que les applications démarrent, et
celles-ci l'attendent : `pnpm docker:up` suffit. Les comptes créés sur l'ancienne machine
ne suivent pas, et c'est sans conséquence, ce sont des comptes d'essai.

**Un `.env` déjà présent peut être PÉRIMÉ.** Le document couvrait la machine neuve, pas
la machine qu'on retrouve après quelques tranches. Une tranche qui ajoute une variable
l'écrit dans `.env.example` seulement : le `.env` local, lui, ne bouge pas. Le symptôme
est un conteneur qui sort en erreur sur un nom de variable : `PGRST_JWT_SECRET is
undefined` pour le stockage. Comparer avant de chercher ailleurs :

    comm -23 <(grep -oE "^[A-Z_]+=" .env.example | sort -u) <(grep -oE "^[A-Z_]+=" .env | sort -u)

**Un volume PostgreSQL peut aussi être périmé.** T1b a écrasé l'historique des migrations.
Un volume antérieur porte les anciens types, et `migrate deploy` échoue sur
`type "user_role" already exists` (P3018). La réponse est de supprimer le volume, il ne
contient que des comptes d'essai :

    pnpm docker:down && docker volume rm clemperl_dev_pg_data clemperl_dev_storage_data

**`pnpm install` seul ne rend pas les tests exécutables.** Les paquets consomment le
`dist` les uns des autres, pas leurs sources. Sur un clone neuf, `pnpm test` échoue sur
des symptômes qui n'ont rien à voir, par exemple `z.enum(E_CURRENCY)` recevant
`undefined` parce que le client Prisma n'est pas généré. Construire d'abord :

    pnpm install && pnpm turbo run build --filter="./packages/*"

**Les images Docker se périment en silence, et leurs symptômes ne parlent jamais de leur
âge.** Démarrer la stack sans `--build` après quelques tranches donne des conteneurs
construits avant les dépendances que le verrou attend désormais. Le 2026-10-04, le même
décalage a pris trois déguisements : une erreur de permissions `pnpm`
(`ERR_PNPM_PACKAGE_MANAGER_REMOVE_MODULES_DIR`), un conteneur `api` qui ne devenait jamais
sain, et des `fetch failed` vers des services absents. La commande qui tranche en deux
secondes :

    docker images --format '{{.Repository}}\t{{.CreatedSince}}' | grep clemperl

**Les navigateurs de Playwright ne sont pas dans le dépôt.** `pnpm install` ne les pose
pas : il faut `pnpm exec playwright install`. Sans eux, `pnpm test:e2e` échoue sur
« Executable doesn't exist », et le message accuse le premier test plutôt que
l'installation.

### Faire tourner la suite bout en bout

Deux bancs, et ils ne disent pas la même chose.

    pnpm docker:up && pnpm test:e2e     # développement, ce que la CI exerce
    pnpm e2e:up    && pnpm test:e2e     # build de production

Le premier doit être **vert en entier** : c'est celui de `ci.yml`. Le second ne l'est pas
encore : trois suites de T1a et T1b y butent sur la limitation de débit de Better Auth
(voir « Ce qui reste ouvert »). Les suites de T2a y passent.

Dans les deux cas, **attendre la santé des conteneurs avant de lancer les tests** :
`up -d` rend la main au démarrage, pas à la disponibilité.

    docker compose --env-file .env -f docker/docker-compose.dev.yml ps

### Si Docker Desktop tourne sous WSL

Deux pannes d'interop ont coûté une séance le 2026-09-20, toutes deux étrangères au code
et toutes deux muettes sur leur cause :

- `error getting credentials - err: exit status 1` à la construction. L'assistant
  d'identifiants passe par Windows. Contournement sans toucher à `~/.docker/config.json` :
  un `DOCKER_CONFIG` jetable contenant `{}`, les images publiques ne demandant aucune
  authentification.
- `mount ... no such file or directory` au démarrage d'un conteneur, sur un fichier qui
  existe pourtant. Le cache de montage de Docker Desktop est périmé : un `touch` sur le
  fichier concerné le fait réévaluer.

Un redémarrage de Docker Desktop règle les deux.

## Ce qui reste ouvert

Rien de tout cela ne bloque T2.

### Dette laissée par les revues de T2d et T2e

Cinq points, tous nommés dans les messages de commit des tranches concernées, aucun ne
bloquant. Ils sont ici pour ne pas vivre uniquement dans l'historique.

**Le test d'éligibilité de la page de collection confond trois conditions.** Il oppose un
produit publié à un brouillon qui est aussi sans image et sans variante publiable, donc une
seule observation couvre les trois. Retirer `i.object_path IS NOT NULL` de `conditions()`
laisse la suite verte. Le cas réel existe : des produits publiés sans image prête, ceux
d'avant T2c et ceux dont la dernière image prête a été supprimée. Le test à écrire isole la
condition, et doit d'abord échouer quand on retire celle-ci.

**Deux listes de collections trient sans départage.** `listCollectionsForVendor` sur
`createdAt`, `listPublishedCollections` sur `publishedAt`, aucune colonne unique pour clore
l'ordre. Ni l'une ni l'autre n'est paginée, donc aucune ligne ne disparaît : seul l'ordre
peut osciller entre deux rendus pour des collections créées dans la même milliseconde.

**`readCollectionForVendor` ne filtre pas `product.deletedAt`.** Aucun code applicatif
n'écrit cette colonne aujourd'hui, donc rien ne se voit. Le jour où la suppression douce
d'un produit arrivera, l'écran vendeur montrera des articles supprimés comme les autres, et
un déplacement les réécrira en base.

**L'écran d'une collection charge tous les produits du vendeur dans un `<select>`**, sans
pagination, et rend trois formulaires par article. Une boutique à cinq mille articles charge
cinq mille options à chaque affichage et à chaque clic de flèche.

**Le décompte et la liste du catalogue sont deux instantanés.** Deux `$queryRaw` successifs
hors transaction : une publication entre les deux fait diverger `total` et `rows`. Un
`COUNT(*) OVER ()` dans la requête de liste supprimerait l'écart et un aller-retour.

**Le tour complet de Google n'a jamais été joué**, faute d'identifiants. La
configuration est écrite et le bouton se monte, mais aucun aller-retour réel n'a eu
lieu. C'est le seul critère d'acceptation de T1a resté ouvert.

**Le partage de session est prouvé sur des ports, pas sur des sous-domaines.** En
développement, les cookies sont partagés parce que le port ne les isole pas. En
production, c'est `COOKIE_DOMAIN` qui devra le faire, et ce chemin-là n'a jamais tourné.
Le jour où un environnement à sous-domaines existe, c'est la première chose à vérifier.

**L'image de l'API pèse 1,11 Go.** La CLI Prisma et TypeScript arrivent comme pairs
optionnels et ne sont jamais retirés. Personne n'a encore cherché à les exclure.

**Next 16 déprécie `middleware` au profit de `proxy`.** Le dépôt utilise encore
`middleware`. La migration n'est pas urgente, mais elle viendra.

**`scripts/dev-certs.sh` et `docker/proxy/` ne servent plus à la stack de
développement.** Ils datent du proxy nginx retiré pendant T1a, les applications
publient désormais chacune leur port. Le proxy est conservé pour la production, mais son
gabarit est encore paramétré par `DEV_HOST`, qui est une variable de développement. À
requalifier quand la production se montera.

**T0, critère 8 : l'affichage sur téléphone n'a pas été constaté.** Il demande un
appareil réel sur le réseau local.

**Le premier administrateur naît par `/setup`, sans jeton.** La seule barrière est
l'absence d'administrateur en base : la page disparaît dès qu'il en existe un. La
fenêtre entre le déploiement et la première connexion est donc ouverte à qui connaît
l'URL. Décision explicite, prise en connaissance du risque : la refermer consiste à
ouvrir l'administration **immédiatement** après le déploiement, avant toute annonce
publique. Un jeton d'amorçage reste ajoutable sans toucher au reste.

**Le seed ne crée plus aucun utilisateur.** Le compte d'administration de T0 était une
ligne `users` sans ligne `accounts` : Better Auth n'avait aucun identifiant à vérifier,
donc personne ne pouvait ouvrir l'administration. Il a été retiré plutôt que doté d'un
mot de passe écrit dans le dépôt.

**Le chemin Supabase hébergé n'a jamais été joué.** Le développement fait tourner
`supabase/storage-api` en conteneur, donc le vrai client et les vraies routes, mais
aucun projet Supabase distant n'existe, et les clés de production restent à créer.

**Aucun balayage des objets orphelins.** Si une transaction échoue après un
téléversement, la compensation supprime les objets ; si cette suppression échoue à son
tour, l'objet reste. Un orphelin coûte de l'espace, pas de la correction. Le balayage
relève de T7, avec les traitements de fond.

**Les informations légales ne se corrigent nulle part.** Le vendeur les voit en lecture
et lit où écrire ; côté administration, le chemin reste la base. C'est une décision de
T2a, un administrateur les a validées contre les pièces téléversées, et
`updateShopProfile` ne les prend pas en paramètres, elles sont absentes de sa signature.
Ça devient un vrai manque le jour où une société change de forme juridique.

**Deux onglets qui enregistrent en même temps : la dernière écriture gagne.** Aucun
verrou optimiste. Accepté tant qu'une boutique n'a qu'un membre : rien ne crée le second
aujourd'hui. À rouvrir avec les invitations.

**La limitation de débit de Better Auth n'est pas déclarée, et elle mord en production.**
`/sign-up/email` accepte trois requêtes puis répond `429`. Le réglage est hérité du
framework, qui l'active en production et la désactive en développement, donc il ne se
voit qu'en production. Mesuré le 2026-09-21 : trois `200` puis trois `429` d'affilée.
Conséquence immédiate : `sign-up.spec.ts` et `vendor-application.spec.ts` échouent contre
la surcharge de production, qui crée des comptes plus vite qu'aucun humain. La CI n'est
pas concernée, elle tourne sur la stack de développement. Le corriger consiste à déclarer
la politique dans `packages/auth/src/config/auth.config.ts` plutôt qu'à l'hériter, et à
relever le plafond dans `docker-compose.e2e.yml`. À traiter comme une décision de
sécurité, pas comme un correctif de test : la règle sur « mot de passe oublié » mérite
notamment d'être choisie, pas subie.

**`pnpm e2e:up` rend la main avant que la stack soit prête.** Il attend le démarrage des
conteneurs, pas leur santé ni la fin de `storage-init`. La CI compense par une boucle
d'attente explicite (`ci.yml`) ; en local, rien. Lancer `pnpm test:e2e` dans la foulée
produit des échecs qu'on attribue au code.

**Le dépôt d'image passe par le serveur, et ce n'est pas le premier choix.** Le cadrage
avait retenu un dépôt DIRECT du navigateur au stockage, par URL signée, pour que les
octets ne traversent aucun serveur applicatif. À l'implémentation : `supabase/storage-api`
n'expose **aucun en-tête CORS** : sa source porte `// kong should take care of cors` et la
ligne d'enregistrement est commentée, le préflight `OPTIONS` répondant 404. Supabase le
fait tourner derrière Kong, qui s'en charge ; l'image seule, non.

Le dépôt direct redeviendra possible le jour où un proxy se place devant le stockage,
`docker/proxy/` existe et ne sert plus depuis T1a. En attendant, chaque photo traverse un
serveur Next, ce qui est exactement ce que le dépôt direct devait éviter.

**Aucune image n'est servie au public, et le stock n'existe toujours pas.** T2c livre les
photos jusqu'à l'espace vendeur et la route de relais ; la boutique publique qui les
affichera est T2d, le stock T3. Rien à l'écran ne prétend le contraire.

**Rien de publié n'est visible hors de l'espace vendeur.** Le catalogue public est T2d.
Publier ne fait aujourd'hui que changer un état et figer le slug.

**`ProductVariant.priceAmount` est un `Int`**, plafonné à 2 147 483 647 : 2,1 milliards de
francs CFA, environ 3,2 M€. Au-dessus de tout article des trois métiers visés. Le plafond
est un choix, écrit pour que le jour où il gêne, on sache qu'il a été vu.

**La devise d'une boutique se fige dès qu'un produit existe**, brouillon compris. Le
déblocage est la suppression du brouillon, et le message le dit. Accepté.

**L'arithmétique monétaire attend T3, et elle passera par une bibliothèque.** Aujourd'hui
`packages/core` porte `IMoney`, `CURRENCY_EXPONENT`, `parsePrice` et `formatPrice`, de
quoi ranger un entier et l'afficher, ce que T2b demande et rien de plus. **T2b ne fait
aucun calcul.**

Le calcul arrive avec le panier : additionner des lignes, appliquer une remise, et surtout
**répartir un total entre plusieurs boutiques sans perdre un centime**. C'est là que le
code monétaire écrit à la main se trompe, et là qu'une bibliothèque dédiée gagne son
droit d'entrée. `dinero.js` 2.0.2 est le candidat : ESM, sans aucune dépendance, et sa
représentation (unité mineure entière plus `{ code, base, exponent }`) est exactement
celle qu'on range déjà. L'adopter ne demandera donc **aucune migration**.

Deux choses resteront à notre charge quoi qu'il arrive : lire « 1 200,50 » depuis un
formulaire français et refuser une décimale en franc CFA : aucune bibliothèque monétaire
n'analyse une saisie ; et le formatage, qui n'est qu'un `Intl.NumberFormat`.

Le seul point d'attention : `docs/ce-qui-casse.md` dit qu'une dépendance ajoutée à
`@clemperl/core` fait que « le cœur métier cesse d'être importable partout ». Dinero étant
sans dépendance, il passe ce test, mais c'est une décision à prendre explicitement.

**Les clés étrangères de `ProductVariantValue` ne garantissent pas la cohérence
hiérarchique.** Elles valident chaque identifiant séparément : rien en base n'interdit une
variante du produit A portant un axe du produit B. Aucun appelant ne peut le produire :
`saveProduct` construit ces lignes depuis ses propres tables, dans la transaction d'un
seul produit. La fermer demande des clés composites sur trois tables et une migration.
C'est la bonne direction, et c'est un chantier.

**Les fronts n'ont pas `packages/db` monté, ils l'embarquent.** Le compose monte
`packages/core/src`, `packages/domain/src`, `packages/ui/src` et `packages/auth/src` dans
les trois applications Next, dont le `tsc --watch` recompile les `dist` à chaud. Pas
`packages/db` : tout changement du schéma ou d'un dépôt exige `pnpm docker:up`, et le
symptôme accuse une route sans rapport. Trois reconstructions l'ont coûté pendant la
seule tranche T2b.

Le monter demanderait `src`, `generated` et `prisma` ensemble, `generated` n'étant pas
dans `src`. C'est un changement de topologie à vérifier pour les quatre applications, et
il mérite son propre chantier plutôt qu'un coin de tranche.

**`@clemperl/core` n'a pas de sous-chemin navigateur.** `@clemperl/domain` en a un
(`/browser`) depuis T2b, parce qu'un composant client qui importe son barillet fait entrer
nodemailer dans le paquet. `core` a le même défaut latent : le premier composant client
qui y cherchera `TCurrency` ou `CURRENCY_EXPONENT` le rouvrira.

**Une ligne `PENDING` abandonnée ne se nettoie pas toute seule, mais plus rien ne
devrait en produire.** Trois portes ont été fermées : un job qui épuise ses tentatives
bascule en `FAILED` par le relais `failed` du worker ; un `add` qui lève parce que Redis
est injoignable marque la ligne avant de rendre la main ; une écriture de ligne qui échoue
après un envoi réussi supprime l'objet, donc ne laisse pas de ligne du tout.

Reste le cas où le processus meurt entre le commit de la ligne et l'empilage. Le vendeur
la voit et la supprime ; le balayage automatique reste T7, avec les traitements
planifiés.

**Pas d'AVIF.** L'original est conservé, donc il se rajoutera sans rien redemander aux
vendeurs. Trois largeurs en WebP suffisent à T2d.

**L'original est conservé mais JAMAIS servi.** Le relais n'accepte que les déclinaisons.
L'original revient du stockage avec le type que le navigateur du déposant avait déclaré,
et sharp décline un SVG sans se plaindre : le servir depuis la boutique exécuterait son
script sur l'origine qui porte le cookie de session. Le dépôt filtre d'ailleurs par liste
blanche, pas par préfixe `image/`.

**La route de relais ne vérifie NI le produit, NI sa publication, NI la boutique.** Les
photos d'un brouillon sont lisibles par qui connaît leur chemin. C'est une décision,
écrite en section 9 de la spec T2c : le `uuid` de 36 caractères joue le rôle d'un lien non
répertorié, et vérifier la publication coûterait une lecture en base par vignette : sur
une grille de quarante, quarante lectures, ce qui anéantirait la mise en cache qui
justifie le relais.

**Aucune collection de plateforme.** Une collection appartient à une boutique et ne peut
contenir que ses articles. Une collection transversale à plusieurs vendeurs, par exemple
« Soldes d'été » tous vendeurs confondus, demanderait un écran de curation côté
administration et surtout un arbitrage : qui y entre, sur quel critère, et que devient un
article mis en avant puis dépublié. Écartée au cadrage de T2e.

**Aucune collection construite par règle.** Pas de « tous les articles à moins de 50 € »
qui se remplirait tout seul. Une collection est un choix humain, et le rendre automatique
changerait sa nature.

**Il n'y a pas de page d'index des collections.** La vitrine d'une boutique liste les
siennes, et `/shops/<shop>/collections` répond 404. C'est correct : le segment existe dans
l'arbre des routes sans porter de page, et c'est la mécanique même qui oblige à réserver
ce mot dans le slug d'un produit.

**Aucun sélecteur de boutique.** Le schéma autorise plusieurs `vendor_members` pour un
même compte, mais rien ne les crée. Le sélecteur arrivera avec les invitations, pas
avant.

**Il n'y a qu'un thème, et c'est voulu.** Le clair est le seul thème servi, et il ne
dépend pas du réglage du système : une place de marché montre des produits dont les
photos sont préparées sur fond clair, et un thème sombre les dénature. Les règles
`data-theme="dark"` et `data-theme="system"` existent dans `packages/ui` et sont
correctes, mais aucune interface ne les pose : le sélecteur a été cadré puis écarté le
2026-09-20. Le rouvrir consiste à monter un contrôle et à persister le choix ; rien
d'autre n'est à écrire.

## Ce qui a été vérifié, et comment

`docs/conventions/verification.md` sépare « vérifié en exécutant » de « vérifié sur
pièce ». Pour T1a comme pour T1b, tout ce qui est coché l'a été **en exécutant** :

    pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
    pnpm docker:up && pnpm test:e2e
    docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
    docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.e2e.ts --runInBand"

T1b a joué le parcours entier dans le navigateur, et c'est sa preuve principale :
dépôt d'une demande avec pièces, refus motivé, lecture du motif par le candidat,
resoumission corrigée, validation, puis existence de la boutique et de son propriétaire
(`e2e/vendor-application.spec.ts`). La suite tourne désormais sur un **build de
production** (`docker/docker-compose.e2e.yml`, `pnpm e2e:up`), pas sur le serveur de
développement.

Les planchers de couverture valent la valeur **mesurée** ce jour-là, jamais une valeur
souhaitée. Ils sont à 100 % partout : `api`, `auth`, `core`, `db`, `domain`, `i18n` et
`ui`. L'écart de `core` hérité de T0 (le schéma d'environnement sans test) a été
comblé pendant T1b. Le cliquet monte, il ne descend jamais.

T2a a été la première tranche jouée contre un **build de production** (`pnpm e2e:up`).
Cette surcharge existait depuis T1b sans avoir jamais tourné, et elle a révélé quatre
défauts qu'aucune autre vérification ne voyait : le stockage refusé au démarrage, l'image
de l'API qui ne démarrait pas depuis T1a, une décision d'administration lue avant d'être
écrite, et la limitation de débit ci-dessus. Les trois premiers sont corrigés. La leçon
tient en une ligne : **une suite qui ne passe que contre un serveur de développement ne
dit rien de ce qui sera déployé.**

`docs/pieges.md` tient le registre des pièges déjà payés : vingt-neuf entrées, dont
quinze nées de T1b. Le lire avant de « corriger » du code qui paraît bizarre : chacune a
coûté une séance de débogage, et plusieurs décrivent un code qui a l'air faux et ne
l'est pas.
