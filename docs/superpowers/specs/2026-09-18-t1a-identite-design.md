# ClemPerl — T1a : Identité et sessions

**Date** : 2026-09-18
**Statut** : design validé, en attente de plan d'implémentation
**Tranche** : T1a — première moitié de T1, dont T1b (vendeurs) dépend entièrement
**S'appuie sur** : `2026-09-17-t0-fondations-monorepo-design.md`, livrée

---

## 1. Objectif

Permettre à une personne de se créer un compte, de prouver son adresse, et d'être
reconnue par les quatre applications sans se reconnecter. Rien de plus : pas de
boutique, pas de permission métier, pas de profil.

T1b ajoutera l'entité vendeur, sa demande d'ouverture et sa validation par
l'administration. Elle repose entièrement sur ce que livre T1a.

## 2. Décisions de cadrage

| Sujet | Décision |
|---|---|
| Bibliothèque | **Better Auth 1.7.5**, stable, indépendante du framework |
| Méthodes de connexion | Adresse e-mail + mot de passe, et connexion Google |
| Vérification d'adresse | **Obligatoire pour tous, dès l'inscription** |
| Rôles | Un compte unique par personne. Être vendeur sera une **relation** (T1b), jamais une colonne |
| Envoi de courriels | Port abstrait dans `@clemperl/core` ; Mailpit en développement, adapter de production branchable |
| Emplacement du gestionnaire | Monté dans **chaque application Next**, avec une configuration unique dans `@clemperl/auth` |
| Propriété des tables | **Better Auth possède les tables d'identité** ; nos champs métier s'y greffent |

### Pourquoi Better Auth plutôt qu'Auth.js

La spec T0 retenait Auth.js v5 en notant sa beta comme risque, à réévaluer ici.
Relevé sur le registre npm le 2026-09-18 : `5.0.0-beta.32`, publiée le 2026-07-20,
précédée de beta.31 en avril 2026 et beta.30 en octobre 2025. Trois préversions en neuf
mois, et aucune version stable après plus de deux ans.

Better Auth est en 1.7.5 stable. Surtout, elle est **indépendante du framework** : le
même module sert les trois applications Next et l'API NestJS. Avec Auth.js, NestJS
aurait dû vérifier les jetons par du code écrit et maintenu par nous.

Vérifié dans le paquet publié : `crossSubDomainCookies` et `additionalFields` existent,
et les greffons disponibles incluent `admin`, `access` et `email-otp`.

## 3. Périmètre

### Inclus

- Inscription par adresse e-mail et mot de passe
- Connexion Google
- Vérification d'adresse obligatoire, par courriel
- Connexion, déconnexion, réinitialisation de mot de passe
- Session partagée par les trois applications Next
- Lecture de session depuis l'API NestJS
- Port d'envoi de courriels et conteneur Mailpit
- Package `@clemperl/auth`
- Couche de tests d'intégration sur base réelle (Testcontainers)

### Exclu explicitement

- L'entité vendeur, sa demande et sa validation — c'est T1b
- Les permissions métier et les gardes de rôle au-delà de la distinction administration
- Le profil utilisateur : adresses, préférences, avatar
- La connexion par téléphone et code à usage unique — écartée faute de fournisseur SMS
- Le lien magique par courriel
- **`@clemperl/domain` ne naît pas ici.** La spec T0 le prévoyait « avec la première
  règle métier » ; T1a n'en contient aucune. Vérifier une adresse est un mécanisme
  d'authentification, pas une règle de domaine. Il naîtra en T1b, avec la validation
  d'un vendeur.

## 4. Architecture

### 4.1 `@clemperl/auth`

Seul endroit où Better Auth est configuré : connexion à la base, secret, fournisseurs,
durée de session, domaine du cookie. Il exporte l'instance et les utilitaires de lecture
de session.

Dépend de `@clemperl/db` et `@clemperl/core`, et de rien d'autre. Comme eux, il est
**compilé** et expose `dist/` : NestJS le consomme, et NestJS exécute du JavaScript sur
Node.

