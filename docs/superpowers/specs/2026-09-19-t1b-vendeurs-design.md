# ClemPerl — T1b : Vendeurs, demande d'ouverture et validation

**Date** : 2026-09-19
**Statut** : design validé, en attente de plan d'implémentation
**Tranche** : T1b — seconde moitié de T1
**S'appuie sur** : `2026-09-18-t1a-identite-design.md`, livrée

> **Note du 2026-09-19, postérieure à la rédaction.** Le dépôt est passé à des
> identifiants, noms de fichiers, segments d'URL et clés de traduction **en anglais**
> (`CLAUDE.md`). Les noms français qu'emploient les extraits ci-dessous — `deposerDossier`,
> `/devenir-vendeur`, `IPieceDeposee` — ont donc leur équivalent anglais dans le code
> livré : `submitApplication`, `/become-a-vendor`, `ISubmittedDocument`. Le raisonnement,
> lui, n'a pas changé.

---

## 1. Objectif

Permettre à une personne titulaire d'un compte vérifié de **déposer un dossier de
candidature vendeur**, et à l'administration de **l'accepter ou de le refuser avec un
motif**. Une acceptation fait naître la boutique et son propriétaire.

T1a a livré l'identité et la session partagée, et a posé la décision dont cette tranche
découle : être vendeur n'est pas une valeur d'énumération sur le compte, c'est
**l'existence d'une entité liée et validée**. T1b construit cette entité.

## 2. Décisions de cadrage

| Sujet | Décision |
|---|---|
| Où se dépose la demande | **Storefront**, dans l'espace client. `apps/vendor` n'est pas touchée |
| Où se valide la demande | **`apps/admin`**, dont on monte la coquille minimale |
| Ce que contient le dossier | Boutique, identité légale, **et pièces justificatives** |
| Après un refus | Motif obligatoire, et **resoumission du même dossier** |
| Lien compte ↔ boutique | **Propriétaire et membres**, par une table d'appartenance |
| Modélisation | **Deux entités** : `VendorApplication`, puis `Vendor` à l'acceptation |
| Stockage des pièces | Supabase Storage, avec `supabase/storage-api` **dans le compose de développement** |
| Règles métier | **`@clemperl/domain` naît ici**, comme T0 et T1a l'avaient prévu |
| Premier administrateur | **Créé à la première ouverture de l'administration**, jamais par le seed |

### Pourquoi deux entités plutôt qu'une entité à statut

Une seule table `vendors` portant un statut aurait suffi techniquement, et aurait évité
d'avoir à filtrer sur l'état à chaque lecture. Le dossier reste malgré tout une entité
distincte, et la raison n'est pas technique : **on numérise une procédure qui se déroule
aujourd'hui sur papier**, et cette procédure connaît bel et bien un dossier de
candidature, objet séparé de la boutique qu'il autorise.

La conséquence rachète le coût. Le dossier est un **instantané de ce qui a été déclaré
ce jour-là**, archivé tel quel et jamais resynchronisé ; la boutique est ce qui vit
ensuite et évolue. Les champs qui paraissent dupliqués entre les deux ne le sont pas :
ce sont deux vérités à deux dates. Les pièces justificatives se rattachent au dossier,
là où elles ont un sens, et non à la boutique.

Corollaire, qui est l'argument décisif : `vendors` n'a **aucun statut**. Une ligne dans
cette table est un vendeur validé, point. La phrase de T1a devient littéralement vraie,
et aucune requête de T2 ou T3 ne pourra oublier un filtre qui n'existe pas.

## 3. Périmètre

### Inclus

- Dépôt d'un dossier depuis le storefront, pièces justificatives comprises
- Suivi de son dossier par le candidat, et resoumission après un refus
- Coquille de `apps/admin` : mise en page, locale unique, garde d'administration
- File d'attente des dossiers et fiche de décision dans l'administration
- Création du vendeur et de son propriétaire à l'acceptation
- Package `@clemperl/domain`
- Conteneur `supabase/storage-api` dans le compose de développement
- Trois courriels : accusé de réception, acceptation, refus motivé

### Exclu explicitement

- **`apps/vendor` reste vide.** On ne demande pas d'entrer dans l'espace vendeur avant
  d'être vendeur ; son back-office est le sujet de T2
