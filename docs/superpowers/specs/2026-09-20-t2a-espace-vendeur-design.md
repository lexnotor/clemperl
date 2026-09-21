# ClemPerl — T2a : L'espace vendeur et sa boutique

**Date** : 2026-09-20
**Statut** : design validé, en attente de plan d'implémentation
**Tranche** : T2a — première des quatre sous-tranches de T2
**S'appuie sur** : `2026-09-19-t1b-vendeurs-design.md`, livrée

---

## 1. Objectif

Faire que `apps/vendor` cesse d'être une coquille. Un vendeur dont la boutique a été
validée s'y connecte, voit sa boutique, et **corrige ce qu'il a le droit de corriger**.

C'est la dette que T1b a explicitement laissée ouverte et que la passation nomme :
« Aucun écran ne permet de modifier une boutique validée. Un nom mal saisi se corrige en
base. » Aujourd'hui l'écran de validation promet littéralement au vendeur que « votre
espace vendeur ouvrira avec la prochaine tranche ». Cette tranche est celle-là.

## 2. T2 se découpe en quatre

T0 avait cadré T2 d'un bloc : « un vendeur publie un produit à variantes avec images
optimisées (Supabase Storage → BullMQ → sharp) ; le storefront le liste, le filtre et
l'affiche ». Ce périmètre contient quatre sujets qui se livrent et se vérifient
séparément, et dont un seul — le pipeline médias — introduit à lui seul un worker, une
file et un binaire natif.

| Sous-tranche | Objet | Dépend de |
|---|---|---|
| **T2a** | L'espace vendeur et sa boutique | T1b |
| T2b | Le produit et ses variantes | T2a |
| T2c | Le pipeline médias (BullMQ, sharp, worker) | T2b |
| T2d | Le catalogue public : liste, filtres, fiche | T2b |

T2a passe en premier parce qu'elle est le **lieu** : on ne gère pas un catalogue sans un
endroit où le gérer. Elle est aussi la plus petite, ce qui remet une PR de taille
relisible après les 158 fichiers de T1b.

## 3. Décisions de cadrage

| Sujet | Décision | Raison |
|---|---|---|
| Appartenance multiple | **Une seule boutique par compte, pour l'instant** | Le schéma autorise plusieurs `vendor_members`, mais rien ne les crée : T1b fabrique une boutique et un `OWNER`, et aucune invitation n'existe. L'état est inatteignable. Le sélecteur de boutique arrivera avec les invitations |
| Champs légaux | **Commercial modifiable, légal en lecture seule** | Un administrateur les a validés *contre les pièces téléversées*. Les laisser réécrire, c'est permettre de passer la validation avec une société et d'en exploiter une autre |
| `slug` | **Figé à la validation** | Il partira dans les URL publiques en T2d. Un slug est une identité, un nom est un libellé : changer l'un ne doit pas casser l'autre |
| Membres et invitations | **Hors périmètre** | Courriel, jeton, expiration, changement de rôle, retrait : une matière propre, qui mérite son cycle |
| Langue | **Français seul**, sans next-intl | Motif établi des deux back-offices : `apps/admin` et `apps/vendor` importent `@clemperl/i18n/messages/<app>/fr.json` directement. Seul le storefront est bilingue |

### Pourquoi ne pas extraire une garde partagée

`apps/admin` a déjà une garde, et la tentation est d'en faire un package commun. Les deux
ne partagent que l'appel à `getSession`. L'administration vérifie **un rôle** porté par la
session, plus un amorçage sur base vierge ; le vendeur vérifie **une relation** en base.
Ce sont deux règles qui vont diverger — la seconde gagnera un sélecteur de boutique, la
première jamais. Les fondre maintenant, c'est créer le couplage qu'il faudra défaire.

### Pourquoi ne pas replier l'espace vendeur dans le storefront