```
apps/*        → auth, core, db, ui, i18n
auth          → core, db
db            → core
core          → —
```

### 4.2 Montage dans les applications Next

Deux lignes par front, dans `src/app/api/auth/[...all]/route.ts` :

```typescript
import { auth } from "@clemperl/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

Trois branchements, une seule configuration. Ce n'est pas de la duplication : la
configuration vit dans le package, seul le raccordement est répété.

Aucune requête d'authentification ne traverse de domaine, donc **aucun CORS** et aucun
cookie en contexte croisé — la classe de problèmes la plus coûteuse à diagnostiquer sur
ce sujet.

### 4.3 Session partagée entre sous-domaines

`crossSubDomainCookies` pose le cookie de session sur le domaine parent :
`.${DEV_HOST}` en développement, `.clemperl.com` en production. La variable `DEV_HOST`
de T0 pilote les deux.

C'est la raison pour laquelle T0 a écarté `*.localhost` au profit de sslip.io : un nom
en `.localhost` est résolu par chaque appareil vers lui-même et ne porte aucun domaine
parent partageable.

### 4.4 Lecture de session depuis NestJS

L'API importe `@clemperl/auth` et lit la session depuis les en-têtes de la requête. Pas
de vérification de jeton écrite à la main, pas de secret dupliqué, pas de format à tenir
synchronisé entre deux implémentations.

### 4.5 Port d'envoi de courriels

Dans `@clemperl/core` : une interface `IEmailSender`, et des adapters. En développement,
un conteneur **Mailpit** capture tout et offre une boîte de réception consultable dans
le navigateur — aucun courriel ne part vers une vraie adresse, et on lit exactement ce
qu'un utilisateur recevrait.

C'est la même forme que les adapters de paiement prévus en T4 : un port, des adapters,
et un domaine qui ne connaît que le port.

**La vérification étant obligatoire pour tous, l'envoi de courriels devient critique :**
si un message ne part pas, personne ne peut utiliser la plateforme. La sonde de santé
des applications ne couvre pas cette dépendance en T1a ; c'est une suite à traiter quand
un adapter de production sera branché.

## 5. Modèle de données

La CLI Better Auth (`@better-auth/cli generate`) produit les modèles `user`, `session`,
`account` et `verification` directement dans `packages/db/prisma/schema.prisma`. Le
schéma exact n'est pas recopié ici : il est généré, et le recopier dans un document le
condamnerait à diverger. C'est la CLI qui fait foi.

**Les conventions de T0 s'appliquent au résultat** : tables au singulier, colonnes en
`snake_case` via `@map` et `@@map`, identifiants `cuid2`, `createdAt` et `updatedAt`
systématiques.

**La table `user` de T0 est remplacée** par celle de Better Auth. La migration ne porte
que sur une ligne — le compte d'administration créé par le seed. C'est trivial
aujourd'hui et ce le sera de moins en moins : c'est précisément pourquoi la décision se
prend maintenant.

`E_USER_ROLE` perd sa valeur `VENDOR` et ne conserve que `CUSTOMER` et `ADMIN`. Être
vendeur deviendra l'existence d'une entité liée et validée, pas une valeur d'énumération.

Les champs métier qui doivent vivre sur l'utilisateur passent par `additionalFields` de
Better Auth, et restent donc visibles dans le même modèle Prisma.

## 6. Parcours et états

Un compte connaît trois états, et T1a n'en gère pas d'autre :

| État | Ce qui est possible |
|---|---|
| Inscrit, adresse non vérifiée | Rien, hors la page invitant à vérifier et le renvoi du courriel |
| Vérifié | Accès normal à la boutique et à l'espace client |
| Administration | Accès au back-office de la plateforme |

Un compte ouvert par Google arrive **vérifié d'office** : le fournisseur a déjà prouvé
l'adresse, et redemander une vérification n'apporterait rien.

Le message opposé à un compte non vérifié est en français, nommé par une clé de
traduction, et suit la convention des exceptions localisées : `message: string[]` et une
clé imbriquée par domaine.

## 7. Tests

La pyramide de `docs/conventions/tests.md` s'applique, et **T1a est la tranche où la
couche intégration apparaît réellement**.

| Couche | Ce qu'elle couvre ici |
|---|---|
| Unit | Règles pures : validation de formulaire, état d'un compte, dérivation de la locale |
| Integration | Inscription, vérification et connexion contre une base PostgreSQL réelle |
| E2E API | `supertest` : l'API accepte une session valide et refuse son absence |
| E2E navigateur | Playwright : parcours complet, et session partagée entre trois sous-domaines |

**Testcontainers depuis un conteneur** : le développement étant intégralement
conteneurisé, la suite d'intégration tourne à l'intérieur du conteneur `api`. Celui-ci
doit donc joindre le démon Docker — montage de `/var/run/docker.sock` — et les
conteneurs créés par Testcontainers sont **frères** du conteneur `api`, pas enfants :
ils ne sont joignables ni par `localhost` ni par les ports publiés, mais par leur nom
sur le réseau Docker. Ce point a été signalé en T0 sans être vérifié ; le plan
d'implémentation doit le prouver en l'exécutant, pas le supposer.

Un seul conteneur de base par run, démarré par `globalSetup`, chaque fichier y créant sa
base logique. Les deux suites lourdes ne partagent jamais un processus.

## 8. Critères d'acceptation

T1a est terminée quand ces neuf points sont vérifiés :

1. Une inscription par adresse e-mail aboutit, et le courriel de vérification arrive
   dans Mailpit
2. Un compte non vérifié se voit refuser l'accès, avec un message en français
3. Après vérification, la connexion aboutit
4. La connexion Google aboutit, et le compte est vérifié d'office
5. Connecté sur la boutique, on l'est aussi sur l'espace vendeur et l'administration,
   **sans se reconnecter**
6. La déconnexion depuis une application vaut pour les trois
7. La réinitialisation de mot de passe fonctionne de bout en bout, courriel compris
8. L'API NestJS reconnaît une session valide et refuse proprement son absence
9. `pnpm lint`, `typecheck`, `test`, `test:e2e` et les seuils de couverture passent

Le cinquième ne se vérifie qu'avec un vrai navigateur sur les trois sous-domaines :
c'est Playwright qui l'établit, pas une assertion sur un en-tête.

## 9. Risques

| Risque | Impact | Traitement |
|---|---|---|
| **Better Auth est jeune** (1.7.5) | API susceptible d'évoluer plus vite qu'une bibliothèque mûre | Tout l'usage passe par `@clemperl/auth` ; un changement d'API ne touche qu'un package |
| **Testcontainers dans un conteneur** | La couche intégration ne démarre pas | Socket Docker monté, conteneurs joints par leur nom de réseau ; à prouver à l'exécution avant d'écrire la première suite |
| **Le cookie de domaine parent ne se partage pas** | Le critère 5 tombe, et avec lui la raison d'être de l'architecture à quatre applications | `crossSubDomainCookies` est vérifié comme présent dans le paquet ; le partage effectif se prouve par Playwright sur trois sous-domaines |
| **L'envoi de courriels devient un point de panne unique** | Plus aucune inscription ne peut aboutir | Accepté en T1a, où Mailpit ne dépend de rien d'externe. À traiter quand un adapter de production sera branché : sonde de santé et repli |
| **La migration de la table `user`** | Perte du compte d'administration | Une seule ligne, recréée par le seed ; la migration est jouée sur base jetable avant toute base partagée |
| **Google impose un domaine et des URL de retour** | Le parcours OAuth ne peut pas être testé en local | Les URL de retour incluent les noms sslip.io de développement ; à défaut, le parcours e-mail reste complet et testable seul |