- **L'invitation de collaborateurs.** La table d'appartenance existe et porte un rôle,
  mais T1b ne crée que la ligne `OWNER` à l'acceptation
- **La suspension d'un vendeur validé.** Relève de la modération, donc de T6
- **La modification d'une boutique après validation.** Aucun écran ne l'offre en T1b
- **Le courriel « un dossier vous attend » aux administrateurs.** Aucune liste de
  diffusion d'administration n'existe, et en constituer une est un sujet en soi. La file
  d'attente est le mécanisme ; les notifications sont T6 ou T7
- **Le pipeline média.** T1b amène le dépôt de **document privé**, pas le
  redimensionnement, pas la file d'attente, pas l'accès public. Ceux-là sont T2

## 4. Préalable : les tables passent au pluriel

T0 avait décidé le singulier. La décision est **renversée ici**, pendant que son coût
est nul : quatre tables, aucune donnée réelle, aucun environnement persistant.

`users`, `sessions`, `accounts`, `verifications`, puis `vendor_applications`,
`vendor_documents`, `vendor_decisions`, `vendors`, `vendor_members`.

**Les noms de types enum restent au singulier** — `user_role`,
`vendor_application_status`. Un type nomme la nature d'une valeur, pas une collection.

**Better Auth n'est pas concerné** : il s'adresse aux modèles Prisma (`prisma.user`), et
`@@map` ne renomme que la table.

**Bénéfice collatéral** : `user` est un mot réservé SQL, `users` ne l'est pas. Le
commentaire du schéma qui impose de quoter `"user"` dans toute requête écrite à la main
devient caduc et disparaît, de même que la requête concernée dans
`apps/api/src/modules/auth/schema-identite.int-spec.ts`.

**Méthode** : changer les `@@map`, supprimer les deux dossiers de migration, régénérer
sur une base neuve. Réécrire le SQL à la main produirait `users` avec `user_pkey` —
Prisma dérive les noms d'index et de contraintes du nom de table mappé, et une
incohérence de ce genre ne gêne personne jusqu'au jour où elle gêne. La régénération
**fusionne au passage les deux migrations en une seule** : la seconde n'existe que pour
défaire la table `user` de T0, ce qui n'a aucun intérêt pour un clone neuf. L'histoire
de cette substitution vit dans les specs, pas dans le dossier de migrations.

**Toute base de développement existante doit être détruite** (`down -v`). Prisma stocke
l'empreinte de chaque migration appliquée dans `_prisma_migrations` : modifier un
fichier déjà joué fait échouer le prochain `migrate deploy` sur une somme de contrôle
divergente. `pnpm docker:down` ne supprime pas les volumes ; la commande doit être
explicite, comme elle l'est déjà dans la CI.

Ce renommage est une correction de convention sur le produit de T0, pas une
fonctionnalité de T1b. Il constitue **le premier chantier du plan**, et reste distinct
dans le message de commit.

## 5. Modèle de données

Cinq tables. Deux versants : le dossier, archive figée de ce qui a été déclaré ; la
boutique, ce qui vit ensuite. Pièces et décisions appartiennent au dossier ;
l'appartenance appartient à la boutique.

```prisma
enum E_VENDOR_APPLICATION_STATUS { SUBMITTED ACCEPTED REJECTED @@map("vendor_application_status") }
enum E_VENDOR_DECISION           { ACCEPTED REJECTED          @@map("vendor_decision") }
enum E_VENDOR_DOCUMENT_KIND      { REGISTRY IDENTITY TAX      @@map("vendor_document_kind") }
enum E_VENDOR_MEMBER_ROLE        { OWNER MANAGER              @@map("vendor_member_role") }
enum E_VENDOR_CATEGORY           { APPAREL JEWELLERY LEATHER_GOODS @@map("vendor_category") }
enum E_VENDOR_REJECTION_REASON {
  INCOMPLETE_FILE UNREADABLE_DOCUMENT IDENTITY_MISMATCH INELIGIBLE_ACTIVITY OTHER
  @@map("vendor_rejection_reason")
}
```

- **`vendor_applications`** — candidat, état, locale de dépôt, les champs déclarés
  (boutique, contact, catégories, identité légale), `submitted_at`, `decided_at`, et
  `vendor_id` renseigné à l'acceptation seulement.