Mettre la fiche sous `/vendor` dans `apps/storefront` supprimerait une application à
déployer et toute question d'origine croisée. Mais T0 a décidé quatre fronts, et T1a a
construit *et prouvé* le partage de session pour cette forme-là. Revenir dessus est une
décision de niveau T0 ; elle n'a pas sa place dans une sous-tranche de catalogue.

## 4. Périmètre

### Inclus

- Une garde d'accès propre à `apps/vendor`, appelée explicitement
- Un layout réel : en-tête, polices, jetons — l'application n'a aujourd'hui **aucune** des
  trois
- L'écran `/shop` : les cinq champs commerciaux modifiables, les cinq champs légaux en
  lecture
- L'action serveur qui enregistre, et la validation partagée avec le dossier de
  candidature
- Un `CheckboxField` dans `@clemperl/ui`
- Le raccordement depuis l'écran de validation du storefront
- Un parcours navigateur qui prouve l'ensemble

### Exclu explicitement

- Les produits, les variantes, les médias — T2b et T2c
- Les membres, les invitations, les rôles
- La modification des champs légaux, par quelque chemin que ce soit
- La fermeture ou la suspension d'une boutique
- Toute statistique, tableau de bord ou chiffre

## 5. L'accès

`apps/vendor/src/lib/session.ts` expose `requireVendorMembership()`. Elle est appelée
**en tête de chaque page et de chaque action serveur**, jamais posée dans un layout — T1b
a écrit la raison et elle vaut ici mot pour mot : un layout ne s'interpose pas de façon
garantie devant tout ce qu'il enveloppe, et une garde qui *semble* protéger est pire
qu'une garde absente.

| État | Réponse |
|---|---|
| Pas de session | redirection vers `/sign-in` de la boutique |
| Session, aucune appartenance | redirection vers `/become-a-vendor` de la boutique |
| Appartenance | retourne `{ session, vendor, membership }` |

Une boutique dont `deletedAt` n'est pas nul compte comme absente.

### L'écart délibéré avec l'administration

`requireAdministrator` répond `notFound()` à un compte sans le rôle, et la spec T1b
explique pourquoi : répondre « interdit » confirmerait à un curieux que la route existe.

Ici, non. L'espace vendeur est **public par destination** : n'importe qui peut devenir
vendeur, le sous-domaine est annoncé, et son existence n'est un secret pour personne. Un
404 ne protégerait rien et laisserait un utilisateur légitime — quelqu'un dont le dossier
est encore à l'étude — devant une porte muette. Le renvoyer au formulaire de candidature
lui dit où il en est.

## 6. La lecture et l'écriture

Nouveau `packages/db/src/repositories/vendor.repository.ts`, sur la forme des
repositories existants : `prisma` en premier paramètre, aucun état de module.

```ts
readVendorForMember(prisma, userId)
updateShopProfile(prisma, { vendorId, shopName, shopDescription,
                            contactEmail, contactPhone, categories })
```

### La signature est la garde

`updateShopProfile` ne prend **que** les cinq champs commerciaux. `legalForm`,
`legalName`, `registrationNumber`, `taxNumber`, `country` et `slug` ne sont pas
« ignorés » : ils sont absents de la signature. Une règle qu'on ne peut pas contourner
par inadvertance vaut mieux qu'une règle qu'on vérifie à l'entrée — la vérification
s'oublie au prochain appelant, la signature non.

### Couverture

`packages/db/vitest.config.ts` exclut déjà `src/repositories/**` du rapport : ce que ces
fonctions garantissent ne se prouve pas avec un client simulé. Les nouvelles fonctions
sont donc couvertes par la suite d'**intégration**, sous Jest dans le conteneur `api`,
contre un vrai PostgreSQL via Testcontainers — `apps/api/test/vendor-shop.int-spec.ts`,
à côté de `vendor-application.int-spec.ts`.

## 7. La validation, sans recopie

`application-submission.schema.ts` porte déjà les règles des cinq champs commerciaux,
dont celle de `shopName` et son commentaire coûteux (deux caractères latins au moins,
sinon aucun slug). Les recopier dans un second schéma créerait deux dates de divergence.

