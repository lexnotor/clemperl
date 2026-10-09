# T3, panier et commande : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un visiteur remplit un panier sans compte, se connecte, commande, et chaque
boutique reçoit sa commande et la fait avancer.

**Architecture:** le panier n'existe côté serveur que pour un compte ; sans compte il vit
dans le navigateur et ne porte que des identifiants. La validation relit tout dans une
transaction, groupe par boutique, et écrit une commande par groupe dont chaque ligne fige ce
qu'elle vend. L'avancement reprend la table de transitions en donnée écrite en T1b.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7.10, PostgreSQL, next-intl,
Tailwind 4, Vitest, Jest + Testcontainers, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-t3-panier-commande-design.md`

## Global Constraints

- **Aucun commit intermédiaire.** Un seul commit à la fin. La spec et ce plan y voyagent.
  Les étapes « Commit » des gabarits ne s'appliquent pas ici.
- **Aucun tiret quadratin (`—`) ni demi-cadratin (`–`) en prose.** Voir
  `docs/conventions/redaction.md`.
- **Ce qu'une machine lit est en anglais** : identifiants, noms de fichiers, segments d'URL,
  clés de traduction. **Ce qu'un humain lit est en français**, dans `packages/i18n`.
- **Les dépôts ne reçoivent que des PRIMITIVES**, jamais un type de `packages/domain`, qui
  dépend déjà de `@clemperl/db` : l'importer fermerait un cycle que Turbo ne saurait pas
  ordonner. La page traduit avant d'appeler.
- **Aucun prix formaté dans un composant client.** `formatPrice` tire `@clemperl/core`, donc
  nodemailer, donc `node:net`.
- **Le cliquet de couverture ne descend jamais.**
- Après toute modification de `schema.prisma`, de `package.json` ou de `turbo.json` :
  `pnpm docker:up`.

## Review Focus

1. **Une quantité hors bornes** venue du formulaire ou du panier local : zéro, négative,
   mille, `NaN`. Chacune retombe sur une valeur sûre ou retire la ligne, sans lever. Testé
   en tâche 2.
2. **Un panier local bricolé** : identifiant inventé, article d'une autre devise, doublon,
   liste de deux cents entrées. La remontée refuse nommément et ne range rien de douteux.
   Testé en tâche 3.
3. **Un article devenu inéligible entre l'affichage et la validation** : produit dépublié,
   supprimé, boutique fermée, dernière image prête retirée. La commande ne part pas amputée.
   Testé en tâche 4.
4. **Deux validations simultanées du même panier** : un seul jeu de commandes, jamais deux.
   Testé en tâche 4.
5. **Une commande relue après la disparition de tout** : produit supprimé, boutique fermée.
   Elle reste lisible, c'est la raison d'être du figeage. Testé en tâche 4.

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
| --- | --- |
| `packages/db/prisma/migrations/<horodatage>_cart_and_orders/migration.sql` | L'enum, les quatre tables, les index |
| `packages/domain/src/constants/order-transitions.constant.ts` | La table des transitions, en donnée |
| `packages/domain/src/utils/order-transitions.utils.ts` | `canAdvanceOrder`, `advanceOrder` |
| `packages/domain/src/utils/order-transitions.utils.spec.ts` | Leur test exhaustif |
| `packages/domain/src/errors/order.error.ts` | `ForbiddenOrderTransitionError` |
| `packages/domain/src/utils/cart.utils.ts` | Bornes de quantité, groupement par boutique, totaux, libellé de déclinaison |
| `packages/domain/src/utils/cart.utils.spec.ts` | Son test |
| `packages/domain/src/schemas/checkout.schema.ts` | Adresse, téléphone, mot |
| `packages/domain/src/schemas/checkout.schema.spec.ts` | Son test |
| `packages/db/src/repositories/cart.repository.ts` | Lire, ajouter, changer la quantité, retirer, remonter |
| `packages/db/src/repositories/order.repository.ts` | Valider, lire, lister, faire avancer |
| `apps/api/test/cart-repository.int-spec.ts` | Le test d'intégration du panier |
| `apps/api/test/order-repository.int-spec.ts` | Celui des commandes |
| `apps/storefront/src/lib/local-cart.ts` | Le panier du navigateur, et sa remontée |
| `apps/storefront/src/app/[locale]/cart/page.tsx` | Le panier |
| `apps/storefront/src/app/[locale]/cart/actions.ts` | Ses actions serveur |
| `apps/storefront/src/app/[locale]/cart/components/cart-lines.tsx` | Client, quantités et retraits |
| `apps/storefront/src/app/[locale]/cart/components/local-cart-sync.tsx` | Client, remonte le panier local |
| `apps/storefront/src/app/[locale]/checkout/page.tsx` | Adresse, mot, récapitulatif |
| `apps/storefront/src/app/[locale]/checkout/checkout-form.tsx` | Client, le formulaire |
| `apps/storefront/src/app/[locale]/checkout/actions.ts` | La validation |
| `apps/storefront/src/app/[locale]/orders/page.tsx` | Mes commandes |
| `apps/storefront/src/app/[locale]/orders/[reference]/page.tsx` | Le détail |
| `apps/storefront/src/app/[locale]/shops/[shop]/[product]/components/add-to-cart.tsx` | Client, remplace le `mailto:` |
| `apps/storefront/src/app/[locale]/shops/[shop]/[product]/actions.ts` | L'ajout au panier serveur depuis la fiche |
| `apps/vendor/src/app/orders/page.tsx` | Les commandes de la boutique |
| `apps/vendor/src/app/orders/[id]/page.tsx` | Le détail et l'avancement |
| `apps/vendor/src/app/orders/[id]/actions.ts` | L'action d'avancement |
| `e2e/order.spec.ts` | Les parcours |

**Modifiés :**

| Fichier | Changement |
| --- | --- |
| `packages/db/prisma/schema.prisma` | `E_ORDER_STATUS`, `Cart`, `CartItem`, `Order`, `OrderItem`, et les relations inverses sur `User`, `Vendor`, `ProductVariant` |
| `packages/db/src/index.ts`, `repositories/index.ts` | Exporter l'enum et les deux dépôts |
| `packages/domain/src/constants/index.ts`, `utils/index.ts`, `schemas/index.ts`, `errors/index.ts`, `browser.ts` | Exporter ce qui précède |
| `packages/i18n/messages/storefront/fr.json`, `en.json` | Sections `cart` et `orders` |
| `packages/i18n/messages/vendor/fr.json` | Section `orders` et sa navigation |
| `apps/storefront/src/app/[locale]/layout.tsx` | Lien « Panier » |
| `apps/storefront/src/app/[locale]/shops/[shop]/[product]/page.tsx` | Le bouton remplace le `mailto:` |
| `apps/vendor/src/app/layout.tsx` | Lien « Mes commandes » |
| `e2e/global-setup.ts` | Les six routes neuves |
| `docs/passation.md` | État de T3 |

---

## Task 1: Le modèle et les transitions

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20261009120000_cart_and_orders/migration.sql`
- Create: `packages/domain/src/constants/order-transitions.constant.ts`
- Create: `packages/domain/src/utils/order-transitions.utils.ts`
- Test: `packages/domain/src/utils/order-transitions.utils.spec.ts`
- Modify: `packages/db/src/index.ts`, `packages/domain/src/constants/index.ts`,
  `packages/domain/src/utils/index.ts`, `packages/domain/src/browser.ts`

**Interfaces:**
- Produces:
  ```ts
  export const E_ORDER_ACTION = { ACCEPT: "ACCEPT", SHIP: "SHIP", CANCEL: "CANCEL" } as const;
  export type TOrderAction = (typeof E_ORDER_ACTION)[keyof typeof E_ORDER_ACTION];
  export type TOrderStatus = "PLACED" | "ACCEPTED" | "SHIPPED" | "CANCELLED";
  export const ORDER_TRANSITIONS: Readonly<Record<TOrderStatus, Partial<Record<TOrderAction, TOrderStatus>>>>;
  export function canAdvanceOrder(from: TOrderStatus, action: TOrderAction): boolean;
  export function advanceOrder(from: TOrderStatus, action: TOrderAction): TOrderStatus;
  export function allowedOrderActions(from: TOrderStatus): TOrderAction[];
  ```
  Et l'enum Prisma `E_ORDER_STATUS`, exporté par `@clemperl/db` et par `@clemperl/db/enums`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `packages/domain/src/utils/order-transitions.utils.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import { E_ORDER_ACTION } from "../constants/order-transitions.constant.js";
import {
    advanceOrder,
    allowedOrderActions,
    canAdvanceOrder,
} from "./order-transitions.utils.js";