- **`vendor_documents`** — dossier, nature, chemin de l'objet, type MIME, taille, nom
  d'origine conservé pour l'affichage.
- **`vendor_decisions`** — dossier, sens de la décision, raison codée et commentaire en
  clair, auteur.
- **`vendors`** — slug unique, nom, description, contact, identité légale reprise à
  l'acceptation, `deleted_at`.
- **`vendor_members`** — boutique, compte, rôle, unique sur le couple.

Sept points qui ne se devinent pas à la lecture du schéma :

**`vendors` n'a pas de statut.** Voir section 2. Son existence *est* la validation.

**Un seul dossier ouvert par candidat, garanti par la base.** Prisma ne sait pas
déclarer un index unique partiel : la contrainte
`UNIQUE (applicant_id) WHERE status = 'SUBMITTED'` s'écrit **à la main dans la
migration**. Une vérification applicative perdrait la course à deux onglets ouverts.

**`vendor_decisions` est un journal en ajout seul.** C'est le seul endroit où l'on
déroge à la règle T0 « `createdAt` et `updatedAt` systématiques ». Une décision ne se
modifie pas ; un `updatedAt` qui vaut toujours `createdAt` est du bruit qui laisse croire
le contraire. `createdAt` porte la date de la décision. Le schéma le commente.

**Une resoumission remplace les pièces, elle ne les empile pas.** C'est la procédure
physique tenue jusqu'au bout : quand on vous rend un document illisible, vous rapportez
le bon, et l'ancien ne reste pas au dossier. Le motif du refus, lui, survit dans le
journal.

**Le nom de boutique s'arbitre à l'acceptation, pas au dépôt.** Le slug naît avec le
vendeur. Deux candidats peuvent déposer le même nom ; c'est la seconde acceptation qui
échoue, avec un message demandant à l'administration de trancher. Interdire le doublon
au dépôt laisserait un dossier jamais validé réserver un nom.

**L'archive survit à tout.** `applicant_id` et `decided_by_id` sont en `Restrict` :
supprimer un compte ne doit pas effacer la trace d'une décision administrative. Pièces
et décisions sont en `Cascade` depuis le dossier — elles n'ont pas de sens sans lui.

**`E_VENDOR_CATEGORY` n'est pas la taxonomie de T2.** Trois valeurs déclaratives, celles
que nomme `CLAUDE.md`, qui disent ce que le candidat compte vendre. T2 apportera un arbre
de catégories produit : un autre objet, pas une extension de celui-ci. Le schéma le dit,
pour que personne ne tente de les fusionner.

Ces enums sont adossés à la base : ils vivent dans `schema.prisma` et se consomment par
les réexports explicites de `@clemperl/db`, comme `E_USER_ROLE`. Aucun doublon dans
`@clemperl/core`.

## 6. `@clemperl/domain`

Le package naît ici, comme T0 l'avait décidé et T1a confirmé. Sa règle tient en une
phrase : **il reçoit des structures et rend des verdicts.** Aucune requête, aucun
fichier, aucun courriel, aucun React.

```
packages/domain/src/
  constants/   pieces-obligatoires.constant.ts    REGISTRY + IDENTITY ; TAX facultative
               transitions-dossier.constant.ts    la table ci-dessous, en données
  interfaces/  dossier-vendeur.interface.ts       la forme minimale que le domaine lit
               violation-dossier.interface.ts     une violation = une clé et ses arguments
  errors/      erreurs-dossier.error.ts           les erreurs de domaine, localisées
  messages/    messages-dossier.utils.ts          les textes des trois courriels
  schemas/     depot-dossier.schema.ts            Zod, partagé formulaire et server action
  utils/       transitions-dossier.utils.ts       peutTransitionner, appliquerTransition
               validation-dossier.utils.ts        validerDossier
               decision-vendeur.utils.ts          validerDecision
               permissions-vendeur.utils.ts       peutVoir, peutDecider, peutResoumettre
               slug-boutique.utils.ts             slugifierNomBoutique
```

### La machine à états

| Depuis | Action | Vers | Par |
|---|---|---|---|
| `SUBMITTED` | accepter | `ACCEPTED` | un administrateur |
| `SUBMITTED` | refuser | `REJECTED` | un administrateur |
| `REJECTED` | resoumettre | `SUBMITTED` | le candidat, sur son dossier |