Elles sont donc **extraites** et les deux schémas les partagent :

```ts
// packages/domain/src/schemas/shop-profile.schema.ts
export const shopProfileFields = {
    shopName: /* … règle inchangée … */,
    shopDescription: …,
    contactEmail: …,
    contactPhone: …,
    categories: …,
};

export const shopProfileSchema = z.object(shopProfileFields);
```

```ts
// application-submission.schema.ts
export const applicationSubmissionSchema = z.object({
    ...shopProfileFields,
    legalForm: …, legalName: …, /* … */
});
```

Les deux schémas ne peuvent plus diverger : il n'y a qu'une définition.

## 8. L'écran

`/shop` porte la fiche, et T2b ajoutera `/products` à côté sans rien renommer.

`/` **reste l'accueil existant**, et n'est pas transformé en redirection. Cette page
affiche l'adresse de la session sous `data-testid="utilisateur"`, et
`e2e/session-sharing.spec.ts` s'en sert pour prouver sur les trois fronts qu'une session
ouverte sur la boutique vaut ici — y compris le cas « anonyme » après déconnexion.
L'accueil de l'administration porte le même rôle, et son code le dit. Elle gagne
simplement un lien vers `/shop`.

```
┌────────────────────────────────────────────┐
│ ClemPerl                      Ma boutique  │
├────────────────────────────────────────────┤
│  Atelier Lumière                           │
│                                            │
│  Nom de la boutique                        │
│  Atelier Lumière                           │
│  ──────────────────────────────            │
│  Description                               │
│  …                                         │
│  ──────────────────────────────            │
│  Catégories   ☑ Joaillerie  ☐ Habillement  │
│                                            │
│              [ Enregistrer ]               │
│                                            │
│  Informations légales                      │
│  ──────────────────────────────            │
│  SRL · Lumière & Cie · BE0123456789        │
│  Pour les corriger, écrivez à              │
│  l'administration.                         │
└────────────────────────────────────────────┘
```

Une seule page : les champs légaux sont *sous* le formulaire, dans la même vue, en lecture.
Les mettre ailleurs obligerait le vendeur à chercher pour constater qu'il ne peut rien y
faire.

### Le layout est à construire, pas à retoucher

`apps/vendor/src/app/layout.tsx` est aujourd'hui `<html lang="fr"><body>{children}</body></html>`.
Pas d'en-tête, pas de `next/font`, donc **aucune** des polices que `@clemperl/ui` déclare
en repli. Il reçoit la même forme que celui de l'administration : `Spectral` et `Archivo`
par `next/font`, et un en-tête sur filet. L'en-tête reste statique — il ne lit pas la
boutique, parce qu'un layout ne peut pas garder l'accès et n'a donc rien à faire des
données protégées. Le nom de la boutique est le `h1` de la page.

### Un contrôle à ajouter

Les catégories sont multiples et `@clemperl/ui` n'a aucun contrôle à cocher. T2a ajoute
`CheckboxField`, sur la forme des champs existants : le filet, pas la boîte.

## 9. Le raccordement

`apps/storefront/…/become-a-vendor/components/application-approved.tsx` affiche
aujourd'hui : « Votre espace vendeur ouvrira avec la prochaine tranche. » La copie devient
un lien vers `NEXT_PUBLIC_VENDOR_URL`, dans `fr.json` **et** `en.json`.

Laisser cette phrase en place après avoir ouvert l'espace serait un mensonge que rien ne
signalerait : aucun test ne lit une promesse.

## 10. Deux pièges de T1b qui s'appliquent ici

Tous deux sont dans `docs/pieges.md`, tous deux ont coûté une séance.

**Un fichier `"use server"` ne peut exporter que des fonctions asynchrones.** L'état
initial du formulaire va dans un `types/*.interface.ts`, jamais à côté de l'action. Une
constante exportée depuis un module `"use server"` arrive `undefined` au client, et
l'erreur qu'on lit parle d'autre chose.

