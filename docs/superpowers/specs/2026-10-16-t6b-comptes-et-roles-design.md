# ClemPerl, T6b : gérer les comptes et les rôles

**Date** : 2026-10-16
**Statut** : cadrée, non commencée
**Tranche** : T6b, deuxième des trois issues du découpage de T6
**S'appuie sur** : `2026-09-18-t1a-identite-design.md` (les comptes, les sessions, les jetons
à usage unique et les courriels), `2026-09-19-t1b-vendeurs-design.md` (la forme d'une
décision administrative) et `2026-10-13-t5-suspension-boutique-design.md` (l'écran
d'administration sur des comptes existants), toutes livrées

---

## 1. L'intention, et le pourquoi

ClemPerl va grandir, et administrer seul ne tient pas.

Il faut pouvoir nommer des administrateurs autant de fois qu'il le faudra, sans que cette
tâche-là reste celle d'une seule personne. Ce seront surtout des employés de ClemPerl.

Aujourd'hui, un seul administrateur existe, créé par l'amorçage de `/setup`, lequel se
referme dès qu'il a abouti. Personne ne peut en nommer un second depuis l'interface. La
tranche ouvre ce second chemin.

## 2. Ce que T6b décide

### Deux niveaux, plusieurs comptes à chacun

| Action | Administrateur | Super_admin |
| --- | --- | --- |
| Nommer un administrateur | oui | oui |
| Retirer un administrateur | oui | oui |
| Nommer un super_admin | non | oui |
| Retirer un super_admin | non | oui, sauf le dernier |

**Retirer, quel que soit le niveau, ramène à `CUSTOMER`.** Il n'existe pas de rétrogradation
d'un super_admin vers administrateur : retirer, c'est perdre les rôles d'administration, et
rien d'autre. Nommer à nouveau est un geste distinct.

**Le dernier super_admin ne peut pas être retiré.** C'est la seule garde absolue, et elle
existe pour que la plateforme ne puisse pas se fermer à elle-même.

Un administrateur peut nommer et retirer ses pairs. C'est voulu : si seul un super_admin
pouvait nommer, la tâche qu'on cherche à déléguer resterait sur le même bureau.

### Retirer n'est pas supprimer

Qui quitte ClemPerl perd ses pouvoirs et **garde son compte**. Il redevient un client comme
un autre : il peut acheter, et il n'a plus accès à l'administration.

Aucun compte n'est détruit par cette tranche.

### Un compte se crée depuis l'administration, et son mot de passe n'y est pas

L'administrateur saisit un nom et une adresse. La personne reçoit un lien **à usage unique
et à expiration**, qui la mène à la page où elle choisit son mot de passe, puis elle entre.

Aucun mot de passe ne voyage. Un mot de passe par défaut envoyé par courriel resterait en
clair dans une boîte mail, souvent pour toujours, et ouvrirait le compte tant que la personne
ne l'aurait pas changé.

T1a a déjà posé ce dont cela a besoin : la table `verifications`, la page
`/reset-password`, le crochet `sendResetPassword` et le courriel qui va avec.

## 3. Le modèle

### Une troisième valeur dans `E_USER_ROLE`

L'énumération connaît `CUSTOMER` et `ADMIN`. Il lui faut le niveau supérieur.

**Son nom n'est pas `OWNER`.** Ce mot est déjà pris par `E_VENDOR_MEMBER_ROLE`, où il désigne
le propriétaire d'une BOUTIQUE. Les deux notions n'ont aucun rapport, et un même compte peut
porter les deux : propriétaire de sa boutique, et administrateur de la plateforme. Les
confondre dans un lecteur pressé coûterait cher.

Le nom retenu est `SUPER_ADMIN`, parce qu'il dit ce qu'il est et qu'il ne ressemble à rien
d'autre dans ce schéma.

### Ce que le rôle n'est PAS

Ce n'est pas un rôle de boutique. `VendorMember` continue de porter `OWNER` et `MANAGER`, et
rien de T6b ne le touche.

Ce n'est pas un ensemble de permissions fines. Deux niveaux, et la matrice de la section 2
les épuise. Un système de permissions se justifierait si les besoins divergeaient ; ici ils
ne divergent que sur un axe, le droit de toucher à ses pairs du dessus.

## 4. Ce que « être administrateur » veut dire, et où c'est écrit

`"ADMIN"` est comparé en dur à **neuf endroits** du dépôt, pas aux deux que la section
suivante nomme. Le plus important est `packages/domain/src/utils/vendor-permissions.utils.ts`,
qui décide qui peut examiner une candidature de vendeur, et dont le type dit
`role: "CUSTOMER" | "ADMIN"`.

Sans correction, l'amorçage créant désormais un super_admin, celui-ci perdrait le droit
d'examiner les dossiers. Un niveau supérieur qui peut moins que celui du dessous n'est pas un
niveau supérieur.

**Tous ces tests deviennent « administrateur OU super_admin », par une fonction unique** dans
`packages/domain`. Les recopier huit fois rouvrirait la seconde vérité que ce dépôt a déjà
payée deux fois.

La liste exacte est à établir par le plan avec un `grep`, et non recopiée ici : une liste
écrite dans un document vieillit, un `grep` non.

**Décision du rédacteur**, parce qu'un super_admin qui en peut moins qu'un administrateur
serait absurde, et que la question ne se pose pas vraiment.

## 5. Ce que l'amorçage devient

`/setup` crée aujourd'hui le premier administrateur et se ferme sur `count({ role: "ADMIN" })`.

Il doit désormais créer un **super_admin**, puisque c'est le seul niveau capable d'en nommer
d'autres : un amorçage qui produirait un simple administrateur laisserait une plateforme où
personne ne peut jamais nommer de super_admin.

Et sa barrière doit compter les DEUX rôles d'administration. Compter les seuls `ADMIN`
rouvrirait l'amorçage sur une plateforme qui n'a que des super_admin, ce qui est exactement
l'état qu'il produit lui-même.

### Les bases existantes sont promues

Toute base qui porte aujourd'hui un `ADMIN` et aucun `SUPER_ADMIN` se retrouverait, après
cette tranche, sans personne pour nommer un super_admin, et la nouvelle barrière ne rouvrirait
pas l'amorçage. C'est l'anti-but de la section 8, atteint par inadvertance.

**La migration promeut donc tout `ADMIN` existant en `SUPER_ADMIN`.** Elles n'en portent
qu'un, celui de leur amorçage, qui est bien le propriétaire de l'instance. Cela vaut pour la
base de développement, celle de la CI et toute instance déployée.

La même correction vaut pour `requireAdministrator`, qui redirige vers `/setup` quand aucun
`ADMIN` n'existe : sans elle, un super_admin seul serait renvoyé vers un amorçage qui le
refuserait ensuite, et il tournerait en rond.

## 6. Les écrans

### `/accounts`, dans l'administration

Une liste, sur la forme de `/shops` de T5 et `/moderation` de T6a. Chaque ligne porte le nom,
l'adresse, le rôle, et les actions que le rôle du lecteur autorise.

**Elle ne liste que les comptes d'administration**, pas tous les clients. Un marché a
vocation à en avoir beaucoup, et une liste de tous les comptes serait un écran différent, avec
sa recherche et sa pagination, qui n'a rien à voir avec nommer un collègue.

### Le formulaire de création

Un nom, une adresse, et le niveau à accorder. Le choix du niveau n'offre `SUPER_ADMIN` qu'à
un super_admin : une option qu'on ne peut pas exercer n'a pas à s'afficher.

### Les invitations en attente sont visibles

Un compte créé dont la personne n'a jamais choisi son mot de passe apparaît dans la liste,
**marqué comme en attente**. Sans cela, un administrateur ne distinguerait pas un collègue
installé d'un collègue qui n'a jamais reçu ou jamais ouvert son courriel.

Chaque ligne en attente porte un bouton pour **renvoyer l'invitation**. Un lien expire au bout
de trois jours, et sans ce bouton la personne devrait deviner seule qu'il lui faut passer par
« mot de passe oublié ». **Décision du rédacteur** : montrer une attente sans permettre d'agir
dessus serait un écran qui constate et ne sert à rien.

Comment l'état « en attente » se dérive est laissé au constructeur, et dépend du mécanisme de
la section 10 : ce peut être l'absence de justificatif de mot de passe, ou une marque posée à
la création.

### Qui atteint l'écran, et ce qui le garde

`/accounts` s'ouvre à tout administrateur, super_admin compris : un administrateur peut nommer
ses pairs, donc il lui faut la liste.

**Chaque action serveur revérifie la matrice elle-même.** Une action serveur est une route
publique, et l'écran qui cache un bouton ne protège rien. C'est la règle que T5 et T6a
appliquent déjà, et `requireAdministrator` ne rend aujourd'hui qu'une session, sans dire le
niveau : le plan devra donc le lire.

### Ce que l'écran refuse de montrer

Les actions absentes ne sont pas grisées, elles ne sont pas rendues. C'est la règle que T3 a
posée pour les transitions de commande et que T5 a reprise : un bouton qu'on ne peut pas
presser est une promesse que l'écran ne tient pas.

## 7. Non-buts

**Aucun journal des actes.** Qui a nommé ou retiré qui n'est conservé nulle part. T6 l'a
écarté, T5 et T6a vivent déjà sans, et T6b ne l'introduit pas pour elle seule.

**Aucune suppression de compte.** Retirer un rôle est la seule action destructrice, et elle
ne détruit rien.

**Aucune gestion des clients.** La liste ne montre que l'administration.

**Aucune permission fine.** Deux niveaux, et c'est tout.

**Aucun changement aux rôles de boutique.** `OWNER` et `MANAGER` ne bougent pas.

## 8. Anti-buts

Ce qui ferait de cette tranche un échec même si elle fonctionnait :

**Une plateforme qui se ferme à elle-même.** Si une suite de retraits légitimes peut aboutir à
zéro compte capable de nommer, la tranche a échoué, quelle que soit la propreté du reste.

**Un mot de passe qui voyage.** Si un identifiant utilisable arrive un jour dans une boîte
mail, la tranche a échoué.

**Deux courriels pour une invitation.** Si la personne invitée reçoit à la fois une
vérification d'adresse et un lien de mot de passe, l'écran a beau être juste, l'expérience est
ratée. Voir la section 10.

## 9. Les cas limites

Un administrateur **se retire lui-même** : permis. Il perd des pouvoirs qu'un autre peut lui
rendre, et l'interdire demanderait d'expliquer un refus pour protéger quelqu'un de son propre
clic. **Décision du rédacteur**, à confirmer si elle gêne.

Un super_admin se retire lui-même alors qu'il est le dernier : **refusé**, par la garde de la
section 2.

Deux administrateurs retirent le même compte en même temps : l'état visé est atteint, et rien
ne lève. Même forme que la suspension de T5 et le marquage de T6a.

**Deux retraits simultanés du dernier super_admin**, chacun voyant l'autre comme le pair qui
reste : c'est le cas qui peut vider la plateforme. Ce n'est PAS une lecture suivie d'une
décision : c'est l'écriture qui doit trancher, par une condition que la base évalue, comme le
retrait de T6a dérive son idempotence du nombre de lignes touchées. Le dépôt n'a pas de ligne
parente naturelle à verrouiller ici, donc le plan choisira entre un verrou consultatif, un
verrou sur les lignes concernées, et une condition d'écriture qui compte. **Décision du
rédacteur** quant à la contrainte : quelle que soit la forme, un test d'intégration doit
montrer que deux retraits simultanés ne laissent jamais zéro super_admin.

**La session d'un compte retiré n'a rien à révoquer.** Vérifié : aucun `cookieCache` n'est
configuré dans `packages/auth/src/config/auth.config.ts`, donc Better Auth relit le rôle en
base à chaque requête. Un retrait prend effet immédiatement, sans attendre une déconnexion.

Une adresse **déjà utilisée** par un client : l'invitation échoue sur l'unicité, et le message
dit que cette adresse a déjà un compte. Promouvoir un client existant est un autre geste, que
T6b n'offre pas, et que la liste ne permettrait pas puisqu'elle ne montre pas les clients.

Un lien d'invitation **expiré** : la personne passe par `/forgot-password`, qui existe déjà.
Rien à construire.

## 10. Le risque technique, et il est réel

**`signUpEmail` envoie un courriel de vérification, parce que `sendOnSignUp` vaut `true`.**
L'invitation ajoutant un lien de mot de passe, la personne recevrait DEUX messages, dont un
inutile puisque T6b marque l'adresse comme vérifiée, à la manière de l'amorçage.

La contrainte est donc : **un seul message part**.

### Le lien vaut trois jours

Un employé ouvre son courriel le lendemain, ou le lundi suivant. Un lien d'une heure serait
mort à son arrivée, et le premier geste de son emploi serait de demander de l'aide.

**Cette durée est globale dans Better Auth**, donc l'allonger allonge aussi les liens d'oubli
de mot de passe de tous les clients. C'est accepté : trois jours pour un lien à usage unique
qui n'ouvre rien par lui-même, et qui exige l'accès à la boîte mail, reste un risque mesuré.

Si le plan trouve un moyen de fixer une durée par flux, tant mieux ; sinon trois jours pour
tout le monde.

Trois pistes, à éprouver par le plan plutôt qu'à trancher ici, parce que laquelle fonctionne
dépend de ce que `better-auth@1.7.5` permet réellement :

1. Créer le compte sans passer par `signUpEmail`, en écrivant `User` et son `Account` de
   justificatifs à la main, puis demander la réinitialisation. Le plus direct, et le plus
   dépendant des détails internes de la bibliothèque.
2. Garder `signUpEmail` et neutraliser l'envoi de vérification pour ce chemin seulement.
3. Garder les deux envois, mais faire du courriel de vérification le porteur de l'invitation,
   et ne pas demander de réinitialisation du tout.

Le plan DOIT commencer par une mesure sur ce point, et non par du code : une piste choisie sur
sa plausibilité coûterait la tranche entière.

**Mesuré le 2026-10-17, sur `better-auth@1.7.5` dans le conteneur `storefront`.** Un
`User` créé sans aucune ligne `Account` (`emailVerified: true`, `role: "ADMIN"`), puis
`auth.api.requestPasswordReset` appelé côté serveur avec `redirectTo: "/reset-password"` :

- **Un seul message part** (« Réinitialisation de votre mot de passe »), compté dans
  Mailpit pour cette adresse.
- **Un appel serveur direct n'est pas refusé** : `auth.api.requestPasswordReset`, appelé sans
  requête ni en-têtes, répond `status: true` avec un `redirectTo` relatif. La mesure ne dit
  pas si le `originCheck` s'est exécuté et a passé, ou s'il ne s'est pas exécuté faute de
  requête à contrôler. Le `GET` sur le lien n'a pas été exercé non plus : le jeton a été
  posté directement, donc la redirection portant `?callbackURL=%2Freset-password` n'a jamais
  été suivie.
- **`resetPassword` crée le justificatif absent** : après `POST /api/auth/reset-password`
  avec le jeton du lien, un `Account` `credential` portant un mot de passe existe, et
  `POST /api/auth/sign-in/email` répond 200 avec la session, rôle `ADMIN`.
- **Le lien vaut une heure** : `expires_at` dépasse `now()` de 3597 secondes, ce qui est
  observé. Que ce soit la durée par défaut tant que `resetPasswordTokenExpiresIn` n'est pas
  posée est lu dans le code de la bibliothèque, non observé.

La piste 1 est retenue : créer le `User` sans `Account`, puis demander la réinitialisation.
Aucune écriture d'`Account` à la main n'est nécessaire, et les pistes 2 et 3 n'ont pas été
mesurées faute de raison de le faire. La durée de trois jours reste à poser.

Conséquence, qui devient une contrainte pour la suite de la tranche : le chemin d'invitation
appelle `auth.api.requestPasswordReset({ body })` sans transmettre les en-têtes, exactement
comme l'amorçage le fait pour `signUpEmail`. Les transmettre remettrait en jeu un contrôle
d'origine qui n'a jamais été mesuré face à un `redirectTo` relatif.

## 11. Tests

**Pur, dans `packages/domain`** : la matrice de la section 2, exhaustivement. Qui peut nommer
quoi, qui peut retirer quoi, depuis chacun des trois rôles, et le refus du dernier super_admin.
C'est une fonction de décision, donc elle s'éprouve sans base.

**Intégration, contre le vrai PostgreSQL** : le retrait du dernier super_admin refusé, y
compris quand deux retraits partent en même temps ; un retrait qui laisse le compte intact et
le rôle à `CUSTOMER` ; une adresse déjà prise refusée nommément ; et la barrière d'amorçage
qui compte les deux rôles.

**Ce que T6b NE touche PAS**, sur la forme des fichiers que T5 et T6a ont écrits : retirer un
rôle ne touche ni les commandes de la personne, ni ses paniers, ni son appartenance à une
boutique.

**Navigateur** : un super_admin invite un administrateur, celui-ci reçoit un lien, choisit son
mot de passe, entre dans l'administration, et n'y voit pas l'option de nommer un super_admin.

## 12. Critères d'acceptation

1. La matrice de la section 2 est respectée, et l'écran ne rend que les actions permises
2. Le dernier super_admin ne peut être retiré par personne, y compris par lui-même
3. Une invitation produit UN seul courriel, qui ne contient aucun mot de passe
4. Le lien est à usage unique et expire
5. Retirer un rôle laisse le compte, ses commandes et ses boutiques intacts
6. L'amorçage crée un super_admin, et sa barrière compte les deux rôles d'administration
7. Une adresse déjà utilisée est refusée avec un message qui le dit
8. `lint`, `typecheck`, `test`, `test:e2e` et les seuils de couverture passent

## 13. Ce qui est laissé au constructeur

Le mécanisme exact de la section 9, après mesure.

La forme du courriel d'invitation, sur le modèle de ceux de T1a.

L'ordre et le libellé des colonnes de la liste, sur le modèle de `/shops`.

Le nom des fonctions de dépôt et de décision, en anglais, suivant les conventions du dépôt.