`ACCEPTED` est **terminal** : un dossier validé ne se rouvre pas, la boutique existe
désormais et c'est elle qui évolue. Un dossier déjà `SUBMITTED` ne se resoumet pas, ce
qui ferme la porte au double dépôt par impatience. Toute autre paire lève une erreur de
domaine. La table est une **donnée**, pas une cascade de `if` : la lire suffit à
connaître le système.

### Le domaine ne garde pas l'unicité du dossier ouvert

On pourrait écrire `peutDeposer(candidat, dossiersExistants)`. Ce serait faux : une
fonction pure ne gagne pas une course entre deux onglets. Cette règle vit dans l'index
unique partiel de la section 5. **Le domaine arbitre ce qui dépend de l'état qu'on lui
montre ; la base garde ce qui dépend de ce qui existe.** C'est cette frontière qui
dispense le domaine de tout accès aux données.

### Les erreurs ne connaissent aucun framework

Le domaine lève une `ErreurDomaine`, classe de base portant le `II18nExceptionResponse`
de `@clemperl/core` et posée à côté du contrat qu'elle implémente. Le filtre global de
NestJS la traduit, le retour de server action la traduit ; ni `@nestjs/common` ni Next
n'entrent dans le package. Clés imbriquées par domaine —
`errors.vendor_application.already_decided`, `errors.vendor_application.missing_document`
— ajoutées **en français et en anglais dans le même changement**.

### Un piège de bundle à désamorcer avant de l'avoir payé

Le schéma Zod de dépôt est partagé entre le formulaire (navigateur) et la server action
(serveur) : c'est tout son intérêt. Mais le domaine importe les enums adossés à la base,
et `@clemperl/db` n'expose aujourd'hui qu'un point d'entrée, `index.ts`, qui réexporte
`generated/prisma/client.js` — donc le client Prisma et l'adaptateur `pg`. Un composant
client important le schéma ferait entrer Prisma dans le paquet envoyé au navigateur,
exactement le piège que `apps/storefront/src/lib/auth-client.ts` documente déjà pour
`@clemperl/auth`.

**Parade** : `@clemperl/db` gagne une seconde sortie, `@clemperl/db/enums`, qui ne
réexporte que `generated/prisma/enums.js`. Le seed importe déjà ce module isolément, ce
qui indique fortement qu'il ne traîne pas le client — **mais cela reste à prouver à
l'exécution**, `generated/` n'étant pas versionné.

## 7. Parcours storefront

T1b écrit **la première server action du dépôt**. T0 les annonçait, T1a n'en a créé
aucune — tout passait par `authClient`. La forme fixée ici sera copiée par les suivantes.

### Une seule URL, quatre états

`/[locale]/devenir-vendeur` ne change jamais d'adresse ; son contenu suit le dossier.

| État | Ce que la page rend |
|---|---|
| Aucun dossier | Le formulaire, précédé de la liste des pièces à préparer |
| `SUBMITTED` | « Dossier en cours d'examen », déposé le … — aucune action |
| `REJECTED` | Le motif de la dernière décision, puis le formulaire prérempli |
| `ACCEPTED` | La confirmation, et le renvoi vers l'espace vendeur, vide jusqu'à T2 |

Deux routes (`/devenir-vendeur` et `/mon-dossier`) auraient imposé qu'une des deux
réponde « rien à voir ici » selon l'état, et qu'un lien de navigation devine laquelle
proposer. Une seule adresse : une seule entrée dans le menu du compte, et un signet qui
reste valable du dépôt à la validation.

Le candidat ne voit que **la dernière** décision ; le journal complet est pour
l'administration.

### La garde vit dans le composant serveur

Le middleware ne fait que la négociation de langue, et Better Auth n'y offrirait qu'une
lecture optimiste du cookie. Poser la règle aux deux endroits, c'est deux endroits à
tenir synchrones pour une seule vérité. La page lit la session par `@clemperl/auth` :
pas de session → redirection vers `/connexion` ; session non vérifiée → le message de
T1a. **La page de connexion doit donc accepter une destination de retour** (`?suite=`),
ce que T1a n'avait pas eu besoin de construire.

### Le téléversement passe par la server action