**Une page qui lit la session porte `force-dynamic`.** Sans lui, Next sert un rendu figé
et un utilisateur déconnecté continue d'y voir ses données.

## 11. Tests

Le dépôt a changé de règle : on écrit un test quand il vaut la peine d'être écrit, pas
pour chaque bout de code.

| Quoi | Comment | Pourquoi celui-là |
|---|---|---|
| Le parcours entier | `e2e/vendor-shop.spec.ts`, Playwright sur un build de production | C'est la seule preuve qui traverse la garde, le cookie partagé entre deux applications, le formulaire et la base |
| `shopProfileSchema` | Vitest, `@clemperl/domain` | Pur, instantané, et le cliquet du package est à 100 % |
| `CheckboxField` | Vitest, `@clemperl/ui` | Idem, et un contrôle à cocher mal câblé ne se voit pas à l'œil |
| `updateShopProfile` | Jest + Testcontainers, dans le conteneur `api` | Ce qu'on veut prouver — que le `slug` et le légal ne bougent pas — est une propriété de la base |
| La garde | *aucun test isolé* | Le parcours navigateur la traverse trois fois. Un test qui simule `getSession` prouverait la simulation |

Le parcours : dossier approuvé → le vendeur se connecte sur la boutique → ouvre l'espace
vendeur → renomme → recharge → le nouveau nom est là **et le `slug` n'a pas bougé**.

## 12. Critères d'acceptation

T2a est terminée quand ces sept points sont vérifiés :

1. Un compte sans session qui ouvre `apps/vendor` arrive sur la connexion de la boutique
2. Un compte connecté sans boutique arrive sur le formulaire de candidature, pas sur un 404
3. Un vendeur voit sa boutique : les cinq champs commerciaux dans un formulaire, les cinq
   champs légaux en lecture, et aucun moyen d'éditer les seconds
4. Il renomme sa boutique, enregistre, recharge : le nom a changé, le `slug` non
5. Une saisie invalide est refusée **sans rien écrire**, avec un message en français
6. L'écran de validation du storefront mène à l'espace vendeur, en français et en anglais
7. `pnpm lint`, `typecheck`, `test`, `test:e2e`, la suite d'intégration et les seuils de
   couverture passent

Le quatrième ne se vérifie qu'avec un vrai navigateur sur deux applications : c'est
Playwright qui l'établit.

## 13. Risques

| Risque | Impact | Traitement |
|---|---|---|
| **Extraire les champs partagés casse le dossier de candidature** | T1b régresse en silence : le parcours de dépôt est déjà couvert, mais une règle perdue ne se voit qu'à la saisie | L'extraction ne change aucune règle, seulement leur emplacement. `e2e/vendor-application.spec.ts` est rejoué avant de livrer |
| **Le layout de `apps/vendor` n'a jamais rendu de style** | L'écran paraît fonctionner et sort nu — le piège Tailwind de T1b, où un bouton sans style passait un test « est visible » | Les `@source` de `@clemperl/ui` couvrent déjà `apps/*/src/**`. À constater **à l'œil** dans le navigateur, pas seulement par un test |
| **La boutique et le dossier portent les mêmes champs à deux dates** | Un vendeur renomme sa boutique, le dossier garde l'ancien nom, et l'administration croit à une incohérence | Décision de T1b, inchangée : le dossier est l'instantané de ce qui a été déclaré, jamais resynchronisé. À écrire dans la fiche si l'administration s'en plaint |
| **Deux onglets enregistrent en même temps** | La dernière écriture gagne, l'autre disparaît sans avertir | Accepté : la boutique n'a qu'un membre tant que les invitations n'existent pas. À rouvrir avec elles |
| **Aucun écran ne permet de corriger le légal** | Un vendeur qui change de forme juridique n'a aucun chemin | Accepté et écrit au périmètre : le chemin est l'administration. Il devient un vrai manque le jour où l'administration n'a pas d'écran non plus |
