# Code

**Portée : tout le dépôt**, sauf exceptions signalées.

## Commentaires : expliquer, jamais narrer

Un commentaire explique **le pourquoi**, pas le quoi. Le code montre le quoi. Le
commentaire dit la décision derrière : pourquoi cette approche et pas une autre, quelle
contrainte elle contourne, ce qui casse si quelqu'un la change sans connaître le contexte.

**Et il parle du code tel qu'il est, au présent.** Tout ce qui compare avec un état
antérieur va dans le message de commit, jamais dans le fichier.

Interdit dans un commentaire : « la forme précédente faisait X », « avant, ce cas passait
parce que… », « un audit l'a signalé comme critique », « ceci était recopié vingt fois »,
« mesuré le <date> : réponse 200 ». Ce sont des faits sur le passé, pas sur le code.

**Trois étages, pas deux :**

| Où           | Dit quoi                                | Temps                 |
| ------------ | --------------------------------------- | --------------------- |
| Le code      | le quoi                                 | —                     |
| Le commentaire | pourquoi ça doit RESTER ainsi (contrainte) | présent, intemporel |
| Le commit    | pourquoi ça A CHANGÉ (motif)            | passé, daté           |

L'historique chassé du code ne disparaît pas pour autant : il a son fichier dédié,
[le registre des pièges](../pieges.md).

Le commit est une trace du passé ; le commentaire est un garde-fou pour le futur. Un bon
commentaire de contrainte finit d'ailleurs souvent par un impératif : « ne pas remettre
un `canActivate` ici, parce que… ».

**Comment convertir plutôt que supprimer.** Garder la substance, changer le temps et le
cadrage. « La forme précédente interrogeait le TYPE, donc le moteur ignorait les
conditions » devient « Le sujet soumis doit être la LIGNE : passer le type ferait ignorer
les conditions ». Même information, utile sans connaître l'histoire. Le même fait peut
légitimement figurer aux deux endroits — ce qui ne doit pas être dupliqué, c'est le
cadrage temporel. Ne pas appauvrir le commentaire pour « laisser la place » au commit.

**Un commentaire est :** court (lisible en trois secondes), en langage courant comme une
note laissée à un collègue, présent en tête de chaque fichier non trivial (une ligne
disant son rôle) et au-dessus de tout bloc qui n'est pas évident — absent quand le code
se suffit.

**Un commentaire n'est pas :** une paraphrase du code (`// boucle sur les items`), du
remplissage (`// important`), une liste à puces structurée en commentaire inline, un texte
qui se lit comme de la doc générée, ni un changelog.

### Un commentaire ne renvoie jamais à un paragraphe de document

> **Ne jamais écrire « voir `docs/20` §2 », « spec §4.6 », « plan tâche 7 » dans un
> commentaire de code.** Écrire le raisonnement lui-même, à l'endroit où il s'applique.

Les specs, les plans et les documents de convention **se suppriment et se renumérotent**.
Un commentaire qui pointe vers un paragraphe survit à sa cible : la référence devient
fausse sans que rien ne le signale, et le lecteur suivant part chercher une section qui
n'existe plus, ou pire, en lit une autre qui a pris le numéro.

Le comportement à retenir n'est pas « citer moins » mais **rapatrier le pourquoi dans le
code** : un commentaire doit se suffire à lui-même, sans qu'on ait à ouvrir un autre
fichier pour le comprendre.

```typescript
// ❌ La référence pourrit, et le commentaire ne dit rien tout seul.
// Le listener sur `enrollment.created` (`docs/20` §2) matérialise un abonnement.

// ✅ Le fait est dans le commentaire ; il reste vrai si le document disparaît.
// Un listener matérialise un abonnement et ses charges dans la foulée de
// l'inscription : quelques millisecondes après un `POST create`, la ligne porte
// déjà des dépendants.
```

Renvoyer vers du **code** reste légitime : un nom de test, d'entité ou de service est
greppable et se déplace avec les refactors (`enrollment-dependents-coverage.spec.ts`,
`SettlementAllocationChecker`). C'est le paragraphe numéroté d'un document qui est
interdit.

Les documents, eux, continuent de se citer entre eux : la règle porte sur les
commentaires de code, pas sur `docs/`.

## Conventions de nommage

**Portée : tout le dépôt**, sauf mention contraire ligne par ligne.

### Fichiers

Tous les fichiers en **kebab-case**, avec un suffixe qui dit le rôle :

    transaction-status.enum.ts
    payment-result.interface.ts
    card-authorize-request.dto.ts