Pas d'URL signée émise au navigateur. Trois raisons : la clé de service ne quitte jamais
le serveur ; un formulaire abandonné ne laisse aucun objet orphelin ; l'utilisateur a
une seule opération à comprendre, qui réussit ou échoue d'un bloc.

Le prix est réel : le fichier transite par la mémoire du serveur Next, et
`serverActions.bodySizeLimit` doit passer de 1 Mo à environ 16 Mo pour trois pièces de
5 Mo. **Acceptable pour trois justificatifs, inacceptable pour les médias produit de
T2**, qui devront emprunter le téléversement direct. La frontière est posée ici.

### La séquence de dépôt, dans l'ordre

1. Zod, schéma du domaine, sur les champs → violations renvoyées, **rien n'est écrit** ;
2. `validerDossier` → les pièces obligatoires sont-elles présentes ;
3. l'identifiant du dossier est généré **avant** l'insertion, pour que le chemin d'objet
   le porte ;
4. téléversement sous `vendor-applications/{id}/{kind}-{cuid}.{ext}` — **jamais le nom
   de fichier de l'utilisateur**, conservé seulement pour l'affichage ;
5. transaction : le dossier et ses pièces ensemble, ou rien ;
6. si la transaction échoue, les objets déjà téléversés sont supprimés — compensation,
   faute de transaction commune au stockage et à la base ;
7. l'accusé de réception part **hors** transaction ;
8. `revalidatePath`, et la page rend « en examen ».

À la resoumission, même séquence, avec une inversion qui compte : **les anciens objets
ne sont supprimés qu'après le commit.** Les supprimer avant, c'est perdre des pièces
encore référencées si la transaction échoue.

Le retour de la server action porte le contrat de `docs/conventions/erreurs.md` :
`message: string[]` et clés imbriquées. Le formulaire les affiche, il n'en fabrique
aucune.

`next.config.ts` du storefront gagne `serverActions.bodySizeLimit`, et
`@clemperl/domain` rejoint `transpilePackages`.

## 8. Administration

### La coquille, et rien de plus

T0 a tranché : administration et espace vendeur sont « câblés sur la même infrastructure
mais livrés en français seul ». Donc `next-intl` avec `fr` pour seule locale et un
préfixe `never` — des URL sans `/fr`, et l'ajout de l'anglais un jour ne coûtera qu'un
catalogue et une ligne de configuration. Avec ça : une mise en page, et la garde.

### La garde est une fonction appelée, pas un layout qui protège

`apps/admin` n'a aucune page publique. La tentation est de placer le contrôle dans le
layout racine et de ne plus y penser : c'est précisément ce qu'il ne faut pas faire. Un
layout ne s'interpose pas de façon garantie devant tout ce qu'il enveloppe, et une garde
qui *semble* protéger est pire qu'une garde absente.

Donc `exigerAdministrateur()` dans `src/lib/`, appelée explicitement **en tête de chaque
page et de chaque server action**. La règle vit à un seul endroit ; son application est
visible à chaque point d'entrée. Pas de session → redirection vers la connexion ;
session sans le rôle `ADMIN` → `notFound()`, qui ne confirme même pas l'existence de la
route.

### Le premier administrateur

**Le seed ne crée aucun utilisateur.** Le compte d'administration de T0 était une ligne
`users` sans ligne `accounts` : Better Auth n'avait aucun identifiant à vérifier, et
personne ne pouvait donc ouvrir l'administration. Plutôt que de lui greffer un mot de
passe, on retire le compte du seed et l'administration **s'amorce elle-même**.

`/installation` n'existe que tant qu'aucun compte ne porte le rôle `ADMIN`. Elle crée le
premier administrateur par `auth.api.signUpEmail`, lui pose le rôle et marque son adresse
vérifiée, puis disparaît définitivement — toute visite ultérieure rend `notFound()`.
`exigerAdministrateur()` y renvoie quand la table est vierge, sinon une installation
neuve enverrait vers une connexion qu'aucun compte ne peut passer.

**Aucun jeton ne protège cette page** : la seule barrière est l'absence d'administrateur.
C'est une décision explicite, prise en connaissance du risque — voir la table des risques,
qui le porte et dit comment le refermer.

### Deux écrans

`/dossiers` — la file d'attente : les `SUBMITTED` par date de dépôt croissante, le plus
ancien d'abord, avec un filtre pour retrouver les dossiers décidés.