describe("les transitions d'une commande", () => {
    it("accepte ou annule une commande qui vient d'être passée", () => {
        expect(advanceOrder("PLACED", E_ORDER_ACTION.ACCEPT)).toBe("ACCEPTED");
        expect(advanceOrder("PLACED", E_ORDER_ACTION.CANCEL)).toBe("CANCELLED");
    });

    it("expédie ou annule une commande acceptée", () => {
        expect(advanceOrder("ACCEPTED", E_ORDER_ACTION.SHIP)).toBe("SHIPPED");
        expect(advanceOrder("ACCEPTED", E_ORDER_ACTION.CANCEL)).toBe("CANCELLED");
    });

    // On n'expédie pas ce qui n'a pas été accepté : l'ordre des étapes est la règle, et
    // c'est la table qui la porte, pas une cascade de conditions dans un écran.
    it("refuse d'expédier une commande qui vient d'être passée", () => {
        expect(canAdvanceOrder("PLACED", E_ORDER_ACTION.SHIP)).toBe(false);
        expect(() => advanceOrder("PLACED", E_ORDER_ACTION.SHIP)).toThrow();
    });

    it("refuse toute action depuis un état terminal", () => {
        for (const terminal of ["SHIPPED", "CANCELLED"] as const) {
            for (const action of Object.values(E_ORDER_ACTION)) {
                expect(canAdvanceOrder(terminal, action)).toBe(false);
                expect(() => advanceOrder(terminal, action)).toThrow();
            }
            expect(allowedOrderActions(terminal)).toEqual([]);
        }
    });

    // L'écran n'affiche QUE les boutons que cette liste rend : une action impossible ne
    // se grise pas, elle ne s'affiche pas.
    it("rend les actions permises depuis chaque état", () => {
        expect(allowedOrderActions("PLACED").sort()).toEqual(["ACCEPT", "CANCEL"]);
        expect(allowedOrderActions("ACCEPTED").sort()).toEqual(["CANCEL", "SHIP"]);
    });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @clemperl/domain exec vitest run src/utils/order-transitions.utils.spec.ts`
Expected: FAIL, `Cannot find module './order-transitions.utils.js'`.

- [ ] **Step 3: Écrire la table des transitions**

Créer `packages/domain/src/constants/order-transitions.constant.ts` :

```ts
export const E_ORDER_ACTION = {
    ACCEPT: "ACCEPT",
    SHIP: "SHIP",
    CANCEL: "CANCEL",
} as const;

export type TOrderAction = (typeof E_ORDER_ACTION)[keyof typeof E_ORDER_ACTION];

export type TOrderStatus = "PLACED" | "ACCEPTED" | "SHIPPED" | "CANCELLED";

// Une DONNÉE plutôt qu'une cascade de conditions : la lire suffit à connaître tout le
// système, et un état sans entrée est terminal. Même forme que les transitions de
// candidature écrites en T1b, pour la même raison.
//
// Seul le VENDEUR fait avancer. L'acheteur lit le même état et n'annule pas : une
// annulation touche un vendeur qui a peut-être déjà emballé, et ce qu'il faut alors est un
// échange, pas un bouton.
//
// T4 insérera son état de paiement entre `PLACED` et `ACCEPTED` en ajoutant deux lignes
// ici, sans toucher à un seul écran.
export const ORDER_TRANSITIONS: Readonly<
    Record<TOrderStatus, Partial<Record<TOrderAction, TOrderStatus>>>
> = {
    PLACED: { ACCEPT: "ACCEPTED", CANCEL: "CANCELLED" },
    ACCEPTED: { SHIP: "SHIPPED", CANCEL: "CANCELLED" },
    SHIPPED: {},
    CANCELLED: {},
};
```

- [ ] **Step 4: Écrire les trois fonctions**

Créer `packages/domain/src/utils/order-transitions.utils.ts` :

```ts
import {
    ORDER_TRANSITIONS,
    type TOrderAction,
    type TOrderStatus,
} from "../constants/order-transitions.constant.js";
import { ForbiddenOrderTransitionError } from "../errors/index.js";

export function canAdvanceOrder(from: TOrderStatus, action: TOrderAction): boolean {
    return ORDER_TRANSITIONS[from][action] !== undefined;
}

export function advanceOrder(from: TOrderStatus, action: TOrderAction): TOrderStatus {
    const to = ORDER_TRANSITIONS[from][action];
    if (to === undefined) {
        throw new ForbiddenOrderTransitionError(from, action);
    }
    return to;
}

// L'écran vendeur construit ses boutons depuis CETTE liste. Une action impossible ne
// s'affiche pas grisée, elle ne s'affiche pas : un bouton qu'on ne peut pas presser est
// une promesse que l'écran ne tient pas.
export function allowedOrderActions(from: TOrderStatus): TOrderAction[] {
    return Object.keys(ORDER_TRANSITIONS[from]) as TOrderAction[];
}
```

Créer aussi `packages/domain/src/errors/order.error.ts`, et l'ajouter au barillet
`packages/domain/src/errors/index.ts` :

```ts
import { DomainError } from "@clemperl/core";
import type { TOrderAction, TOrderStatus } from "../constants/index.js";

// Une erreur à elle, et non celle des candidatures : cette dernière est typée sur
// `TApplicationStatus` et porte un message qui parle de dossier. Un vendeur qui lirait
// « Ce dossier a déjà été traité » à propos d'une commande ne comprendrait rien.
export class ForbiddenOrderTransitionError extends DomainError {
    constructor(from: TOrderStatus, action: TOrderAction) {
        super({
            i18nKey: "errors.order.forbidden_transition",
            i18nArgs: { from, action },
            fallbackMessage: `Transition ${action} interdite depuis l'état ${from}.`,
        });
    }
}
```

C'est un garde-fou que l'écran ne montre jamais : il ne rend que les actions permises, donc
cette erreur ne se lève que sur un formulaire rejoué ou bricolé.

- [ ] **Step 5: Lancer le test et vérifier qu'il passe**

Run: `pnpm --filter @clemperl/domain exec vitest run src/utils/order-transitions.utils.spec.ts`
Expected: PASS, cinq tests.

- [ ] **Step 6: Exporter depuis les barillets**

Dans `packages/domain/src/constants/index.ts`, `packages/domain/src/utils/index.ts` et
`packages/domain/src/errors/index.ts`, ajouter les trois `export * from` correspondants.

**Et SURTOUT PAS dans `packages/domain/src/browser.ts`.** `order-transitions.utils.ts`
importe `../errors/index.js`, qui tire `@clemperl/core`, donc nodemailer, donc `node:net` :
l'exporter depuis le point d'entrée navigateur ferait échouer l'assemblage Turbopack du
premier composant client qui l'importerait, avec une erreur qui ne nomme aucun de ces
maillons. L'en-tête de `browser.ts` raconte ce piège, et il faut le lire avant d'y toucher.

Rien côté client n'en a besoin : l'écran qui construit les boutons, en tâche 7, est un
composant SERVEUR. Le jour où un composant client en aurait besoin, c'est la tâche qui en a
besoin qui exportera le fichier de constantes, qui lui n'importe rien.

- [ ] **Step 7: Déclarer le modèle**

Dans `packages/db/prisma/schema.prisma`, ajouter l'enum après `E_COLLECTION_STATUS` :

```prisma
enum E_ORDER_STATUS {
  PLACED
  ACCEPTED
  SHIPPED
  CANCELLED

  @@map("order_status")
}
```

Puis les quatre modèles, à la fin du fichier, exactement comme la section 4 de la spec les
décrit. Les copier depuis la spec sans les réécrire : elle porte les commentaires qui
expliquent `SetNull`, `Restrict` et l'unicité.

- [ ] **Step 8: Ajouter les relations inverses**

Prisma refuse le schéma sans elles. Dans `model User`, après `vendorMemberships` :

```prisma
  cart   Cart?
  orders Order[]
```

Dans `model Vendor`, après `products` :

```prisma
  orders Order[]
```

Dans `model ProductVariant`, après `values` :

```prisma
  cartItems  CartItem[]
  orderItems OrderItem[]
```

- [ ] **Step 9: Produire et appliquer la migration**

```bash
mkdir -p packages/db/prisma/migrations/20261009120000_cart_and_orders
docker exec clemperl_dev_api sh -c "cd /app/packages/db && pnpm exec prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --script" \
  | grep -v "^Loaded Prisma config" \
  > packages/db/prisma/migrations/20261009120000_cart_and_orders/migration.sql
pnpm docker:up
docker exec clemperl_dev_api sh -c "cd /app/packages/db && pnpm exec prisma migrate deploy"
```

Expected: le fichier contient `CREATE TYPE "order_status"` et quatre `CREATE TABLE`, puis
`Applied`.

Le drapeau est `--to-schema`, et non `--to-schema-datamodel` : ce dernier n'existe plus en
Prisma 7.10.

- [ ] **Step 10: Exporter l'enum**

Dans `packages/db/src/index.ts`, ajouter `E_ORDER_STATUS` à la liste d'exports
d'énumérations, en ordre alphabétique. `@clemperl/db/enums` le reçoit tout seul, c'est un
fichier généré par Prisma.

- [ ] **Step 11: Vérifier la tâche**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 15/15 à chaque fois, seuils tenus.

---

## Task 2: Les règles pures du panier

**Files:**
- Create: `packages/domain/src/utils/cart.utils.ts`
- Test: `packages/domain/src/utils/cart.utils.spec.ts`
- Create: `packages/domain/src/schemas/checkout.schema.ts`
- Test: `packages/domain/src/schemas/checkout.schema.spec.ts`
- Modify: `packages/domain/src/utils/index.ts`, `schemas/index.ts`, `browser.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MAX_CART_QUANTITY = 100;
  export function boundQuantity(raw: unknown): number;          // 0 retire, borné à 100
  export function variantLabel(values: readonly { optionName: string; valueLabel: string }[]): string;
  export function groupByShop<T extends { shopSlug: string }>(lines: readonly T[]): { shopSlug: string; lines: T[] }[];
  export function sumLines(lines: readonly { unitAmount: number; quantity: number }[]): number;
  export const checkoutSchema: z.ZodObject<...>;                // name, phone, line, city, country, note?
  ```

- [ ] **Step 1: Écrire le test qui échoue**

Créer `packages/domain/src/utils/cart.utils.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
    MAX_CART_QUANTITY,
    boundQuantity,
    groupByShop,
    sumLines,
    variantLabel,
} from "./cart.utils.js";

describe("boundQuantity", () => {
    it("garde une quantité ordinaire", () => {
        expect(boundQuantity(3)).toBe(3);
        expect(boundQuantity("3")).toBe(3);
    });

    // Rien de ce qui vient d'un formulaire ou d'un panier local n'est digne de confiance,
    // et rien n'y lève : une page publique ne rend pas une erreur parce qu'un champ a été
    // bricolé.
    it("rend zéro pour tout ce qui n'est pas un nombre utilisable", () => {
        for (const brut of [undefined, "abc", NaN, {}]) {
            expect(boundQuantity(brut)).toBe(0);
        }
    });

    // `null`, `""` et `[]` valent zéro pour `Number`, donc ils retirent la ligne. C'est le
    // comportement voulu, mais il arrive par une autre route que `NaN` : le test le dit
    // plutôt que de le mélanger au cas précédent.
    it("retire la ligne pour ce qui se lit comme zéro", () => {
        for (const brut of [null, "", []]) {
            expect(boundQuantity(brut)).toBe(0);
        }
    });

    it("rend zéro pour une quantité nulle ou négative", () => {
        expect(boundQuantity(0)).toBe(0);
        expect(boundQuantity(-5)).toBe(0);
    });

    // Ce qui protège n'est pas l'analyseur, c'est le PLAFOND. « 1e9 » se lit comme un
    // milliard, et c'est la borne qui le ramène à cent.
    it("borne par le haut", () => {
        expect(boundQuantity(1000)).toBe(MAX_CART_QUANTITY);
        expect(boundQuantity("1e9")).toBe(MAX_CART_QUANTITY);
    });

    it("tronque une quantité fractionnaire", () => {
        expect(boundQuantity(2.9)).toBe(2);
        // Tronquée à zéro, donc la ligne disparaît : une demi-unité n'est pas une
        // quantité qu'une boutique sait honorer.
        expect(boundQuantity(0.5)).toBe(0);
    });

    // L'infini n'est PAS plafonné à cent, il retire la ligne : `Number.isFinite` le
    // refuse avant que la borne ne le voie. Sûr, mais c'est l'exception à la règle que le
    // commentaire du module énonce, donc le test la fixe.
    it("retire la ligne pour un infini", () => {
        expect(boundQuantity(Infinity)).toBe(0);
        expect(boundQuantity("1e999")).toBe(0);
    });
});

describe("variantLabel", () => {
    it("joint les axes et leurs valeurs, dans l'ordre reçu", () => {
        expect(
            variantLabel([
                { optionName: "Taille", valueLabel: "L" },
                { optionName: "Couleur", valueLabel: "Noir" },
            ]),
        ).toBe("Taille : L, Couleur : Noir");
    });

    // Un produit sans axe a UNE variante, de clé vide. Son libellé est vide, et l'écran
    // n'affiche alors rien plutôt qu'un séparateur orphelin.
    it("rend une chaîne vide pour un produit sans axe", () => {
        expect(variantLabel([])).toBe("");
    });
});

describe("groupByShop", () => {
    it("regroupe en préservant l'ordre d'apparition des boutiques", () => {
        const lignes = [
            { shopSlug: "b", id: 1 },
            { shopSlug: "a", id: 2 },
            { shopSlug: "b", id: 3 },
        ];

        expect(groupByShop(lignes)).toEqual([
            { shopSlug: "b", lines: [{ shopSlug: "b", id: 1 }, { shopSlug: "b", id: 3 }] },
            { shopSlug: "a", lines: [{ shopSlug: "a", id: 2 }] },
        ]);
    });

    it("rend une liste vide pour un panier vide", () => {
        expect(groupByShop([])).toEqual([]);
    });
});

describe("sumLines", () => {
    it("somme le prix unitaire multiplié par la quantité", () => {
        expect(sumLines([{ unitAmount: 1850, quantity: 2 }, { unitAmount: 500, quantity: 1 }])).toBe(
            4200,
        );
    });

    it("rend zéro pour aucune ligne", () => {
        expect(sumLines([])).toBe(0);
    });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @clemperl/domain exec vitest run src/utils/cart.utils.spec.ts`
Expected: FAIL, `Cannot find module './cart.utils.js'`.

- [ ] **Step 3: Écrire les quatre fonctions**

Créer `packages/domain/src/utils/cart.utils.ts` :

```ts
// Cent. Au-delà ce n'est plus un panier de détail, et la borne évite qu'un champ bricolé
// produise une commande de dix mille articles que personne n'honorera.
export const MAX_CART_QUANTITY = 100;

// PURE, donc éprouvable exhaustivement. Rien de ce qui vient d'un formulaire ou d'un
// panier local n'est digne de confiance, et zéro signifie « retire la ligne », ce qui est
// le comportement voulu pour une quantité qu'on ne sait pas lire.
//
// Cette fonction ne lève sur rien qui puisse l'atteindre, ce qui n'est pas la même chose
// que ne jamais lever : `Number` jette un `TypeError` sur un `Symbol` ou sur un objet dont
// `valueOf` jette. Ni `JSON.parse` ni un champ de formulaire ne produisent cela, donc on
// ne s'en protège pas, mais autant le dire que de promettre une totalité qui est fausse.
//
// `Number` et non `Number.parseInt` : ce dernier s'arrête au premier caractère qu'il ne
// sait pas lire, donc « 1e9 » lui vaut `1`, un nombre parfaitement plausible issu d'une
// entrée qui ne l'est pas. `Number` le lit comme un milliard, et c'est alors le PLAFOND
// qui protège, ce qui est son travail.
export function boundQuantity(raw: unknown): number {
    const nombre = Math.trunc(Number(raw));
    if (!Number.isFinite(nombre) || nombre <= 0) {
        return 0;
    }
    return Math.min(nombre, MAX_CART_QUANTITY);
}

// « Taille : L, Couleur : Noir ». Construit à la validation et FIGÉ sur la ligne de
// commande : relire les axes ferait dire à une commande ce que le catalogue dit
// aujourd'hui, pas ce qui a été acheté.
export function variantLabel(
    values: readonly { optionName: string; valueLabel: string }[],
): string {
    return values.map((v) => `${v.optionName} : ${v.valueLabel}`).join(", ");
}

// L'ordre d'APPARITION, et non l'ordre alphabétique : l'acheteur a construit son panier
// dans un ordre, et le regrouper ne doit pas le rebattre sous ses yeux.
export function groupByShop<T extends { shopSlug: string }>(
    lines: readonly T[],
): { shopSlug: string; lines: T[] }[] {
    const groupes = new Map<string, T[]>();
    for (const ligne of lines) {
        const existant = groupes.get(ligne.shopSlug);
        if (existant) {
            existant.push(ligne);
        } else {
            groupes.set(ligne.shopSlug, [ligne]);
        }
    }
    return [...groupes].map(([shopSlug, lignes]) => ({ shopSlug, lines: lignes }));
}

// En unité mineure ENTIÈRE, sans jamais diviser : une division introduirait un flottant,
// et un centime perdu dans un total est un centime que personne ne retrouve.
export function sumLines(
    lines: readonly { unitAmount: number; quantity: number }[],
): number {
    return lines.reduce((total, ligne) => total + ligne.unitAmount * ligne.quantity, 0);
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `pnpm --filter @clemperl/domain exec vitest run src/utils/cart.utils.spec.ts`
Expected: PASS, quatorze tests.

- [ ] **Step 5: Écrire le test du schéma de validation**

Créer `packages/domain/src/schemas/checkout.schema.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import { checkoutSchema } from "./checkout.schema.js";

const valide = {
    name: "Awa Traoré",
    phone: "+32470000000",
    line: "12 rue des Tanneurs",
    city: "Bruxelles",
    country: "BE",
};

describe("checkoutSchema", () => {
    it("accepte une adresse ordinaire", () => {
        expect(checkoutSchema.safeParse(valide).success).toBe(true);
    });

    it("accepte un mot pour le vendeur", () => {
        expect(checkoutSchema.safeParse({ ...valide, note: "Emballage cadeau" }).success).toBe(
            true,
        );
    });

    it("refuse un champ d'adresse manquant", () => {
        for (const champ of ["name", "phone", "line", "city", "country"] as const) {
            // `delete` sur une copie, et non une destructuration qui écarte le champ :
            // celle-ci laisserait une variable que personne ne lit, et `eslint` la refuse.
            const sansLeChamp: Record<string, unknown> = { ...valide };
            delete sansLeChamp[champ];
            expect(checkoutSchema.safeParse(sansLeChamp).success).toBe(false);
        }
    });

    // Un pays sur deux lettres, comme `Vendor.country`. Une saisie libre rendrait le
    // regroupement par pays impossible le jour où la livraison arrivera.
    it("refuse un pays qui n'est pas un code à deux lettres", () => {
        expect(checkoutSchema.safeParse({ ...valide, country: "Belgique" }).success).toBe(false);
        expect(checkoutSchema.safeParse({ ...valide, country: "b" }).success).toBe(false);
        // Deux caractères, mais pas deux lettres : sans le motif, `.length(2)` l'accepte.
        expect(checkoutSchema.safeParse({ ...valide, country: "12" }).success).toBe(false);
    });

    // La même normalisation que la candidature vendeur, dont le test épingle déjà
    // « be » devenant « BE ».
    it("met le pays en majuscules", () => {
        const parse = checkoutSchema.safeParse({ ...valide, country: "be" });
        expect(parse.success && parse.data.country).toBe("BE");
    });

    it("refuse un mot démesuré", () => {
        expect(
            checkoutSchema.safeParse({ ...valide, note: "a".repeat(1001) }).success,
        ).toBe(false);
    });
});
```

- [ ] **Step 6: Lancer ce test et vérifier qu'il échoue**

Run: `pnpm --filter @clemperl/domain exec vitest run src/schemas/checkout.schema.spec.ts`
Expected: FAIL, `Cannot find module './checkout.schema.js'`.

- [ ] **Step 7: Écrire le schéma**

Créer `packages/domain/src/schemas/checkout.schema.ts` :

```ts
import { z } from "zod";

// L'adresse est saisie à chaque commande et FIGÉE dessus : l'acheteur peut déménager, et
// la commande doit dire où elle a été envoyée. Le carnet d'adresses viendra s'il sert, et
// il lira ces commandes.
export const checkoutFields = {
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(6).max(30),
    line: z.string().trim().min(4).max(200),
    city: z.string().trim().min(2).max(100),
    // Deux lettres MISES EN MAJUSCULES, exactement comme `Vendor.country` dans
    // `application-submission.schema.ts`. Sans la normalisation, « be » et « BE »
    // s'enregistrent comme deux valeurs distinctes, et tout regroupement par pays se
    // scinderait en silence le jour où la livraison arrivera. Le motif passe avant, parce
    // que `.length(2)` laisserait passer « 12 ».
    country: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/u).toUpperCase(),
    note: z.string().trim().max(1000).optional(),
};

export const checkoutSchema = z.object(checkoutFields);

export type TCheckout = z.infer<typeof checkoutSchema>;
```

- [ ] **Step 8: Lancer le test et vérifier qu'il passe**

Run: `pnpm --filter @clemperl/domain exec vitest run src/schemas/checkout.schema.spec.ts`
Expected: PASS, sept tests.

- [ ] **Step 9: Exporter et vérifier la couverture**

Ajouter les `export * from` dans `utils/index.ts`, `schemas/index.ts` et `browser.ts`. Le
sous-chemin navigateur en a besoin : le panier client borne ses quantités avec
`boundQuantity`, et le formulaire de validation lit `checkoutFields`.

Run: `pnpm --filter @clemperl/domain test`
Expected: PASS, branches à 100 %. Une branche manquante est un cas que les tests
ci-dessus n'exercent pas : l'ajouter plutôt que de baisser le seuil.

---

## Task 3: Le dépôt du panier

**Files:**
- Create: `packages/db/src/repositories/cart.repository.ts`
- Modify: `packages/db/src/repositories/index.ts`
- Test: `apps/api/test/cart-repository.int-spec.ts`

**Interfaces:**
- Consumes: `boundQuantity` de la tâche 2, appliqué par l'APPELANT, jamais par le dépôt.
- Produces:
  ```ts
  export const ERROR_CART_CURRENCY_MISMATCH = "CART_CURRENCY_MISMATCH";
  export interface ICartLine {
      variantId: string; quantity: number; unitAmount: number;
      productTitle: string; productSlug: string; imagePath: string;
      shopSlug: string; shopName: string; vendorId: string;
      optionValues: { optionName: string; valueLabel: string }[];
  }
  export async function readCart(prisma, userId: string): Promise<{ currency: string; lines: ICartLine[] } | null>;
  export async function addCartItem(prisma, input: { userId: string; variantId: string; quantity: number }): Promise<void>;
  export async function setCartItemQuantity(prisma, input: { userId: string; variantId: string; quantity: number }): Promise<void>;
  export async function mergeLocalCart(prisma, input: { userId: string; items: readonly { variantId: string; quantity: number }[] }): Promise<{ rejected: { variantId: string; reason: string }[] }>;
  export const CART_REJECTION = { ineligible: "ineligible", currency: "currency" } as const;
  ```

- [ ] **Step 1: Écrire le test d'intégration qui échoue**

Créer `apps/api/test/cart-repository.int-spec.ts`. Le fichier commence par les helpers que
toutes les suites de ce dépôt emploient, parce qu'un préfixe partagé fait que la panne se
lit dans la suite voisine :

```ts
import {
    CART_REJECTION,
    ERROR_CART_CURRENCY_MISMATCH,
    addCartItem,
    createProduct,
    mergeLocalCart,
    prisma,
    readCart,
    setCartItemQuantity,
    setProductStatus,
} from "@clemperl/db";

const PREFIX = "cart";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
let counter = 0;

async function createUser(): Promise<string> {
    counter += 1;
    const user = await prisma.user.create({
        data: {
            email: `${PREFIX}-${counter}@acheteur.test`,
            name: "Acheteuse",
            emailVerified: true,
        },
    });
    return user.id;
}

async function createShop(currency: string) {
    counter += 1;
    return prisma.vendor.create({
        data: {
            slug: `${PREFIX}-shop-${counter}`,
            shopName: `Atelier ${counter}`,
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: `contact-${counter}@atelier.test`,
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: `Atelier ${counter} SRL`,
            registrationNumber: "0123456789",
            country: "BE",
            currency: currency as never,
        },
    });
}

// Un produit PUBLIÉ complet, avec sa variante et son image prête. Sans l'image le dépôt
// refuse la publication, garantie solidifiée en T2c, et sans elle le panier le refuserait
// aussi.
async function publishedVariant(vendorId: string, currency: string, amount: number) {
    counter += 1;
    const { id } = await createProduct(prisma, {
        vendorId,
        slug: `${PREFIX}-p-${counter}`,
        title: `Sac cabas ${counter}`,
        description: DESCRIPTION,
        category: "LEATHER_GOODS",
        priceAmount: amount,
        expectedCurrency: currency,
    });
    await prisma.productImage.create({
        data: {
            productId: id,
            objectPath: `${id}/1111111${counter % 10}-2222-3333-4444-555555555555/original.jpg`,
            originalName: "photo.jpg",
            position: 0,
            status: "READY",
            width: 1200,
            height: 800,
        },
    });
    await setProductStatus(prisma, { productId: id, vendorId, publish: true });
    const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: id } });
    return { productId: id, variantId: variant.id };
}

afterAll(async () => {
    await prisma.$disconnect();
});

describe("addCartItem", () => {
    it("crée le panier au premier article et pose sa devise", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const { variantId } = await publishedVariant(shop.id, "EUR", 18000);

        await addCartItem(prisma, { userId, variantId, quantity: 2 });

        const panier = await readCart(prisma, userId);
        expect(panier?.currency).toBe("EUR");
        expect(panier?.lines).toHaveLength(1);
        expect(panier?.lines[0]?.quantity).toBe(2);
        expect(panier?.lines[0]?.unitAmount).toBe(18000);
    });

    // Un article, UNE ligne : l'index unique le garantit, et le dépôt incrémente plutôt
    // que de laisser la base refuser.
    it("incrémente la quantité au second ajout du même article", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const { variantId } = await publishedVariant(shop.id, "EUR", 5000);

        await addCartItem(prisma, { userId, variantId, quantity: 1 });
        await addCartItem(prisma, { userId, variantId, quantity: 2 });

        const panier = await readCart(prisma, userId);
        expect(panier?.lines).toHaveLength(1);
        expect(panier?.lines[0]?.quantity).toBe(3);
    });

    it("refuse une seconde devise", async () => {
        const userId = await createUser();
        const euro = await createShop("EUR");
        const cfa = await createShop("XOF");
        const premier = await publishedVariant(euro.id, "EUR", 5000);
        const second = await publishedVariant(cfa.id, "XOF", 30000);

        await addCartItem(prisma, { userId, variantId: premier.variantId, quantity: 1 });

        await expect(
            addCartItem(prisma, { userId, variantId: second.variantId, quantity: 1 }),
        ).rejects.toThrow(ERROR_CART_CURRENCY_MISMATCH);
    });

    // Un double-clic sur « Ajouter au panier » quand le panier n'existe pas encore : les
    // deux transactions tentent de créer le panier, et sans reprise le perdant remonte un
    // P2002 brut jusqu'à l'écran.
    it("encaisse deux premiers ajouts simultanés", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const { variantId } = await publishedVariant(shop.id, "EUR", 5000);

        const resultats = await Promise.allSettled([
            addCartItem(prisma, { userId, variantId, quantity: 1 }),
            addCartItem(prisma, { userId, variantId, quantity: 1 }),
        ]);

        expect(resultats.filter((r) => r.status === "rejected")).toHaveLength(0);
        const panier = await readCart(prisma, userId);
        expect(panier?.lines).toHaveLength(1);
    });

    it("refuse un article dont le produit n'est pas publié", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        counter += 1;
        const { id } = await createProduct(prisma, {
            vendorId: shop.id,
            slug: `${PREFIX}-draft-${counter}`,
            title: "Brouillon",
            description: DESCRIPTION,
            category: "APPAREL",
            priceAmount: 1000,
            expectedCurrency: "EUR",
        });
        const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: id } });

        await expect(
            addCartItem(prisma, { userId, variantId: variant.id, quantity: 1 }),
        ).rejects.toThrow();
    });
});

describe("setCartItemQuantity", () => {
    it("retire la ligne quand la quantité tombe à zéro", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const { variantId } = await publishedVariant(shop.id, "EUR", 5000);
        await addCartItem(prisma, { userId, variantId, quantity: 2 });

        await setCartItemQuantity(prisma, { userId, variantId, quantity: 0 });

        // Le panier vidé est SUPPRIMÉ, c'est ce qui libère sa devise, donc la lecture rend
        // `null` et non un panier à zéro ligne.
        expect(await readCart(prisma, userId)).toBeNull();
    });

    // La devise se libère avec le dernier article, sinon un panier vidé resterait
    // prisonnier de la devise de son premier achat.
    it("libère la devise quand le panier se vide", async () => {
        const userId = await createUser();
        const euro = await createShop("EUR");
        const cfa = await createShop("XOF");
        const premier = await publishedVariant(euro.id, "EUR", 5000);
        const second = await publishedVariant(cfa.id, "XOF", 30000);

        await addCartItem(prisma, { userId, variantId: premier.variantId, quantity: 1 });
        await setCartItemQuantity(prisma, { userId, variantId: premier.variantId, quantity: 0 });

        await expect(
            addCartItem(prisma, { userId, variantId: second.variantId, quantity: 1 }),
        ).resolves.toBeUndefined();
        expect((await readCart(prisma, userId))?.currency).toBe("XOF");
    });

    it("ne touche pas au panier d'un autre compte", async () => {
        const mien = await createUser();
        const autre = await createUser();
        const shop = await createShop("EUR");
        const { variantId } = await publishedVariant(shop.id, "EUR", 5000);
        await addCartItem(prisma, { userId: autre, variantId, quantity: 2 });

        await setCartItemQuantity(prisma, { userId: mien, variantId, quantity: 0 });

        expect((await readCart(prisma, autre))?.lines).toHaveLength(1);
    });
});

describe("mergeLocalCart", () => {
    it("range ce qui passe et nomme ce qui ne passe pas", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const bon = await publishedVariant(shop.id, "EUR", 5000);

        const { rejected } = await mergeLocalCart(prisma, {
            userId,
            items: [
                { variantId: bon.variantId, quantity: 2 },
                { variantId: "c00000000000000000000000", quantity: 1 },
            ],
        });

        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBe(CART_REJECTION.ineligible);
        expect((await readCart(prisma, userId))?.lines).toHaveLength(1);
    });

    // Le panier local peut mélanger des devises : le refus local existe, mais rien
    // n'empêche de bricoler la liste. La remontée garde la première devise rencontrée et
    // nomme le reste.
    it("ne garde qu'une devise et nomme les articles de l'autre", async () => {
        const userId = await createUser();
        const euro = await createShop("EUR");
        const cfa = await createShop("XOF");
        const premier = await publishedVariant(euro.id, "EUR", 5000);
        const second = await publishedVariant(cfa.id, "XOF", 30000);

        const { rejected } = await mergeLocalCart(prisma, {
            userId,
            items: [
                { variantId: premier.variantId, quantity: 1 },
                { variantId: second.variantId, quantity: 1 },
            ],
        });

        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBe(CART_REJECTION.currency);
        const panier = await readCart(prisma, userId);
        expect(panier?.currency).toBe("EUR");
        expect(panier?.lines).toHaveLength(1);
    });

    it("fusionne avec un panier déjà en base plutôt que de l'écraser", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const deja = await publishedVariant(shop.id, "EUR", 5000);
        const nouveau = await publishedVariant(shop.id, "EUR", 7000);
        await addCartItem(prisma, { userId, variantId: deja.variantId, quantity: 1 });

        await mergeLocalCart(prisma, {
            userId,
            items: [
                { variantId: deja.variantId, quantity: 2 },
                { variantId: nouveau.variantId, quantity: 1 },
            ],
        });

        const panier = await readCart(prisma, userId);
        expect(panier?.lines).toHaveLength(2);
        // Le local gagne sur la quantité : c'est ce que l'acheteur vient de manipuler.
        const ligne = panier?.lines.find((l) => l.variantId === deja.variantId);
        expect(ligne?.quantity).toBe(2);
    });

    it("rend un panier vide sans rien écrire pour une liste vide", async () => {
        const userId = await createUser();

        const { rejected } = await mergeLocalCart(prisma, { userId, items: [] });

        expect(rejected).toHaveLength(0);
        expect(await readCart(prisma, userId)).toBeNull();
    });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand cart-repository"`
Expected: FAIL, `addCartItem is not a function`.

- [ ] **Step 3: Écrire le dépôt**

Créer `packages/db/src/repositories/cart.repository.ts`. La forme suit `catalog.repository`
pour l'éligibilité, et `collection.repository` pour le verrou :

```ts
import { isUniqueViolation } from "../prisma-errors.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

export const ERROR_CART_CURRENCY_MISMATCH = "CART_CURRENCY_MISMATCH";
export const ERROR_CART_ITEM_INELIGIBLE = "CART_ITEM_INELIGIBLE";

// Les raisons d'un refus sont des CLÉS de traduction : la base ne range pas du français,
// et c'est un acheteur qui les lira.
export const CART_REJECTION = {
    ineligible: "ineligible",
    currency: "currency",
} as const;

export interface ICartLine {
    variantId: string;
    quantity: number;
    unitAmount: number;
    productTitle: string;
    productSlug: string;
    imagePath: string;
    shopSlug: string;
    shopName: string;
    vendorId: string;
    optionValues: { optionName: string; valueLabel: string }[];
}

// L'ÉLIGIBILITÉ, écrite une fois. Les mêmes conditions que la liste du catalogue : le
// produit est publié et non supprimé, sa boutique est ouverte et a une devise, et il a au
// moins une image prête. Les recopier ailleurs créerait une seconde vérité, ce que la
// revue de T2d a déjà coûté une fois.
export function eligibleVariantWhere(variantId: string) {
    return {
        id: variantId,
        product: {
            status: "PUBLISHED" as const,
            deletedAt: null,
            vendor: { deletedAt: null, currency: { not: null } },
            images: { some: { status: "READY" as const } },
        },
    };
}

const VARIANT_SELECT = {
    id: true,
    priceAmount: true,
    product: {
        select: {
            title: true,
            slug: true,
            vendor: { select: { id: true, slug: true, shopName: true, currency: true } },
            images: {
                where: { status: "READY" as const },
                orderBy: { position: "asc" as const },
                take: 1,
                select: { objectPath: true },
            },
        },
    },
    values: {
        select: {
            option: { select: { name: true, position: true } },
            optionValue: { select: { label: true } },
        },
    },
};

export async function readCart(
    prisma: PrismaClient,
    userId: string,
): Promise<{ currency: string; lines: ICartLine[] } | null> {
    const cart = await prisma.cart.findUnique({
        where: { userId },
        select: {
            currency: true,
            items: {
                orderBy: { id: "asc" },
                select: { quantity: true, variant: { select: VARIANT_SELECT } },
            },
        },
    });
    if (!cart) {
        return null;
    }

    return {
        currency: cart.currency,
        lines: cart.items.map((item) => ({
            variantId: item.variant.id,
            quantity: item.quantity,
            unitAmount: item.variant.priceAmount,
            productTitle: item.variant.product.title,
            productSlug: item.variant.product.slug,
            imagePath: item.variant.product.images[0]?.objectPath ?? "",
            shopSlug: item.variant.product.vendor.slug,
            shopName: item.variant.product.vendor.shopName,
            vendorId: item.variant.product.vendor.id,
            optionValues: [...item.variant.values]
                .sort((a, b) => a.option.position - b.option.position)
                .map((v) => ({ optionName: v.option.name, valueLabel: v.optionValue.label })),
        })),
    };
}

// Une SEULE tentative. L'enveloppe au-dessous rejoue sur collision d'unicité.
async function addCartItemOnce(
    prisma: PrismaClient,
    input: { userId: string; variantId: string; quantity: number },
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const variant = await tx.productVariant.findFirst({
            where: eligibleVariantWhere(input.variantId),
            select: { id: true, product: { select: { vendor: { select: { currency: true } } } } },
        });
        if (!variant) {
            throw new Error(ERROR_CART_ITEM_INELIGIBLE);
        }
        const devise = variant.product.vendor.currency as string;

        const cart = await tx.cart.upsert({
            where: { userId: input.userId },
            create: { userId: input.userId, currency: devise as never },
            update: {},
            select: { id: true, currency: true },
        });
        if (cart.currency !== devise) {
            throw new Error(ERROR_CART_CURRENCY_MISMATCH);
        }

        // `upsert` plutôt que `create` : l'index unique garantit une ligne par article, et
        // le second ajout du même article incrémente au lieu d'échouer.
        await tx.cartItem.upsert({
            where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
            create: { cartId: cart.id, variantId: input.variantId, quantity: input.quantity },
            update: { quantity: { increment: input.quantity } },
        });
    });
}

export async function addCartItem(
    prisma: PrismaClient,
    input: { userId: string; variantId: string; quantity: number },
): Promise<void> {
    try {
        await addCartItemOnce(prisma, input);
    } catch (error) {
        // Deux ajouts simultanés sur un panier qui n'existe pas ENCORE : les deux `upsert`
        // tentent la création, et le perdant reçoit un P2002. Ce n'est pas un refus, c'est
        // une course, et la seconde tentative trouve le panier que l'autre vient de créer.
        // Un double-clic sur « Ajouter au panier » suffit à la produire, donc elle n'a rien
        // d'exotique.
        //
        // Une seule reprise, et non une boucle : la course ne peut se produire qu'à la
        // création du panier, et après la reprise ce panier existe.
        if (!isUniqueViolation(error)) {
            throw error;
        }
        await addCartItemOnce(prisma, input);
    }
}

export async function setCartItemQuantity(
    prisma: PrismaClient,
    input: { userId: string; variantId: string; quantity: number },
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const cart = await tx.cart.findUnique({
            where: { userId: input.userId },
            select: { id: true },
        });
        if (!cart) {
            return;
        }

        if (input.quantity <= 0) {
            await tx.cartItem.deleteMany({
                where: { cartId: cart.id, variantId: input.variantId },
            });
        } else {
            await tx.cartItem.updateMany({
                where: { cartId: cart.id, variantId: input.variantId },
                data: { quantity: input.quantity },
            });
        }

        // Le panier vide est SUPPRIMÉ, et c'est ce qui libère sa devise. Le garder avec
        // zéro ligne l'enfermerait dans la devise de son premier achat.
        const restants = await tx.cartItem.count({ where: { cartId: cart.id } });
        if (restants === 0) {
            await tx.cart.delete({ where: { id: cart.id } });
        }
    });
}

export async function mergeLocalCart(
    prisma: PrismaClient,
    input: { userId: string; items: readonly { variantId: string; quantity: number }[] },
): Promise<{ rejected: { variantId: string; reason: string }[] }> {
    const rejected: { variantId: string; reason: string }[] = [];
    if (input.items.length === 0) {
        return { rejected };
    }

    for (const item of input.items) {
        try {
            // La quantité du LOCAL gagne : c'est ce que l'acheteur vient de manipuler.
            await setCartItemQuantity(prisma, {
                userId: input.userId,
                variantId: item.variantId,
                quantity: 0,
            });
            await addCartItem(prisma, {
                userId: input.userId,
                variantId: item.variantId,
                quantity: item.quantity,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            rejected.push({
                variantId: item.variantId,
                reason:
                    message === ERROR_CART_CURRENCY_MISMATCH
                        ? CART_REJECTION.currency
                        : CART_REJECTION.ineligible,
            });
        }
    }

    return { rejected };
}
```

Attention à la ligne de `mergeLocalCart` qui retire avant d'ajouter : elle rend la
remontée idempotente et fait gagner la quantité locale. Elle supprime le panier quand il
devient vide, donc l'ajout qui suit le recrée avec la bonne devise.

`isUniqueViolation` sert à la reprise de `addCartItem`, et c'est pour cela qu'elle est
importée.

**Ce que ce dépôt ne fait PAS, et pourquoi.** `setCartItemQuantity` ne vérifie aucune
éligibilité : monter la quantité d'un article devenu indisponible est sans danger, puisque
la validation le refuse, et la vérifier ici ferait échouer un simple retrait sur un article
dépublié entretemps. `mergeLocalCart` retire puis ajoute article par article, chacun dans sa
transaction : si l'ajout est refusé après le retrait, la quantité d'avant est perdue. Ce
n'est un problème que pour un article devenu inéligible, dont le retrait est précisément ce
qu'il faut faire, et le refus est nommé à l'acheteur.

- [ ] **Step 4: Exporter le dépôt**

Dans `packages/db/src/repositories/index.ts`, ajouter en ordre alphabétique :

```ts
export * from "./cart.repository.js";
```

- [ ] **Step 5: Lancer le test et vérifier qu'il passe**

Run: `docker exec clemperl_dev_api sh -c "cd /app && pnpm --filter @clemperl/db build && cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand cart-repository"`
Expected: PASS, quatorze tests.

- [ ] **Step 6: Lancer toute la couche**

Run: `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"`
Expected: toutes les suites au vert. Le préfixe propre évite toute collision avec les
suites voisines.

---

## Task 4: La validation en commandes

**Files:**
- Create: `packages/db/src/repositories/order.repository.ts`
- Modify: `packages/db/src/repositories/index.ts`
- Test: `apps/api/test/order-repository.int-spec.ts`

**Attention aux deux refus d'éligibilité, qui se ressemblent et ne sont pas le même.**
`ERROR_CART_ITEM_INELIGIBLE` (tâche 3) refuse l'AJOUT d'un article ; `ERROR_ITEM_INELIGIBLE`
ci-dessous refuse la VALIDATION parce qu'un article du panier est devenu inéligible depuis.
Deux moments, deux messages à l'écran, donc deux constantes.

**Interfaces:**
- Consumes: `readCart` et l'éligibilité de la tâche 3 ; `variantLabel`, `sumLines` de la
  tâche 2, appliqués par l'appelant quand ils sont purs.
- Produces:
  ```ts
  export const ERROR_CART_EMPTY = "CART_EMPTY";
  export const ERROR_TOTAL_CHANGED = "TOTAL_CHANGED";
  export const ERROR_ITEM_INELIGIBLE = "ORDER_ITEM_INELIGIBLE";
  export const ERROR_ORDER_NOT_FOUND = "ORDER_NOT_FOUND";
  export interface IPlaceOrders {
      userId: string; expectedTotal: number;
      shipTo: { name: string; phone: string; line: string; city: string; country: string };
      notes: Readonly<Record<string, string>>;   // slug de boutique vers son mot
      lines: readonly { variantId: string; label: string }[];  // libellés figés, calculés par l'appelant
  }
  export async function placeOrders(prisma, input: IPlaceOrders): Promise<{ references: string[] }>;
  export async function listOrdersForBuyer(prisma, buyerId: string): Promise<...>;
  export async function readOrderForBuyer(prisma, input: { buyerId: string; reference: string }): Promise<... | null>;
  export async function listOrdersForVendor(prisma, vendorId: string): Promise<...>;
  export async function readOrderForVendor(prisma, input: { vendorId: string; orderId: string }): Promise<... | null>;
  export async function setOrderStatus(prisma, input: { vendorId: string; orderId: string; status: string }): Promise<void>;
  ```

- [ ] **Step 1: Écrire le test d'intégration qui échoue**

**Les assertions de refus emploient `rejects.toMatchObject({ message: CONST })`, et JAMAIS
`rejects.toThrow(CONST)`.** Ce dernier compare par SOUS-CHAÎNE, et le message d'une erreur
de validation Prisma cite la ligne de code fautive, laquelle contient le nom de la
constante. L'assertion passe alors pour la mauvaise raison : la tâche 3 a mesuré un test
qui restait vert alors que la condition qu'il éprouvait avait été retirée du prédicat.

Créer `apps/api/test/order-repository.int-spec.ts`, avec les mêmes helpers que la tâche 3
mais un préfixe `order`, puis :

```ts
describe("placeOrders", () => {
    it("produit une commande par boutique et vide le panier", async () => {
        const userId = await createUser();
        const premiere = await createShop("EUR");
        const seconde = await createShop("EUR");
        const a = await publishedVariant(premiere.id, "EUR", 5000);
        const b = await publishedVariant(seconde.id, "EUR", 3000);
        await addCartItem(prisma, { userId, variantId: a.variantId, quantity: 2 });
        await addCartItem(prisma, { userId, variantId: b.variantId, quantity: 1 });

        const { references } = await placeOrders(prisma, {
            userId,
            expectedTotal: 13000,
            shipTo: SHIP_TO,
            notes: {},
            lines: [
                { variantId: a.variantId, label: "" },
                { variantId: b.variantId, label: "" },
            ],
        });

        expect(references).toHaveLength(2);
        expect(await readCart(prisma, userId)).toBeNull();

        const commandes = await prisma.order.findMany({
            where: { reference: { in: references } },
            include: { items: true },
        });
        expect(commandes.map((c) => c.vendorId).sort()).toEqual([premiere.id, seconde.id].sort());
        expect(commandes.reduce((t, c) => t + c.totalAmount, 0)).toBe(13000);
    });

    // Le prix AFFICHÉ est celui qui engage. Sans ce refus, un acheteur serait débité d'un
    // montant qu'il n'a jamais vu.
    it("refuse quand le total recalculé diffère de celui qu'on lui annonce", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addCartItem(prisma, { userId, variantId: a.variantId, quantity: 1 });

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: 4000,
                shipTo: SHIP_TO,
                notes: {},
                lines: [{ variantId: a.variantId, label: "" }],
            }),
        ).rejects.toMatchObject({ message: ERROR_TOTAL_CHANGED });

        // RIEN n'est écrit, et le panier survit.
        expect(await prisma.order.count({ where: { buyerId: userId } })).toBe(0);
        expect((await readCart(prisma, userId))?.lines).toHaveLength(1);
    });

    it("refuse quand un article est devenu inéligible, sans amputer la commande", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        const b = await publishedVariant(shop.id, "EUR", 3000);
        await addCartItem(prisma, { userId, variantId: a.variantId, quantity: 1 });
        await addCartItem(prisma, { userId, variantId: b.variantId, quantity: 1 });
        await setProductStatus(prisma, { productId: b.productId, vendorId: shop.id, publish: false });

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: 8000,
                shipTo: SHIP_TO,
                notes: {},
                lines: [
                    { variantId: a.variantId, label: "" },
                    { variantId: b.variantId, label: "" },
                ],
            }),
        ).rejects.toMatchObject({ message: ERROR_ITEM_INELIGIBLE });

        expect(await prisma.order.count({ where: { buyerId: userId } })).toBe(0);
    });

    it("refuse un panier vide", async () => {
        const userId = await createUser();

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: 0,
                shipTo: SHIP_TO,
                notes: {},
                lines: [],
            }),
        ).rejects.toMatchObject({ message: ERROR_CART_EMPTY });
    });

    // Deux onglets qui valident le même panier. Sans verrou, les deux lisent un panier
    // plein et écrivent chacun leur jeu de commandes : l'acheteur paie deux fois.
    it("ne produit qu'un seul jeu de commandes pour deux validations simultanées", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addCartItem(prisma, { userId, variantId: a.variantId, quantity: 1 });

        const commande = {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            lines: [{ variantId: a.variantId, label: "" }],
        };
        await Promise.allSettled([
            placeOrders(prisma, commande),
            placeOrders(prisma, commande),
        ]);

        expect(await prisma.order.count({ where: { buyerId: userId } })).toBe(1);
    });

    // LA raison d'être du figeage. Une commande est une pièce comptable : elle doit dire
    // ce qui a été acheté quand le catalogue ne le dit plus.
    it("reste lisible après renommage, suppression du produit et fermeture de la boutique", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addCartItem(prisma, { userId, variantId: a.variantId, quantity: 1 });
        const { references } = await placeOrders(prisma, {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            lines: [{ variantId: a.variantId, label: "Taille : L" }],
        });

        // Les trois coups que le critère 6 nomme : renommer, supprimer, fermer. La
        // suppression du produit emporte ses variantes en cascade, et c'est le `SetNull`
        // qui empêche la ligne de commande de partir avec elles.
        await prisma.product.update({
            where: { id: a.productId },
            data: { title: "Titre changé après coup" },
        });
        await prisma.product.delete({ where: { id: a.productId } });
        await prisma.vendor.update({ where: { id: shop.id }, data: { deletedAt: new Date() } });

        const commande = await readOrderForBuyer(prisma, {
            buyerId: userId,
            reference: references[0] as string,
        });
        expect(commande?.items[0]?.productTitle).toContain("Sac cabas");
        expect(commande?.items[0]?.productTitle).not.toContain("changé après coup");
        expect(commande?.items[0]?.unitAmount).toBe(5000);
        expect(commande?.items[0]?.variantLabel).toBe("Taille : L");
        expect(commande?.items[0]?.variantId).toBeNull();
        // La boutique est fermée, et la commande sait encore de qui elle vient.
        expect(commande?.vendor.shopName).toContain("Atelier");
    });

    it("fige le mot destiné à chaque boutique", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addCartItem(prisma, { userId, variantId: a.variantId, quantity: 1 });

        const { references } = await placeOrders(prisma, {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: { [shop.slug]: "Emballage cadeau" },
            lines: [{ variantId: a.variantId, label: "" }],
        });

        const commande = await prisma.order.findFirstOrThrow({
            where: { reference: references[0] },
        });
        expect(commande.note).toBe("Emballage cadeau");
        expect(commande.shipToCity).toBe(SHIP_TO.city);
    });
});

describe("l'isolement des commandes", () => {
    it("un acheteur ne lit pas la commande d'un autre", async () => {
        const mien = await createUser();
        const autre = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addCartItem(prisma, { userId: autre, variantId: a.variantId, quantity: 1 });
        const { references } = await placeOrders(prisma, {
            userId: autre,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            lines: [{ variantId: a.variantId, label: "" }],
        });

        await expect(
            readOrderForBuyer(prisma, { buyerId: mien, reference: references[0] as string }),
        ).resolves.toBeNull();
    });

    it("un vendeur ne lit pas la commande d'une autre boutique", async () => {
        const userId = await createUser();
        const mienne = await createShop("EUR");
        const autre = await createShop("EUR");
        const a = await publishedVariant(autre.id, "EUR", 5000);
        await addCartItem(prisma, { userId, variantId: a.variantId, quantity: 1 });
        await placeOrders(prisma, {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            lines: [{ variantId: a.variantId, label: "" }],
        });
        const commande = await prisma.order.findFirstOrThrow({ where: { vendorId: autre.id } });

        await expect(
            readOrderForVendor(prisma, { vendorId: mienne.id, orderId: commande.id }),
        ).resolves.toBeNull();
    });

    it("un vendeur ne fait pas avancer la commande d'une autre boutique", async () => {
        const userId = await createUser();
        const mienne = await createShop("EUR");
        const autre = await createShop("EUR");
        const a = await publishedVariant(autre.id, "EUR", 5000);
        await addCartItem(prisma, { userId, variantId: a.variantId, quantity: 1 });
        await placeOrders(prisma, {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            lines: [{ variantId: a.variantId, label: "" }],
        });
        const commande = await prisma.order.findFirstOrThrow({ where: { vendorId: autre.id } });

        await expect(
            setOrderStatus(prisma, {
                vendorId: mienne.id,
                orderId: commande.id,
                status: "ACCEPTED",
            }),
        ).rejects.toMatchObject({ message: ERROR_ORDER_NOT_FOUND });

        const relue = await prisma.order.findFirstOrThrow({ where: { id: commande.id } });
        expect(relue.status).toBe("PLACED");
    });
});
```

Déclarer en tête du fichier :

```ts
const SHIP_TO = {
    name: "Awa Traoré",
    phone: "+32470000000",
    line: "12 rue des Tanneurs",
    city: "Bruxelles",
    country: "BE",
};
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand order-repository"`
Expected: FAIL, `placeOrders is not a function`.

- [ ] **Step 3: Écrire la fabrication de référence**

Dans `packages/db/src/repositories/order.repository.ts`, en tête :

```ts
// Un alphabet SANS caractères ambigus : ni O ni 0, ni I ni 1. Cette référence se dicte au
// téléphone, et un `cuid` est un bon identifiant mais une mauvaise chose à épeler.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newReference(): string {
    const tirage = Array.from(
        { length: 6 },
        () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
    ).join("");
    return `CMD-${new Date().getFullYear()}-${tirage}`;
}
```

- [ ] **Step 4: Écrire `placeOrders`**

```ts
export async function placeOrders(
    prisma: PrismaClient,
    input: IPlaceOrders,
): Promise<{ references: string[] }> {
    return prisma.$transaction(async (tx) => {
        // Le VERROU d'abord. Sans lui, deux onglets lisent tous deux un panier plein et
        // écrivent chacun leur jeu de commandes : l'acheteur paie deux fois pour un seul
        // achat. Même mécanique que le verrou de devise de T2b et celui des collections.
        await tx.$executeRaw`SELECT id FROM carts WHERE user_id = ${input.userId} FOR UPDATE`;

        const cart = await tx.cart.findUnique({
            where: { userId: input.userId },
            select: {
                id: true,
                currency: true,
                items: { select: { variantId: true, quantity: true } },
            },
        });
        if (!cart || cart.items.length === 0) {
            throw new Error(ERROR_CART_EMPTY);
        }

        // Les prix sont RELUS ici, jamais repris du panier : un vendeur a pu les changer
        // pendant que l'acheteur remplissait son adresse.
        const lignes = [];
        for (const item of cart.items) {
            const variant = await tx.productVariant.findFirst({
                where: eligibleVariantWhere(item.variantId),
                select: {
                    id: true,
                    priceAmount: true,
                    product: {
                        select: {
                            title: true,
                            vendorId: true,
                            vendor: { select: { slug: true } },
                            images: {
                                where: { status: "READY" as const },
                                orderBy: { position: "asc" as const },
                                take: 1,
                                select: { objectPath: true },
                            },
                        },
                    },
                },
            });
            // Un article devenu inéligible interrompt TOUT : une commande amputée en
            // silence est pire qu'un refus, l'acheteur croirait avoir ce qu'il n'a plus.
            if (!variant) {
                throw new Error(ERROR_ITEM_INELIGIBLE);
            }
            lignes.push({
                variantId: variant.id,
                quantity: item.quantity,
                unitAmount: variant.priceAmount,
                productTitle: variant.product.title,
                imagePath: variant.product.images[0]?.objectPath ?? "",
                vendorId: variant.product.vendorId,
                shopSlug: variant.product.vendor.slug,
                label: input.lines.find((l) => l.variantId === variant.id)?.label ?? "",
            });
        }

        const total = lignes.reduce((t, l) => t + l.unitAmount * l.quantity, 0);
        if (total !== input.expectedTotal) {
            throw new Error(ERROR_TOTAL_CHANGED);
        }

        const parBoutique = new Map<string, typeof lignes>();
        for (const ligne of lignes) {
            const existant = parBoutique.get(ligne.vendorId);
            if (existant) {
                existant.push(ligne);
            } else {
                parBoutique.set(ligne.vendorId, [ligne]);
            }
        }

        const references: string[] = [];
        for (const [vendorId, groupe] of parBoutique) {
            const reference = newReference();
            await tx.order.create({
                data: {
                    reference,
                    buyerId: input.userId,
                    vendorId,
                    currency: cart.currency,
                    shipToName: input.shipTo.name,
                    shipToPhone: input.shipTo.phone,
                    shipToLine: input.shipTo.line,
                    shipToCity: input.shipTo.city,
                    shipToCountry: input.shipTo.country,
                    note: input.notes[groupe[0]?.shopSlug ?? ""] ?? null,
                    totalAmount: groupe.reduce((t, l) => t + l.unitAmount * l.quantity, 0),
                    items: {
                        create: groupe.map((ligne) => ({
                            variantId: ligne.variantId,
                            productTitle: ligne.productTitle,
                            variantLabel: ligne.label,
                            imagePath: ligne.imagePath,
                            unitAmount: ligne.unitAmount,
                            quantity: ligne.quantity,
                        })),
                    },
                },
            });
            references.push(reference);
        }

        // Dans la MÊME transaction : il ne doit exister aucun instant où les commandes
        // sont écrites et le panier encore plein.
        await tx.cart.delete({ where: { id: cart.id } });

        return { references };
    });
}
```

`eligibleVariantWhere` est exportée depuis `cart.repository.ts` pour être réutilisée ici.
L'écrire deux fois serait exactement la seconde vérité que la spec refuse.

- [ ] **Step 5: Écrire les quatre lectures et l'avancement**

```ts
export async function listOrdersForBuyer(prisma: PrismaClient, buyerId: string) {
    return prisma.order.findMany({
        where: { buyerId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: {
            reference: true,
            status: true,
            currency: true,
            totalAmount: true,
            createdAt: true,
            vendor: { select: { shopName: true } },
        },
    });
}

export async function readOrderForBuyer(
    prisma: PrismaClient,
    input: { buyerId: string; reference: string },
) {
    return prisma.order.findFirst({
        where: { reference: input.reference, buyerId: input.buyerId },
        include: { items: { orderBy: { id: "asc" } }, vendor: { select: { shopName: true, slug: true } } },
    });
}

export async function listOrdersForVendor(prisma: PrismaClient, vendorId: string) {
    return prisma.order.findMany({
        where: { vendorId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: {
            id: true,
            reference: true,
            status: true,
            currency: true,
            totalAmount: true,
            createdAt: true,
            shipToName: true,
        },
    });
}

export async function readOrderForVendor(
    prisma: PrismaClient,
    input: { vendorId: string; orderId: string },
) {
    return prisma.order.findFirst({
        where: { id: input.orderId, vendorId: input.vendorId },
        include: { items: { orderBy: { id: "asc" } } },
    });
}

// Le filtre par boutique vit dans la SIGNATURE, pas dans une vérification d'appelant :
// `orderId` vient de l'URL, donc du client. C'est la règle que T2c a écrite et que T2e a
// dû réapprendre.
//
// La transition elle-même est décidée par le domaine, qui ne peut pas être importé ici.
// L'appelant la calcule et passe l'état visé ; ce dépôt vérifie seulement l'appartenance.
export async function setOrderStatus(
    prisma: PrismaClient,
    input: { vendorId: string; orderId: string; status: string },
): Promise<void> {
    const change = await prisma.order.updateMany({
        where: { id: input.orderId, vendorId: input.vendorId },
        data: { status: input.status as never },
    });
    if (change.count === 0) {
        throw new Error(ERROR_ORDER_NOT_FOUND);
    }
}
```

- [ ] **Step 6: Lancer le test et vérifier qu'il passe**

Run: `docker exec clemperl_dev_api sh -c "cd /app && pnpm --filter @clemperl/db build && cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand order-repository"`
Expected: PASS, dix tests.

Si le test de concurrence ne vire pas au rouge avant le verrou, le consigner : avec un seul
client Prisma le pool sérialise, donc la course ne se manifeste pas à cette échelle. Le
verrou reste, et le test sert de garde-fou. C'est la position déjà tenue en T2d et T2e.

- [ ] **Step 7: Lancer toute la couche**

Run: `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"`
Expected: toutes les suites au vert.

---

## Task 5: Le panier du navigateur

**Files:**
- Create: `apps/storefront/src/lib/local-cart.ts`
- Create: `apps/storefront/src/app/[locale]/shops/[shop]/[product]/components/add-to-cart.tsx`
- Create: `apps/storefront/src/app/[locale]/shops/[shop]/[product]/actions.ts`
- Modify: `apps/storefront/src/app/[locale]/shops/[shop]/[product]/page.tsx`
- Modify: `apps/storefront/src/app/[locale]/shops/[shop]/[product]/components/variant-selector.tsx`
- Modify: `packages/i18n/messages/storefront/fr.json`, `en.json`

**Interfaces:**
- Consumes: `boundQuantity` et `MAX_CART_QUANTITY` de la tâche 2, par
  `@clemperl/domain/browser`.
- Produces:
  ```ts
  export const LOCAL_CART_KEY = "cart";
  export interface ILocalLine { variantId: string; quantity: number; currency: string }
  export function readLocalCart(): ILocalLine[];
  export function addToLocalCart(line: ILocalLine): { added: boolean; reason?: "currency" };
  export function clearLocalCart(): void;
  ```

- [ ] **Step 1: Écrire le panier local**

Créer `apps/storefront/src/lib/local-cart.ts` :

```ts
import { boundQuantity } from "@clemperl/domain/browser";

export const LOCAL_CART_KEY = "cart";

export interface ILocalLine {
    variantId: string;
    quantity: number;
    /** La devise de la boutique de cet article, pour refuser un mélange avant la connexion. */
    currency: string;
}

// Le panier d'un visiteur vit ICI et nulle part ailleurs : le serveur n'en sait rien tant
// qu'il n'y a pas de compte. Il ne range que des identifiants et des quantités, JAMAIS de
// prix : rangés, ils seraient périmés dès le lendemain, et l'acheteur commanderait au prix
// d'avant.
//
// Toute lecture est enveloppée : `localStorage` lève en navigation privée, et un panier
// illisible doit se comporter comme un panier vide, pas casser la page.
export function readLocalCart(): ILocalLine[] {
    try {
        const brut = window.localStorage.getItem(LOCAL_CART_KEY);
        if (!brut) {
            return [];
        }
        const lu: unknown = JSON.parse(brut);
        if (!Array.isArray(lu)) {
            return [];
        }
        return lu
            .map((ligne: Record<string, unknown>) => ({
                variantId: String(ligne["variantId"] ?? ""),
                quantity: boundQuantity(ligne["quantity"]),
                currency: String(ligne["currency"] ?? ""),
            }))
            .filter((ligne) => ligne.variantId !== "" && ligne.quantity > 0);
    } catch {
        return [];
    }
}

function write(lines: ILocalLine[]): void {
    try {
        window.localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(lines));
    } catch {
        // Stockage refusé : le panier ne survivra pas au rechargement, et c'est tout ce
        // qu'on peut faire sans compte.
    }
}

// Le refus de devise arrive DÈS L'AJOUT, et non à la connexion : un acheteur qui découvre
// à la connexion que la moitié de son panier est écartée ne comprendra pas pourquoi.
export function addToLocalCart(line: ILocalLine): { added: boolean; reason?: "currency" } {
    const courant = readLocalCart();
    const devise = courant[0]?.currency;
    if (devise !== undefined && devise !== line.currency) {
        return { added: false, reason: "currency" };
    }

    const existante = courant.find((l) => l.variantId === line.variantId);
    if (existante) {
        existante.quantity = boundQuantity(existante.quantity + line.quantity);
    } else {
        courant.push({ ...line, quantity: boundQuantity(line.quantity) });
    }
    write(courant);
    return { added: true };
}

export function clearLocalCart(): void {
    try {
        window.localStorage.removeItem(LOCAL_CART_KEY);
    } catch {
        // Rien à faire : la remontée a déjà réussi côté serveur.
    }
}
```

- [ ] **Step 2: Ajouter les libellés**

Dans `packages/i18n/messages/storefront/fr.json`, une section `cart` :

```json
"cart": {
  "title": "Mon panier",
  "add": "Ajouter au panier",
  "added": "Ajouté à votre panier",
  "empty": "Votre panier est vide.",
  "quantity": "Quantité",
  "remove": "Retirer",
  "subtotal": "Sous-total",
  "total": "Total",
  "checkout": "Passer commande",
  "signInToOrder": "Connectez-vous pour commander",
  "currencyRefused": "Votre panier est en {currency}. Videz-le pour commander dans une autre devise.",
  "rejected": "Certains articles n'ont pas pu être repris :",
  "rejection": {
    "ineligible": "n'est plus disponible",
    "currency": "est dans une autre devise que votre panier"
  }
}
```

Et la traduction anglaise correspondante dans `en.json`, mêmes clés.

- [ ] **Step 3: Écrire l'action d'ajout au panier serveur**

Créer `apps/storefront/src/app/[locale]/shops/[shop]/[product]/actions.ts` :

```ts
"use server";

import { ERROR_CART_CURRENCY_MISMATCH, addCartItem, prisma } from "@clemperl/db";
import { auth } from "@clemperl/auth";
import { headers } from "next/headers";

// Une action serveur est une ROUTE PUBLIQUE : la session se relit ICI, la page qui a rendu
// le bouton ne la protège pas. C'est la règle écrite en T1a et redite à chaque tranche.
export async function addToServerCart(
    variantId: string,
): Promise<{ ok: boolean; reason?: "currency" }> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        return { ok: false };
    }

    try {
        await addCartItem(prisma, { userId: session.user.id, variantId, quantity: 1 });
        return { ok: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "";
        // La devise est le SEUL refus qu'on explique : les autres viennent d'un article
        // bricolé, et nommer la raison renseignerait sur ce que la base contient.
        return message === ERROR_CART_CURRENCY_MISMATCH
            ? { ok: false, reason: "currency" }
            : { ok: false };
    }
}
```

`auth` vient de `@clemperl/auth`, comme dans `apps/storefront/src/lib/session.ts`. On ne
passe pas par `requireVerifiedSession`, qui REDIRIGE : ici la redirection n'a pas de sens,
le bouton doit rendre un refus que le composant affiche, donc on lit la session sans
l'exiger.

- [ ] **Step 4: Écrire le bouton d'ajout**

Créer `apps/storefront/src/app/[locale]/shops/[shop]/[product]/components/add-to-cart.tsx` :

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, type JSX } from "react";
import { addToLocalCart } from "../../../../../../lib/local-cart";
import { addToServerCart } from "../actions";

interface AddToCartProps {
    variantId: string;
    currency: string;
    signedIn: boolean;
    labels: { add: string; added: string; currencyRefused: string };
}

// Connecté, l'ajout va DIRECTEMENT au serveur : le panier local ne sert plus, et deux
// sources qui se croient toutes deux à jour est exactement ce qu'on évite. Sans compte, il
// n'écrit que dans le navigateur.
export function AddToCart(props: AddToCartProps): JSX.Element {
    const router = useRouter();
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onClick(): Promise<void> {
        setBusy(true);
        setMessage(null);
        try {
            if (props.signedIn) {
                const resultat = await addToServerCart(props.variantId);
                setMessage(resultat.ok ? props.labels.added : props.labels.currencyRefused);
                router.refresh();
            } else {
                const resultat = addToLocalCart({
                    variantId: props.variantId,
                    quantity: 1,
                    currency: props.currency,
                });
                setMessage(resultat.added ? props.labels.added : props.labels.currencyRefused);
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                disabled={busy}
                onClick={() => void onClick()}
                className="self-start border border-bordure px-6 py-3 text-sm"
            >
                {props.labels.add}
            </button>
            {message !== null && (
                <p role="status" className="text-sm text-muet">
                    {message}
                </p>
            )}
        </div>
    );
}
```

- [ ] **Step 5: Remplacer le `mailto:` sur la fiche**

Dans `variant-selector.tsx`, remplacer la prop `offers` par une prop `onReady` qui remonte
la clé de combinaison choisie, et rendre `AddToCart` à la place du lien. La fiche passe la
devise du produit et l'état de connexion, lu par `auth.api.getSession`.

Le `mailto:` disparaît, ainsi que `contactSubject` et `contactBody` des deux catalogues de
traduction : un libellé que plus rien ne lit est un libellé qui ment sur ce que fait
l'écran.

- [ ] **Step 6: Vérifier**

Run: `pnpm lint && pnpm typecheck`
Expected: 15/15 chacun.

Run: `pnpm docker:up && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/catalog`
Expected: `200`.

---

## Task 6: Les écrans acheteur

**Files:**
- Create: `apps/storefront/src/app/[locale]/cart/page.tsx`, `cart/actions.ts`,
  `cart/components/cart-lines.tsx`, `cart/components/local-cart-sync.tsx`
- Create: `apps/storefront/src/app/[locale]/checkout/page.tsx`, `checkout/checkout-form.tsx`,
  `checkout/actions.ts`
- Create: `apps/storefront/src/app/[locale]/orders/page.tsx`,
  `orders/[reference]/page.tsx`
- Modify: `apps/storefront/src/app/[locale]/layout.tsx`
- Modify: `packages/i18n/messages/storefront/fr.json`, `en.json`

**Interfaces:**
- Consumes: `readCart`, `mergeLocalCart`, `setCartItemQuantity` de la tâche 3 ;
  `placeOrders`, `listOrdersForBuyer`, `readOrderForBuyer` de la tâche 4 ; `groupByShop`,
  `sumLines`, `variantLabel`, `checkoutSchema` de la tâche 2.

- [ ] **Step 1: Ajouter les libellés des commandes**

Dans les deux catalogues storefront, une section `orders` :

```json
"orders": {
  "title": "Mes commandes",
  "empty": "Vous n'avez encore passé aucune commande.",
  "reference": "Référence",
  "placedOn": "Passée le",
  "shop": "Boutique",
  "shipTo": "Livraison",
  "noteToShop": "Un mot pour {shop}",
  "noteHint": "Une précision de taille, de gravure, d'horaire de livraison.",
  "status": {
    "PLACED": "Reçue",
    "ACCEPTED": "Acceptée",
    "SHIPPED": "Expédiée",
    "CANCELLED": "Annulée"
  },
  "totalChanged": "Les prix ont changé pendant votre commande. Vérifiez votre panier.",
  "itemUnavailable": "Un article n'est plus disponible. Vérifiez votre panier.",
  "cartEmpty": "Votre panier est vide."
}
```

- [ ] **Step 2: Écrire la remontée du panier local**

Créer `apps/storefront/src/app/[locale]/cart/components/local-cart-sync.tsx` :

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type JSX } from "react";
import { clearLocalCart, readLocalCart } from "../../../../lib/local-cart";
import { pushLocalCart } from "../actions";

interface LocalCartSyncProps {
    signedIn: boolean;
    labels: {
        /** « Certains articles n'ont pas pu être repris : » */
        rejected: string;
        /** Une phrase par raison, indexée par la clé que le dépôt rend. */
        reason: Record<string, string>;
    };
}

// Remonte UNE fois, à l'arrivée sur le panier quand on est connecté. Le garde-fou n'est pas
// décoratif : sans lui, le `router.refresh()` qui suit relancerait la remontée, qui
// relancerait le rafraîchissement.
export function LocalCartSync(props: LocalCartSyncProps): JSX.Element | null {
    const router = useRouter();
    const dejaFait = useRef(false);
    const [refuses, setRefuses] = useState<{ variantId: string; reason: string }[]>([]);

    useEffect(() => {
        if (!props.signedIn || dejaFait.current) {
            return;
        }
        dejaFait.current = true;

        const lignes = readLocalCart();
        if (lignes.length === 0) {
            return;
        }

        void pushLocalCart(lignes.map((l) => ({ variantId: l.variantId, quantity: l.quantity })))
            .then((resultat) => {
                // Les refus sont AFFICHÉS, jamais escamotés : c'est le critère 2 de la
                // spec. Un acheteur qui retrouve trois articles sur quatre sans un mot
                // croit avoir perdu le quatrième par la faute du site.
                setRefuses(resultat.rejected);
                // Vidé DÈS que le serveur a pris la main : deux sources qui se croient
                // toutes deux à jour est le défaut qu'on évite. Vidé même quand des
                // articles sont refusés, sinon la remontée les représenterait à chaque
                // visite et le message reviendrait sans fin.
                clearLocalCart();
                router.refresh();
            })
            .catch(() => undefined);
    }, [props.signedIn, router]);

    if (refuses.length === 0) {
        return null;
    }

    return (
        <div role="status" className="mt-4 border border-bordure p-3 text-sm">
            <p>{props.labels.rejected}</p>
            <ul>
                {refuses.map((refus) => (
                    <li key={refus.variantId}>
                        {props.labels.reason[refus.reason] ?? props.labels.reason["ineligible"]}
                    </li>
                ))}
            </ul>
        </div>
    );
}
```

- [ ] **Step 3: Écrire les actions du panier**

Créer `apps/storefront/src/app/[locale]/cart/actions.ts` :

```ts
"use server";

import { boundQuantity } from "@clemperl/domain";
import { mergeLocalCart, prisma, setCartItemQuantity } from "@clemperl/db";
import { revalidatePath } from "next/cache";
import { requireVerifiedSession } from "../../../lib/session";

// Chaque action rappelle la garde : une action serveur est une ROUTE PUBLIQUE, et la page
// qui a rendu le bouton ne la protège pas. C'est la règle de T1a, et T2e l'a redite.
export async function pushLocalCart(
    items: readonly { variantId: string; quantity: number }[],
): Promise<{ rejected: { variantId: string; reason: string }[] }> {
    const { user } = await requireVerifiedSession("/cart");

    // Bornée ICI, et pas dans le dépôt : la liste vient du navigateur, donc d'un endroit
    // où n'importe qui écrit ce qu'il veut. La borne du haut évite aussi qu'une liste de
    // deux cents entrées fasse deux cents transactions.
    const propres = items
        .slice(0, 100)
        .map((item) => ({ variantId: item.variantId, quantity: boundQuantity(item.quantity) }))
        .filter((item) => item.quantity > 0);

    const resultat = await mergeLocalCart(prisma, { userId: user.id, items: propres });
    revalidatePath("/cart");
    return resultat;
}

export async function changeQuantity(variantId: string, quantity: number): Promise<void> {
    const { user } = await requireVerifiedSession("/cart");
    await setCartItemQuantity(prisma, {
        userId: user.id,
        variantId,
        quantity: boundQuantity(quantity),
    });
    revalidatePath("/cart");
}

// Retirer, c'est poser zéro : une seule écriture à relire, et le dépôt y supprime déjà le
// panier devenu vide, ce qui libère sa devise.
export async function removeLine(variantId: string): Promise<void> {
    const { user } = await requireVerifiedSession("/cart");
    await setCartItemQuantity(prisma, { userId: user.id, variantId, quantity: 0 });
    revalidatePath("/cart");
}
```

`requireVerifiedSession(destination)` rend la session de Better Auth, et redirige vers
`/sign-in?next=<destination>` puis `/verify-email` quand il le faut : ce qui revient est
donc toujours une session vérifiée, et `session.user.id` se lit sans garde supplémentaire.

- [ ] **Step 4: Écrire la page du panier**

```tsx
import { prisma, readCart } from "@clemperl/db";
import { formatPrice, groupByShop, sumLines, variantLabel } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import type { JSX } from "react";
import { auth } from "@clemperl/auth";
import { headers } from "next/headers";
import { CartLines } from "./components/cart-lines";
import { LocalCartSync } from "./components/local-cart-sync";

// Personnelle par construction : elle dépend de la session et du panier.
export const dynamic = "force-dynamic";

export default async function CartPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
    const { locale } = await params;
    const t = await getTranslations("cart");
    const session = await auth.api.getSession({ headers: await headers() });

    // La page n'EXIGE pas la session : un visiteur doit voir ce qu'il a avant qu'on lui
    // demande un compte. Sans session elle ne rend que le composant de remontée, qui lit
    // le panier du navigateur.
    const panier = session?.user ? await readCart(prisma, session.user.id) : null;
    const groupes = groupByShop(panier?.lines ?? []);
    const devise = panier?.currency ?? "";

    // TOUS les prix sont formatés ICI. `formatPrice` tire `@clemperl/core`, donc
    // nodemailer, donc `node:net` : un composant client qui l'importerait ferait entrer
    // tout cela dans le paquet navigateur.
    const sections = groupes.map((groupe) => ({
        shopSlug: groupe.shopSlug,
        shopName: groupe.lines[0]?.shopName ?? "",
        subtotal: formatPrice(sumLines(groupe.lines), devise as never, locale),
        lines: groupe.lines.map((ligne) => ({
            variantId: ligne.variantId,
            productTitle: ligne.productTitle,
            productSlug: ligne.productSlug,
            variantLabel: variantLabel(ligne.optionValues),
            imagePath: ligne.imagePath,
            quantity: ligne.quantity,
            unitPrice: formatPrice(ligne.unitAmount, devise as never, locale),
            linePrice: formatPrice(ligne.unitAmount * ligne.quantity, devise as never, locale),
        })),
    }));
    const total = sumLines(panier?.lines ?? []);

    return (
        <main className="mx-auto w-full max-w-4xl px-4 py-10">
            <h1 className="text-2xl">{t("title")}</h1>
            <LocalCartSync
                signedIn={session?.user !== undefined}
                labels={{
                    rejected: t("rejected"),
                    reason: {
                        ineligible: t("rejection.ineligible"),
                        currency: t("rejection.currency"),
                    },
                }}
            />
            {sections.length === 0 ? (
                <p className="mt-6 text-sm text-muet">{t("empty")}</p>
            ) : (
                <CartLines
                    sections={sections}
                    total={formatPrice(total, devise as never, locale)}
                    expectedTotal={total}
                    signedIn={session?.user !== undefined}
                    labels={{
                        quantity: t("quantity"),
                        remove: t("remove"),
                        subtotal: t("subtotal"),
                        total: t("total"),
                        checkout: t("checkout"),
                        signInToOrder: t("signInToOrder"),
                    }}
                />
            )}
        </main>
    );
}
```

`CartLines` est client : il porte les champs de quantité et les retraits, appelle
`changeQuantity` et `removeLine`, et ne reçoit **que des chaînes déjà formatées**. Il rend
un sous-total par groupe, parce que chaque groupe deviendra une commande, et le total
général en dessous, suivi du lien vers `/checkout` ou vers la connexion.

- [ ] **Step 5: Écrire la validation**

`checkout/page.tsx` exige la session, relit le panier par `readCart`, groupe par boutique, et
rend `checkout-form.tsx` avec un champ de mot par boutique. Le formulaire porte un champ
caché `expectedTotal` qui vaut le total AFFICHÉ.

`checkout/actions.ts` :

```ts
"use server";

import {
    ERROR_CART_EMPTY,
    ERROR_ITEM_INELIGIBLE,
    ERROR_TOTAL_CHANGED,
    placeOrders,
    prisma,
    readCart,
} from "@clemperl/db";
import { checkoutSchema, variantLabel } from "@clemperl/domain";
import { redirect } from "next/navigation";
import { requireVerifiedSession } from "../../../lib/session";

export interface ICheckoutState {
    error?: string;
}

export async function submitCheckout(
    _state: ICheckoutState,
    form: FormData,
): Promise<ICheckoutState> {
    const { user } = await requireVerifiedSession("/checkout");

    const parse = checkoutSchema.safeParse({
        name: form.get("name"),
        phone: form.get("phone"),
        line: form.get("line"),
        city: form.get("city"),
        country: form.get("country"),
        note: form.get("note") ?? undefined,
    });
    if (!parse.success) {
        return { error: "invalid" };
    }

    const panier = await readCart(prisma, user.id);
    if (!panier || panier.lines.length === 0) {
        return { error: "cartEmpty" };
    }

    // Les libellés se construisent ICI, parce que `variantLabel` est pur et que le dépôt
    // ne peut pas importer le domaine, qui dépend déjà de `@clemperl/db`.
    const lignes = panier.lines.map((ligne) => ({
        variantId: ligne.variantId,
        label: variantLabel(ligne.optionValues),
    }));

    // Un mot par boutique : les champs du formulaire s'appellent `note:<slug>`.
    const notes: Record<string, string> = {};
    for (const [cle, valeur] of form.entries()) {
        if (cle.startsWith("note:") && typeof valeur === "string" && valeur.trim() !== "") {
            notes[cle.slice("note:".length)] = valeur.trim().slice(0, 1000);
        }
    }

    // L'adresse est recomposée CHAMP PAR CHAMP, et non prise en bloc moins `note` :
    // `checkoutSchema` porte `note` parce que le formulaire le porte, mais le mot destiné
    // à une boutique n'est pas l'adresse de livraison. Écrire les cinq champs dit ce
    // qu'est une adresse, là où une destructuration laisserait en plus une variable que
    // personne ne lit, qu'`eslint` refuse.
    const shipTo = {
        name: parse.data.name,
        phone: parse.data.phone,
        line: parse.data.line,
        city: parse.data.city,
        country: parse.data.country,
    };

    let references: string[];
    try {
        const resultat = await placeOrders(prisma, {
            userId: user.id,
            expectedTotal: Number(form.get("expectedTotal") ?? -1),
            shipTo,
            notes,
            lines: lignes,
        });
        references = resultat.references;
    } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === ERROR_TOTAL_CHANGED) {
            return { error: "totalChanged" };
        }
        if (message === ERROR_ITEM_INELIGIBLE) {
            return { error: "itemUnavailable" };
        }
        if (message === ERROR_CART_EMPTY) {
            return { error: "cartEmpty" };
        }
        throw error;
    }

    // HORS du `try`. `redirect` lève pour fonctionner : à l'intérieur, le `catch` avalerait
    // la redirection et l'acheteur lirait « échec » sur une commande réussie. Le dépôt a
    // déjà payé ce piège une fois, il est consigné dans `docs/pieges.md`.
    redirect(`/orders/${references[0] ?? ""}`);
}
```

Le formulaire porte un champ de mot PAR BOUTIQUE, nommé `note:<slug>`. Le `note` de
`checkoutSchema` reste pour le cas où un jour un mot général existerait, et il est retiré
avant l'appel.

- [ ] **Step 6: Écrire les écrans de commandes**

```tsx
// orders/[reference]/page.tsx
import { prisma, readOrderForBuyer } from "@clemperl/db";
import { formatPrice } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { requireVerifiedSession } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export default async function OrderPage({
    params,
}: {
    params: Promise<{ locale: string; reference: string }>;
}): Promise<JSX.Element> {
    const { locale, reference } = await params;
    const session = await requireVerifiedSession(`/orders/${reference}`);
    const t = await getTranslations("orders");

    const commande = await readOrderForBuyer(prisma, {
        buyerId: session.user.id,
        reference,
    });
    // 404 et non 403 : le filtre vit dans la SIGNATURE du dépôt, et répondre « interdit »
    // confirmerait que cette référence existe, ce qui renseigne déjà.
    if (!commande) {
        notFound();
    }

    return (
        <main className="mx-auto w-full max-w-3xl px-4 py-10">
            <h1 className="text-2xl">{commande.reference}</h1>
            {/* L'état par sa CLÉ, jamais la valeur de l'enum : « PLACED » n'est pas du
                français, et un écran qui l'affiche parle la langue de la base. */}
            <p className="mt-2 text-sm">{t(`status.${commande.status}`)}</p>
            <p className="text-sm text-muet">{commande.vendor.shopName}</p>
            <ul className="mt-6 divide-y divide-bordure">
                {commande.items.map((ligne) => (
                    <li key={ligne.id} className="flex justify-between py-3 text-sm">
                        <span>
                            {ligne.productTitle}
                            {ligne.variantLabel !== "" && ` (${ligne.variantLabel})`}
                            {` x${ligne.quantity}`}
                        </span>
                        <span>
                            {formatPrice(
                                ligne.unitAmount * ligne.quantity,
                                commande.currency as never,
                                locale,
                            )}
                        </span>
                    </li>
                ))}
            </ul>
            <p className="mt-4 text-right">
                {t("total")} : {formatPrice(commande.totalAmount, commande.currency as never, locale)}
            </p>
            <section className="mt-8 text-sm">
                <h2>{t("shipTo")}</h2>
                <p>{commande.shipToName}</p>
                <p>{commande.shipToLine}</p>
                <p>
                    {commande.shipToCity}, {commande.shipToCountry}
                </p>
                <p>{commande.shipToPhone}</p>
            </section>
        </main>
    );
}
```

`orders/page.tsx` suit la même forme sur `listOrdersForBuyer` : une ligne par commande, avec
sa référence en lien, sa date, le nom de la boutique, l'état traduit et le total formaté. Il
rend `t("empty")` quand la liste est vide.

- [ ] **Step 7: Ajouter le lien dans l'en-tête**

Dans `layout.tsx`, un lien « Panier » vers `/cart`, à côté de celui du catalogue.

- [ ] **Step 8: Vérifier**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 15/15 chacun.

Run: `pnpm docker:up` puis `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/cart`
Expected: `200`.

---

## Task 7: Les écrans vendeur

**Files:**
- Create: `apps/vendor/src/app/orders/page.tsx`, `orders/[id]/page.tsx`,
  `orders/[id]/actions.ts`
- Modify: `apps/vendor/src/app/layout.tsx`
- Modify: `packages/i18n/messages/vendor/fr.json`

**Interfaces:**
- Consumes: `listOrdersForVendor`, `readOrderForVendor`, `setOrderStatus` de la tâche 4 ;
  `allowedOrderActions`, `advanceOrder` de la tâche 1.

- [ ] **Step 1: Ajouter les libellés vendeur**

Dans `packages/i18n/messages/vendor/fr.json`, `navigation.orders` vaut « Mes commandes », et
une section `orders` porte les états, les trois actions, les en-têtes du détail, et
`empty`.

```json
"orders": {
  "title": "Mes commandes",
  "empty": "Aucune commande pour l'instant.",
  "reference": "Référence",
  "placedOn": "Passée le",
  "buyer": "Acheteur",
  "shipTo": "Adresse de livraison",
  "note": "Mot de l'acheteur",
  "total": "Total",
  "status": {
    "PLACED": "Reçue",
    "ACCEPTED": "Acceptée",
    "SHIPPED": "Expédiée",
    "CANCELLED": "Annulée"
  },
  "action": {
    "ACCEPT": "Accepter",
    "SHIP": "Marquer expédiée",
    "CANCEL": "Annuler"
  }
}
```

Et dans la section `errors` du même fichier, la clé que porte
`ForbiddenOrderTransitionError` :

```json
  "order": { "forbidden_transition": "Cette commande n'est plus dans cet état. Rechargez la page." }
```

- [ ] **Step 2: Écrire la liste**

```tsx
import { listOrdersForVendor, prisma } from "@clemperl/db";
import { formatPrice } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { JSX } from "react";
import { requireVendorMembership } from "../../lib/session";

export const dynamic = "force-dynamic";

export default async function VendorOrdersPage(): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();
    const t = await getTranslations("orders");
    const commandes = await listOrdersForVendor(prisma, vendor.id);

    return (
        <main className="mx-auto w-full max-w-4xl px-4 py-10">
            <h1 className="text-2xl">{t("title")}</h1>
            {commandes.length === 0 ? (
                <p className="mt-6 text-sm text-muet">{t("empty")}</p>
            ) : (
                <ul className="mt-6 divide-y divide-bordure">
                    {commandes.map((commande) => (
                        <li key={commande.id} className="flex justify-between py-3 text-sm">
                            <Link href={`/orders/${commande.id}`}>{commande.reference}</Link>
                            <span>{commande.shipToName}</span>
                            <span>{t(`status.${commande.status}`)}</span>
                            {/* Sans troisième argument, comme les autres écrans vendeur :
                                ce front n'est pas segmenté par locale. */}
                            <span>
                                {formatPrice(commande.totalAmount, commande.currency as never)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
```

`requireVendorMembership` rend `{ session, vendor }`, et redirige vers la vitrine quand la
session manque ou que le compte n'est pas encore vendeur. Elle s'appelle EXPLICITEMENT en
tête de chaque page et de chaque action, jamais depuis un layout : un layout ne s'interpose
pas de façon garantie, et une garde qui semble protéger est pire qu'une garde absente.

- [ ] **Step 3: Écrire le détail et l'avancement**

`orders/[id]/page.tsx` lit par `readOrderForVendor`, répond `notFound()` sur `null`, rend
l'adresse, le mot et les lignes figées, puis les boutons :

```tsx
    const commande = await readOrderForVendor(prisma, { vendorId: vendor.id, orderId: id });
    if (!commande) {
        notFound();
    }

    // Les boutons viennent de CETTE liste, et de rien d'autre. Une action impossible ne
    // s'affiche pas grisée, elle ne s'affiche pas : un bouton qu'on ne peut pas presser
    // est une promesse que l'écran ne tient pas.
    const actions = allowedOrderActions(commande.status as never);

    return (
        <main className="mx-auto w-full max-w-3xl px-4 py-10">
            <h1 className="text-2xl">{commande.reference}</h1>
            <p className="mt-2 text-sm">{t(`status.${commande.status}`)}</p>
            {/* ... adresse, mot, lignes figées ... */}
            <div className="mt-8 flex gap-3">
                {actions.map((action) => (
                    <form key={action} action={advanceOrderAction}>
                        <input type="hidden" name="orderId" value={commande.id} />
                        <input type="hidden" name="action" value={action} />
                        <button type="submit" className="border border-bordure px-4 py-2 text-sm">
                            {t(`action.${action}`)}
                        </button>
                    </form>
                ))}
            </div>
        </main>
    );
```

`orders/[id]/actions.ts` :

```ts
export async function advanceOrderAction(form: FormData): Promise<void> {
    const { vendor } = await requireVendorMembership();
    const orderId = String(form.get("orderId") ?? "");
    const action = String(form.get("action") ?? "");

    const order = await readOrderForVendor(prisma, { vendorId: vendor.id, orderId });
    if (!order) {
        return;
    }

    try {
        // Le DOMAINE décide de la transition, le dépôt ne fait qu'écrire. Le dépôt ne peut
        // pas importer le domaine, qui dépend déjà de `@clemperl/db`.
        const suivant = advanceOrder(order.status as never, action as never);
        await setOrderStatus(prisma, { vendorId: vendor.id, orderId, status: suivant });
    } catch (error) {
        // Une transition interdite n'est pas une panne : l'écran ne l'offrait pas, donc
        // elle vient d'un formulaire rejoué ou bricolé. La page se re-rend avec l'état
        // réel, et c'est ce que le vendeur doit voir.
        console.error("advanceOrderAction", error);
    }

    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
}
```

- [ ] **Step 4: Ajouter le lien dans la navigation**

Dans `apps/vendor/src/app/layout.tsx`, « Mes commandes » vers `/orders`, après « Mes
collections ».

- [ ] **Step 5: Vérifier**

Run: `pnpm lint && pnpm typecheck`
Expected: 15/15 chacun.

Run: `pnpm docker:up` puis `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/orders`
Expected: `307`, la route existe et redirige vers la connexion.

---

## Task 8: Les parcours navigateur

**Files:**
- Create: `e2e/order.spec.ts`
- Modify: `e2e/global-setup.ts`
- Modify: `docs/passation.md`

- [ ] **Step 1: Échauffer les routes neuves**

Dans `e2e/global-setup.ts`, ajouter aux listes existantes :

```ts
    `${URL_STOREFRONT}/cart`,
    `${URL_STOREFRONT}/checkout`,
    `${URL_STOREFRONT}/orders`,
    `${URL_STOREFRONT}/orders/inexistante`,
    `${URL_VENDOR}/orders`,
    `${URL_VENDOR}/orders/inexistante`,
```

Sans elles, un test sain expire à l'arrivée : Next compile au premier accès, et la mesure de
T2e donnait six secondes pour une route neuve, contre un délai d'assertion de cinq.

- [ ] **Step 2: Écrire le parcours principal**

Créer `e2e/order.spec.ts`. Il reprend `inMain` de `e2e/collection.spec.ts`, pour la raison
que `docs/pieges.md` consigne : l'annonceur de route de Next porte le titre de la page hors
de `main`.

Le parcours : un vendeur publie un produit avec photo, un visiteur SANS session l'ajoute à
son panier, se connecte, retrouve son article, valide avec son adresse et un mot, puis le
vendeur voit la commande et la fait avancer jusqu'à expédiée.

Trois précautions que les pièges du dépôt imposent, et qu'il faut écrire telles quelles :

```ts
// Le titre porte une marque propre au run : la base n'est pas vidée entre deux passages,
// et un titre fixe retrouverait le produit de la fois précédente.
const suffix = Date.now();

// On attend que la page soit stabilisée avant de taper : une saisie faite avant
// l'hydratation est écrasée par le rendu qui suit, et le champ affiche pourtant le texte
// voulu.
await page.waitForLoadState("networkidle");

// On vise ce que l'action a PRODUIT, jamais un mot que l'écran portait déjà :
// `getByText` cherche une sous-chaîne sans tenir compte de la casse.
await expect(page.getByRole("button", { name: "Marquer expédiée" })).toBeVisible();
```

- [ ] **Step 3: Écrire le parcours de refus**

Dans le même fichier, un second test : l'acheteur met un article au panier, le vendeur le
dépublie, l'acheteur valide, et lit que l'article n'est plus disponible. Aucune commande
n'est créée.

C'est le critère 2 de la spec, et c'est le seul endroit qui éprouve le refus de bout en
bout.

- [ ] **Step 4: Lancer la suite**

Run: `pnpm docker:up` puis attendre que les quatre applications répondent, puis
`pnpm test:e2e`
Expected: tous les parcours au vert, les anciens comme les deux nouveaux.

Lancer la suite DEUX fois : un passage unique ne distingue pas un test stable d'un test
chanceux, et cette tranche a beaucoup de formulaires.

- [ ] **Step 5: Mettre la passation à jour**

Dans `docs/passation.md`, passer T3 à `**Livrée**`, et ajouter dans les décisions ouvertes :

```markdown
**Le panier d'un visiteur ne suit pas d'un appareil à l'autre.** Il vit dans son navigateur
et se perd si celui-ci est nettoyé. C'est le prix de n'avoir aucune table pour qui n'a pas
de compte, ni panier orphelin à balayer. Le jour où ça gêne, la sortie est un panier en base
dès la première visite, identifié par un cookie.

**Aucun stock, donc aucune réservation.** Deux acheteurs peuvent commander le dernier
exemplaire : les deux commandes existent, et c'est le vendeur qui en annule une. Le stock
n'est pas de cette tranche et n'est encore planifié nulle part.
```

- [ ] **Step 6: Vérification finale, toutes couches**

```bash
pnpm lint && pnpm typecheck && pnpm test
docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.e2e.ts --runInBand"
pnpm test:e2e
```

Expected: tout au vert, seuils de couverture tenus.

- [ ] **Step 7: Les deux contrôles mécaniques**

```bash
grep -rln '"use client"' apps/storefront/src apps/vendor/src \
  | xargs grep -n "^import.*@clemperl/core\|^import.*formatPrice" || echo "aucun"
git diff | grep -n "^+.*—" || echo "aucun"
```

Expected: `aucun` aux deux. Le premier vise les lignes d'IMPORT et non toute mention : un
commentaire qui explique pourquoi on n'importe pas `formatPrice` est exactement ce qu'on
veut lire.