**Exception, non négociable : les fichiers imposés par Next.js.** `page.tsx`,
`layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`, `not-found.tsx`, les segments
dynamiques `[slug]/` et les groupes `(marketing)/` sont des conventions de routage de
l'App Router : les renommer casse l'application.

### Enums

- Syntaxe **object-literal + `as const`**, jamais le mot-clé `enum` natif de TypeScript.
- Préfixe obligatoire `E_` suivi de MAJUSCULE_SNAKE_CASE.
- Dans le même fichier, exporter un **type** dérivé de l'enum.
- Un enum par fichier, dans le dossier `enums/`.

```typescript
export const E_TRANSACTION_STATUS = {
    PENDING: "PENDING",
    AUTHORIZED: "AUTHORIZED",
    CAPTURED: "CAPTURED",
    FAILED: "FAILED",
} as const;

export type TTransactionStatus =
    (typeof E_TRANSACTION_STATUS)[keyof typeof E_TRANSACTION_STATUS];
```

### Interfaces, types, constantes

- Interface : préfixe `I` + PascalCase, dans `interfaces/`.
- Type : préfixe `T` + PascalCase, dans `types/`.
- Constante : MAJUSCULE_SNAKE_CASE + `as const`, dans `constants/`.

**Exception : les props de composants React** suivent l'écosystème — `ButtonProps`,
`ProductCardProps`, sans préfixe. C'est ce que produisent shadcn/ui et les bibliothèques
tierces ; préfixer imposerait une retouche manuelle à chaque installation et à chaque
mise à jour de composant.

### Un par fichier, et ses deux assouplissements

Les dossiers `enums/`, `interfaces/`, `types/`, `constants/` existent dans **toutes** les
applications et tous les packages, pas seulement dans l'API. La règle « un par fichier »
tient pour tout ce qui est partagé, avec deux assouplissements :

1. **Plusieurs composants peuvent cohabiter dans un même fichier** quand ils forment un
   ensemble — un composant et ses sous-composants d'affichage.
2. **Une interface utilisée par un seul consommateur** peut être déclarée dans le fichier
   de ce consommateur plutôt que dans `interfaces/`. Dès qu'un second fichier l'importe,
   elle rejoint `interfaces/`.

Ce second assouplissement ne vaut **pas** dans un fichier `.tsx` : un composant ne déclare
que ses propres props, et tout type métier en sort quel que soit son nombre de
consommateurs (voir [Next et React](next.md)).

### Récapitulatif

| Élément            | Format                       | Exemple                      | Portée                      |
| ------------------ | ---------------------------- | ---------------------------- | --------------------------- |
| Enum               | `E_` + MAJUSCULE_SNAKE       | `E_TRANSACTION_STATUS`       | tout le dépôt               |
| Type d'enum        | `T` + PascalCase             | `TTransactionStatus`         | tout le dépôt               |
| Interface          | `I` + PascalCase             | `IPaymentResult`             | tout le dépôt               |
| Props de composant | PascalCase + `Props`         | `ButtonProps`                | fronts Next, `@clemperl/ui` |
| Type               | `T` + PascalCase             | `TCardBrand`                 | tout le dépôt               |
| Constante          | MAJUSCULE_SNAKE + `as const` | `PAYMENT_CONFIG`             | tout le dépôt               |
| DTO                | PascalCase + `Dto`           | `CardAuthorizeRequestDto`    | `apps/api`                  |
| Schéma Zod         | camelCase + `Schema`         | `createOrderSchema`          | fronts Next, `@clemperl/core` |
| Fichier            | kebab-case                   | `transaction-status.enum.ts` | tout le dépôt               |
| Table DB           | snake_case, **singulier**    | `user`, `product_variant`    | `@clemperl/db`              |

**Aucune ligne « Entité ».** ClemPerl n'a pas de classes d'entité : les types générés par
Prisma (`User`, `ProductVariant`) font foi et ne se renomment pas. Le suffixe `Entity`
décrit un ORM à classes — TypeORM, MikroORM — que ce dépôt n'utilise pas.

**Les DTO sont propres à l'API.** Ce sont des classes NestJS validées par décorateurs.
Côté Next, les entrées de server actions se valident avec des schémas Zod, dont on dérive
le type : `createOrderSchema` et `TCreateOrderInput`.

ClemPerl n'utilise **pas** de schémas PostgreSQL : toutes les tables vivent dans `public`.
Les cloisonner par domaine se décide avant les premières migrations, pas après.

`user` est un mot réservé en SQL. Prisma échappe les identifiants qu'il génère, donc les
migrations passent ; toute requête écrite à la main doit quoter `"user"`.