`/dossiers/[id]` — la fiche : les champs déclarés, les pièces, **le journal complet des
décisions**, et les deux actions.

### La course que deux administrateurs peuvent se livrer

La server action enchaîne `exigerAdministrateur()`, puis le domaine
(`appliquerTransition` pour la légalité, `validerDecision` pour l'exigence d'une raison
codée au refus et d'un commentaire quand la raison est `OTHER`), puis la transaction :

- une ligne dans `vendor_decisions` ;
- le dossier passe à `ACCEPTED` ou `REJECTED`, `decided_at` renseigné ;
- **à l'acceptation seulement** : création du vendeur avec son slug dérivé, de son
  `vendor_members` en `OWNER`, et liaison du `vendor_id` sur le dossier.

La transition s'écrit en `updateMany` conditionné sur `status = 'SUBMITTED'`, et l'action
vérifie qu'**exactement une ligne a bougé**. Sans cela, deux administrateurs ouvrant la
même fiche produisent deux décisions et, au pire, deux boutiques. C'est le pendant exact
de l'index unique partiel : **le domaine dit ce qui est permis, la base gagne la course.**
Le perdant reçoit « ce dossier a déjà été traité » et sa page se rafraîchit sur la
décision réelle.

Le conflit de slug de la section 5 se manifeste ici et nulle part ailleurs. Le courriel
au candidat part hors transaction.

## 9. Stockage des pièces

### `supabase/storage-api` dans le compose, pas la CLI Supabase

Le développement doit exercer **le même code que la production**. Un adapter « fichiers
sur volume » ne le ferait pas : on ne saurait rien des URL signées, des politiques de
bucket ni des erreurs réelles du SDK. L'analogie avec Mailpit, souvent invoquée, ne tient
que parce que SMTP est un protocole standard — le client qui parle à Mailpit est celui
qui parlera au relais de production. Le stockage n'offre pas cette propriété gratuitement ;
faire tourner `storage-api` en local la restaure.

La CLI Supabase (`supabase start`) est mieux documentée, mais ce qu'elle documente est la
**stack entière** : une dizaine de conteneurs, dont un seul nous intéresse, et trois qui
entrent en collision avec des décisions déjà prises — GoTrue contre Better Auth, son
catcher de courriels contre Mailpit, sa base contre la nôtre. S'y ajouteraient deux
Postgres en développement, un second cycle de vie à côté du compose, un binaire à
installer, et une étape de plus dans la CI — dont le job e2e se contente aujourd'hui de
`pnpm docker:up` suivi d'une attente sur les sondes du compose.

**La CLI sert donc de documentation, pas de runtime** : on la lance une fois, on inspecte
les variables d'environnement de son conteneur de stockage, on les recopie dans notre
compose, on l'arrête.

Ce qu'on perd : Studio, et donc un navigateur de fichiers — le pendant de ce que Mailpit
offre pour les courriels. Le backend fichier écrit des fichiers ordinaires dans un
volume ; `docker exec … ls` fait le travail.

Ce qui ferait changer d'avis : que le projet utilise Supabase pour autre chose que le
stockage. Ce n'est pas le cas et ne le sera pas — T1a a tranché l'identité avec Better
Auth, T7 tranchera le temps réel avec Socket.IO, et `CLAUDE.md` écrit « Supabase Storage
(médias uniquement) ».

Conséquences concrètes : un conteneur avec `STORAGE_BACKEND=file` et son volume ; **sa
propre base** dans l'instance Postgres existante, car `storage-api` joue ses migrations
sur un schéma qu'il possède ; une paire de clés JWT de développement dans
`.env.example` ; une entrée dans l'ordonnancement du compose après la sonde de
`postgres`.

**Un seul adapter sert les deux environnements, donc aucun port `IFileStore`.** Une
interface à implémentation unique n'existerait que pour elle-même. Le domaine n'a de
toute façon pas à connaître le stockage : la server action téléverse, puis passe une
référence. Un utilitaire dans `@clemperl/core`, configuré par variables d'environnement,
suffit.

### La lecture des pièces par l'administration

Le bucket est privé ; il faut pourtant afficher un PDF. Deux voies :

*L'URL signée* — le serveur demande un lien de courte durée, le navigateur va chercher
l'objet directement. Usage canonique de Supabase, rien ne transite par Next. Mais une URL
signée est un **porteur** : qui l'a, l'ouvre, et elle traîne dans l'historique, le
presse-papier, un `Referer`.

*Le route handler* — `/api/pieces/[id]` appelle `exigerAdministrateur()`, vérifie que la
pièce appartient bien à un dossier, et streame l'objet. L'autorisation est réévaluée **à
chaque requête**, rien n'est porteur, une révocation est immédiate.

**Retenu : le route handler**, pour la même raison qu'à la section 7 — la clé de service
reste côté serveur et l'autorisation se vérifie là où elle est déjà vérifiée. Le coût, le
transit par Next, est sans objet pour trois justificatifs lus par une poignée
d'administrateurs. Ce qui ferait basculer vers l'URL signée : de gros fichiers, ou un
volume de lecture rendant le transit coûteux. Ni l'un ni l'autre ici.

## 10. Courriels

| Message | Déclencheur | Envoyé depuis |
|---|---|---|
| Accusé de réception | dépôt, et resoumission | storefront |
| Dossier accepté | décision `ACCEPTED` | admin |
| Dossier refusé, motif en clair | décision `REJECTED` | admin |

Forme héritée de T1a, reprise telle quelle : un fichier par message, un bloc `TEXTES`
portant `fr` et `en`, une fonction `construireMessageX(args, locale): IEmailMessage` qui
laisse le destinataire vide. Ces textes ne vont pas dans les catalogues next-intl parce
qu'ils sont construits hors contexte de requête, où `getTranslations` n'existe pas — le
commentaire de T1a l'explique déjà, et vaut identiquement ici.

**Le dossier porte sa locale.** Le courriel de décision part depuis `apps/admin`, qui ne
sait pas dans quelle langue le candidat s'est adressé à nous. D'où la colonne `locale` sur
`vendor_applications`, renseignée au dépôt. Porter la langue sur le compte via les
`additionalFields` de Better Auth serait plus général, mais c'est une décision d'identité
qui appartient à T1a. Une colonne sur le dossier suffit, et dit quelque chose de juste :
le dossier est un instantané, langue comprise.

Ces constructeurs vivent dans `packages/domain/src/messages/`. C'est un léger
élargissement de la définition du domaine — il rend des verdicts, et là il rend du texte
— mais ils restent purs, et les deux applications Next en ont besoin. L'alternative
serait de les dupliquer, ou d'ouvrir un package pour trois fichiers. Si T7 amène une vraie
couche de notifications, ils déménageront.

## 11. Tests

**Unit (Vitest).** Tout `@clemperl/domain` : les transitions légales et surtout les
illégales, la validation du dossier, l'exigence d'un commentaire quand la raison est
`OTHER`, les permissions, la dérivation du slug, les constructeurs de messages dans les
deux langues. Couche pure, aucune base.

**Integration (Jest et Testcontainers, dans le conteneur `api`).** Quatre vérités
qu'aucun test unitaire ne peut établir, parce qu'elles vivent dans PostgreSQL :

1. deux dépôts simultanés du même candidat — l'index unique partiel en refuse un ;
2. deux décisions simultanées sur le même dossier — un seul `updateMany` touche une ligne ;
3. l'acceptation crée le vendeur **et** son `OWNER` dans la même transaction, ou rien ;
4. deux acceptations de boutiques homonymes — la seconde échoue sur le slug.

**Ces tests imposent une décision d'architecture.** Ces séquences d'écriture ne sont pas
testables si elles vivent dans une server action : on ne charge pas une server action Next
depuis Jest dans le conteneur `api`. Elles sont donc extraites dans `@clemperl/db`, sous
`src/repositories/dossier-vendeur.repository.ts` — des fonctions Prisma nues, sans
framework, que la server action appelle après avoir fait son travail de transport (lire le
`FormData`, connaître la locale, rediriger). Deux bénéfices au-delà du test : c'est
exactement la raison pour laquelle T0 a voulu un package `db` partagé, « importé aussi
bien par les server actions Next que par les services Nest » ; et le harnais Testcontainers
de T1a est réutilisé tel quel, sans en monter un second.

**E2E navigateur (Playwright).** Le parcours entier, en traversant deux applications : le
candidat se connecte sur le storefront, dépose son dossier avec trois fichiers
(`setInputFiles`), l'administrateur le voit dans sa file, refuse avec un motif, le
candidat lit ce motif et resoumet, l'administrateur accepte — et la boutique existe. C'est
le seul test qui prouve la tranche telle qu'on la vit.

**API.** Rien. `apps/api` n'est pas touchée ; elle n'héberge que le harnais.

Les seuils de couverture valent la valeur **mesurée** le jour de la livraison, jamais une
valeur souhaitée. Le cliquet monte, il ne descend pas.

## 12. Critères d'acceptation

T1b est terminée quand ces dix points sont vérifiés :

1. Les tables sont au pluriel, les migrations régénérées en une seule, et un clone neuf
   démarre par `pnpm docker:up` sans intervention
2. `supabase/storage-api` répond dans la stack de développement, et un fichier téléversé
   se relit
3. Un candidat vérifié dépose un dossier complet avec ses pièces obligatoires, et reçoit
   l'accusé de réception dans Mailpit
4. Un dossier incomplet est refusé **sans rien écrire**, avec des messages en français
5. Un second dépôt par le même candidat est refusé par la base, pas par l'application
6. L'administrateur voit le dossier dans sa file, ouvre chaque pièce, et refuse avec une
   raison codée et un commentaire
7. Le candidat lit le motif, corrige, resoumet — et le journal conserve les deux décisions
8. L'acceptation crée le vendeur et son propriétaire, et le candidat reçoit le courriel
   dans sa langue de dépôt
9. Sur une base vierge, `/installation` crée le premier administrateur, puis disparaît ;
   un compte sans le rôle `ADMIN` n'atteint aucune page de `apps/admin`, ni aucune pièce
10. `pnpm lint`, `typecheck`, `test`, `test:e2e`, les suites d'intégration et les seuils
    de couverture passent

Le sixième et le septième ne se vérifient qu'avec un vrai navigateur sur deux
applications : c'est Playwright qui les établit.

## 13. Risques

| Risque | Impact | Traitement |
|---|---|---|
| **`storage-api` en standalone n'a jamais tourné ici** | Le dépôt de pièces ne démarre pas, et T1b n'a plus d'objet | **Premier chantier du plan, avant toute ligne qui en dépend.** La CLI Supabase sert à extraire la configuration exacte. Repli, dans l'ordre : stack CLI, puis adapter fichier — ce dernier sacrifiant la garantie « même code qu'en production » |
| **`@clemperl/db/enums` traîne peut-être le client Prisma** | Prisma entre dans le paquet navigateur, le poids explose | À prouver à l'exécution dès que `generated/` est construit. À défaut, le schéma Zod reste serveur et le formulaire valide au retour de la server action |
| **La régénération des migrations casse une base existante** | Somme de contrôle divergente, `migrate deploy` en échec | Documenté dans la passation : `down -v` obligatoire. Aucun environnement persistant n'existe encore, c'est le seul moment où ce renommage est gratuit |
| **Le téléversement par server action sature la mémoire** | Un dépôt échoue sous charge | Plafond explicite à ~16 Mo et taille par pièce validée dans le domaine. La frontière avec le téléversement direct de T2 est écrite |
| **Deux administrateurs décident simultanément** | Deux décisions, voire deux boutiques | `updateMany` conditionné sur l'état, vérification du nombre de lignes touchées, et un test d'intégration qui rejoue la course |
| **La compensation après échec de transaction échoue aussi** | Un objet orphelin reste dans le bucket | Accepté en T1b : un orphelin coûte de l'espace, pas de la correction. Un balayage périodique relève de T7, avec les traitements de fond |
| **La page d'amorçage est ouverte à qui la trouve** | Un inconnu s'empare de l'instance entre le déploiement et la première connexion | Décision explicite : la fenêtre est la seule barrière. La refermer consiste à ouvrir l'administration **immédiatement** après le déploiement, avant toute annonce publique de l'URL. Un jeton d'amorçage a été écarté pour la simplicité ; l'ajouter reste possible sans toucher au reste |
| **Aucune page ne permet de modifier une boutique validée** | Un nom mal saisi se corrige par la base | Accepté et écrit au périmètre. C'est le premier écran que T2 devra livrer |
