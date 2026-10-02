# T2d, le catalogue public : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un visiteur sans compte parcourt les produits publiés, les filtre, ouvre une
fiche, choisit une déclinaison et peut contacter la boutique.

**Architecture:** la catégorie passe sur le produit par une migration. La requête de liste
est écrite en SQL paramétré dans un dépôt dédié, parce que Prisma ne sait pas ordonner sur
le minimum d'un agrégat de relation et qu'on refuse de dénormaliser pour contourner un
outil. Les pages sont des composants serveur ; trois composants seulement sont clients, et
chacun parce qu'il écrit quelque part.

**Tech Stack:** Next.js 16 (App Router, server components), Prisma 7.10 (`$queryRaw`,
`Prisma.sql`, `Prisma.join`, `Prisma.raw`), PostgreSQL, next-intl, Tailwind 4, Vitest,
Jest + Testcontainers, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-t2d-catalogue-public-design.md`

## Global Constraints

- **Aucun commit intermédiaire.** Un seul commit à la fin du chantier. La spec et ce plan
  ne se commitent pas séparément, ils voyagent dans ce commit unique. Les étapes
  « Commit » des gabarits de tâche ne s'appliquent pas ici.
- **Aucun tiret quadratin (`—`) ni demi-cadratin (`–`) en prose.** Documentation,
  commentaires, libellés, messages. Voir `docs/conventions/redaction.md`.
- **Ce qu'une machine lit est en anglais** : identifiants, noms de fichiers, segments
  d'URL, clés de traduction. **Ce qu'un humain lit est en français** : documentation,
  commentaires, libellés, qui vivent dans `packages/i18n`.
- **Aucune valeur venue de l'URL ou d'un cookie n'atteint la chaîne SQL.** Valeurs
  paramétrées par `Prisma.sql`, tri choisi dans une table fermée, conditions assemblées par
  `Prisma.join`.
- **Aucun prix formaté dans un composant client.** `formatPrice` tire `@clemperl/core`,
  donc nodemailer, donc `node:net`.
- **Le cliquet de couverture ne descend jamais.** Les planchers valent la valeur mesurée.
- Après toute modification de `schema.prisma`, de `package.json` ou de `turbo.json` :
  `pnpm docker:up`. Les sources sont montées dans les conteneurs, pas la configuration.

## Review Focus

1. **Un cookie `currency` portant une valeur inconnue**, ou une devise qu'aucun produit
   publié ne porte : la liste doit retomber sur la devise par défaut, jamais rendre une
   liste vide qui ressemblerait à un catalogue sans produits. `chooseCatalogCurrency` est
   pure et testée en tâche 2 ; `listCatalogCurrencies` l'est en tâche 3.
2. **Un terme de recherche contenant `%` ou `_`**, qui sont les jokers d'`ILIKE` : chercher
   « 100% coton » doit chercher ce texte, pas tout. Test en tâche 3.
3. **Une clé de tri inventée, une page négative, une limite démesurée** dans l'URL : chacune
   retombe sur une valeur sûre sans lever. Test en tâche 2.
4. **Un produit demandé sous la mauvaise boutique**, `/shops/A/<produit-de-B>` : doit
   répondre 404, et non servir le produit de B sous l'identité de A. Test en tâche 3 et 5.
5. **`MIN(price_amount)` revenant en chaîne** depuis `node-postgres` : un prix devenu
   chaîne traverserait le formatage sans erreur en affichant un montant faux. Test en
   tâche 3.

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
| --- | --- |
| `packages/db/prisma/migrations/<horodatage>_product_category/migration.sql` | L'enum, la colonne, l'index |
| `packages/domain/src/utils/catalog-filters.utils.ts` | Lire les filtres depuis l'URL, borner, choisir un tri |
| `packages/domain/src/utils/catalog-filters.utils.spec.ts` | Son test exhaustif |
| `packages/db/src/repositories/catalog.repository.ts` | Les quatre lectures publiques, en SQL paramétré |
| `apps/api/test/catalog-repository.int-spec.ts` | Le test d'intégration de ces lectures |
| `apps/storefront/src/lib/currency-cookie.ts` | Lire le cookie côté serveur, avec son repli |
| `apps/storefront/src/app/[locale]/catalog/page.tsx` | La liste |
| `apps/storefront/src/app/[locale]/catalog/components/catalog-filters.tsx` | Client, écrit dans l'URL |
| `apps/storefront/src/app/[locale]/catalog/components/product-card.tsx` | Serveur, une vignette |
| `apps/storefront/src/app/[locale]/components/currency-selector.tsx` | Client, écrit le cookie |
| `apps/storefront/src/app/[locale]/shops/[shop]/page.tsx` | La vitrine |
| `apps/storefront/src/app/[locale]/shops/[shop]/[product]/page.tsx` | La fiche |
| `apps/storefront/src/app/[locale]/shops/[shop]/[product]/components/variant-selector.tsx` | Client, tient la sélection |
| `e2e/catalog.spec.ts` | Les parcours navigateur |

**Modifiés :**

| Fichier | Changement |
| --- | --- |
| `packages/db/prisma/schema.prisma` | `E_PRODUCT_CATEGORY`, `Product.category`, l'index |
| `packages/db/src/index.ts` | Exporter le nouvel enum |
| `packages/db/src/repositories/index.ts` | Exporter le nouveau dépôt |
| `packages/db/src/repositories/product.repository.ts` | `category` dans `createProduct` et `saveProduct` |
| `packages/domain/src/schemas/product.schema.ts` | `category` dans les champs de détails |
| `packages/domain/src/utils/index.ts` et `browser.ts` | Exporter les filtres |
| `packages/i18n/messages/vendor/fr.json` | Libellé et options de catégorie |
| `packages/i18n/messages/storefront/fr.json` et `en.json` | Toute la section `catalog` |
| `apps/vendor/src/app/products/new/new-product-form.tsx` | Le champ catégorie |
| `apps/vendor/src/app/products/[id]/product-form.tsx` | Le champ catégorie |
| `apps/vendor/src/app/products/[id]/actions.ts` et `products/actions.ts` | Transmettre la catégorie |
| `apps/storefront/src/app/[locale]/layout.tsx` | Lien vers le catalogue, sélecteur de devise |
| `docs/passation.md` | État de T2d |

---

## Task 1: La catégorie de produit, du schéma au formulaire vendeur

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<horodatage>_product_category/migration.sql`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/src/repositories/product.repository.ts`
- Modify: `packages/domain/src/schemas/product.schema.ts`
- Test: `packages/domain/src/schemas/product.schema.spec.ts`
- Modify: `packages/i18n/messages/vendor/fr.json`
- Modify: `apps/vendor/src/app/products/new/new-product-form.tsx`
- Modify: `apps/vendor/src/app/products/[id]/product-form.tsx`
- Modify: `apps/vendor/src/app/products/actions.ts`, `apps/vendor/src/app/products/[id]/actions.ts`
- Test: `apps/api/test/product-repository.int-spec.ts`

**Interfaces:**
- Produces: `E_PRODUCT_CATEGORY` (enum Prisma, valeurs `APPAREL | JEWELLERY | LEATHER_GOODS`),
  exporté par `@clemperl/db` et par `@clemperl/db/enums`.
  `productDetailsFields.category: z.enum([...])`.
  `ICreateProduct` et `ISaveProduct` gagnent `category: string`.

- [ ] **Step 1: Écrire le test qui échoue, sur le schéma du domaine**

Dans `packages/domain/src/schemas/product.schema.spec.ts`, ajouter :

```ts
describe("la catégorie du produit", () => {
    it("accepte les trois catégories connues", () => {
        for (const category of ["APPAREL", "JEWELLERY", "LEATHER_GOODS"]) {
            const resultat = productDetailsSchema.safeParse({
                title: "Sac cabas",
                description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
                category,
            });
            expect(resultat.success).toBe(true);
        }
    });

    // Un défaut silencieux rangerait toutes les bagues en vêtements. Le formulaire
    // exige un choix, et c'est ici que ce refus se vérifie.
    it("refuse une catégorie absente", () => {
        const resultat = productDetailsSchema.safeParse({
            title: "Sac cabas",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
        });
        expect(resultat.success).toBe(false);
    });

    it("refuse une catégorie inventée", () => {
        const resultat = productDetailsSchema.safeParse({
            title: "Sac cabas",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
            category: "FOOD",
        });
        expect(resultat.success).toBe(false);
    });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @clemperl/domain exec vitest run src/schemas/product.schema.spec.ts`
Expected: FAIL, « refuse une catégorie absente » passe mais les deux autres échouent,
parce que `category` n'existe pas dans le schéma et que zod ignore les clés inconnues.

- [ ] **Step 3: Ajouter la catégorie au schéma du domaine**

Dans `packages/domain/src/schemas/product.schema.ts`, à l'intérieur de
`productDetailsFields`, après `description` :

```ts
    // Les valeurs sont écrites ICI et non importées de `@clemperl/db` : ce schéma est
    // chargé par un composant client, et le barillet du client Prisma n'a rien à faire
    // dans un paquet navigateur. Le test d'intégration de la tâche 1 épingle que les
    // deux listes coïncident.
    category: z.enum(["APPAREL", "JEWELLERY", "LEATHER_GOODS"]),
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `pnpm --filter @clemperl/domain exec vitest run src/schemas/product.schema.spec.ts`
Expected: PASS, trois tests ajoutés.

- [ ] **Step 5: Déclarer l'enum et la colonne dans le schéma Prisma**

Dans `packages/db/prisma/schema.prisma`, après `enum E_PRODUCT_STATUS` :

```prisma
// DISTINCT de `E_VENDOR_CATEGORY`, même s'il porte aujourd'hui les mêmes valeurs. Les
// deux répondent à des questions différentes : ce que la boutique déclare vendre, et ce
// qu'est cet objet. Les fusionner lierait leurs évolutions sans raison, alors que la
// liste des catégories de produit a vocation à s'allonger bien avant l'autre.
enum E_PRODUCT_CATEGORY {
  APPAREL
  JEWELLERY
  LEATHER_GOODS

  @@map("product_category")
}
```

Dans `model Product`, après `status` :

```prisma
  // Le défaut existe pour que la migration passe sur les lignes déjà écrites. Le
  // formulaire vendeur, lui, EXIGE un choix : un défaut silencieux rangerait toutes les
  // bagues en vêtements.
  category E_PRODUCT_CATEGORY @default(APPAREL)
```

Et dans le bloc d'index du même modèle, après `@@index([vendorId, status])` :

```prisma
  // `status` en tête : toute requête publique commence par `status = 'PUBLISHED'`.
  @@index([status, category])
```

- [ ] **Step 6: Produire la migration**

```bash
docker exec clemperl_dev_api sh -c "cd /app/packages/db && pnpm exec prisma migrate diff \
  --from-config-datasource prisma.config.ts --to-schema-datamodel prisma/schema.prisma \
  --script" > packages/db/prisma/migrations/20261002120000_product_category/migration.sql
```

Créer le dossier avant la redirection. Vérifier que le fichier contient bien
`CREATE TYPE "product_category"` et `ALTER TABLE "products" ADD COLUMN "category"`.

- [ ] **Step 7: Appliquer la migration et régénérer le client**

```bash
pnpm docker:up
docker exec clemperl_dev_api sh -c "cd /app/packages/db && pnpm exec prisma migrate deploy"
```

Expected: `1 migration found`, puis `Applied`.

- [ ] **Step 8: Exporter l'enum**

Dans `packages/db/src/index.ts`, ajouter `E_PRODUCT_CATEGORY` à la liste d'exports
d'énumérations, en ordre alphabétique après `E_CURRENCY`.

Vérifier que `packages/db/src/enums.ts` (le point d'entrée `@clemperl/db/enums`) l'exporte
aussi s'il énumère les enums un par un.

- [ ] **Step 9: Écrire le test d'intégration qui échoue**

Dans `apps/api/test/product-repository.int-spec.ts`, ajouter :

```ts
describe("la catégorie du produit", () => {
    it("est écrite à la création et relue telle quelle", async () => {
        const { vendorId } = await createShopWithCurrency("EUR");
        const { id } = await createProduct(prisma, {
            vendorId,
            slug: `${PREFIX}-bague-${counter}`,
            title: "Bague tressée",
            description: DESCRIPTION,
            priceAmount: 4500,
            expectedCurrency: "EUR",
            category: "JEWELLERY",
        });

        const product = await prisma.product.findUnique({ where: { id } });
        expect(product?.category).toBe("JEWELLERY");
    });

    // Les valeurs sont écrites deux fois : dans le schéma zod du domaine, qu'un
    // composant client charge, et dans l'enum Prisma. Une divergence ne casserait rien
    // au typage et produirait un refus en base que l'écran n'explique pas.
    it("porte exactement les valeurs que le domaine accepte", () => {
        expect(Object.values(E_PRODUCT_CATEGORY).sort()).toEqual(
            [...PRODUCT_CATEGORIES].sort(),
        );
    });
});
```

Importer `E_PRODUCT_CATEGORY` depuis `@clemperl/db` et `PRODUCT_CATEGORIES` depuis
`@clemperl/domain`.

- [ ] **Step 10: Lancer ce test et vérifier qu'il échoue**

Run: `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand product-repository -t 'catégorie'"`
Expected: FAIL, `createProduct` n'accepte pas `category`, et `PRODUCT_CATEGORIES` n'existe
pas.

- [ ] **Step 11: Exposer la liste des catégories depuis le domaine**

Dans `packages/domain/src/schemas/product.schema.ts`, juste avant
`productDetailsFields` :

```ts
// La liste, nommée, pour que l'écran construise ses options et que le test
// d'intégration la compare à l'enum Prisma.
export const PRODUCT_CATEGORIES = ["APPAREL", "JEWELLERY", "LEATHER_GOODS"] as const;

export type TProductCategory = (typeof PRODUCT_CATEGORIES)[number];
```

Et remplacer le `z.enum([...])` de l'étape 3 par `z.enum(PRODUCT_CATEGORIES)`.

- [ ] **Step 12: Porter la catégorie dans les deux fonctions de dépôt**

Dans `packages/db/src/repositories/product.repository.ts` :

Ajouter `category: string;` à `ICreateProduct` et à `ISaveProduct`, documenté :

```ts
    /** Ce qu'EST cet objet, distinct de ce que la boutique déclare vendre. */
    category: string;
```

Dans `createProduct`, ajouter `category: input.category as never,` au `data` du
`tx.product.create`.

Dans `saveProduct`, ajouter `category: input.category as never,` au `data` du
`tx.product.update`.

Le `as never` est la forme déjà employée dans ce fichier pour les enums, parce que le
dépôt reçoit des chaînes validées par le domaine et ne réimporte pas les types Prisma.

- [ ] **Step 13: Lancer le test et vérifier qu'il passe**

Run: `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand product-repository"`
Expected: PASS, toute la suite.

- [ ] **Step 14: Ajouter les libellés vendeur**

Dans `packages/i18n/messages/vendor/fr.json`, section `products`, après `description` :

```json
"category": "Catégorie",
"categoryHint": "Ce qu'est cet article, indépendamment de ce que votre boutique vend par ailleurs.",
"categoryPlaceholder": "Choisir une catégorie",
```

Et une section de premier niveau, après `currency` :

```json
"productCategory": {
  "APPAREL": "Vêtements",
  "JEWELLERY": "Joaillerie",
  "LEATHER_GOODS": "Maroquinerie"
},
```

- [ ] **Step 15: Ajouter le champ aux deux formulaires**

Dans `apps/vendor/src/app/products/new/new-product-form.tsx`, importer
`PRODUCT_CATEGORIES` depuis `@clemperl/domain/browser` et `SelectField` depuis
`@clemperl/ui`, puis après le champ `description` :

```tsx
                <SelectField
                    label={t.category}
                    name="category"
                    required
                    hint={t.categoryHint}
                    placeholder={t.categoryPlaceholder}
                    options={PRODUCT_CATEGORIES.map((value) => ({
                        value,
                        label: (messages.productCategory as Record<string, string>)[value] ?? value,
                    }))}
                />
```

Le même bloc dans `apps/vendor/src/app/products/[id]/product-form.tsx`, avec
`defaultValue={product.category}` en plus, et la prop `category: string` ajoutée à
`ProductFormProps`. La page `[id]/page.tsx` la passe depuis le produit lu.

- [ ] **Step 16: Transmettre la catégorie dans les deux actions**

Dans `apps/vendor/src/app/products/actions.ts` et
`apps/vendor/src/app/products/[id]/actions.ts`, le `safeParse` des détails lit déjà le
`FormData` ; ajouter `category: form.get("category")` à l'objet parsé, et
`category: details.data.category` à l'appel de `createProduct` ou `saveProduct`.

- [ ] **Step 17: Exporter la liste depuis le sous-chemin navigateur**

Dans `packages/domain/src/browser.ts`, ajouter :

```ts
export * from "./schemas/product.schema.js";
```

Vérifier que `product.schema.ts` n'importe rien de `@clemperl/core`. S'il en importe,
déplacer `PRODUCT_CATEGORIES` dans un fichier de constantes pur plutôt que d'élargir le
sous-chemin.

- [ ] **Step 18: Vérifier la tâche entière**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 15/15 à chaque fois, seuils de couverture tenus.

Run: `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"`
Expected: toutes les suites au vert.

---

## Task 2: Les filtres, purs et bornés

**Files:**
- Create: `packages/domain/src/utils/catalog-filters.utils.ts`
- Create: `packages/domain/src/utils/catalog-filters.utils.spec.ts`
- Modify: `packages/domain/src/utils/index.ts`, `packages/domain/src/browser.ts`

**Interfaces:**
- Consumes: `PRODUCT_CATEGORIES` de la tâche 1.
- Produces:
  ```ts
  export const CATALOG_SORTS = ["price_asc", "price_desc", "newest"] as const;
  export type TCatalogSort = (typeof CATALOG_SORTS)[number];
  export const CATALOG_PAGE_SIZE = 24;
  export interface ICatalogFilters {
      search: string | null;
      category: string | null;
      sort: TCatalogSort;
      page: number;
  }
  export function readCatalogFilters(params: Record<string, string | string[] | undefined>): ICatalogFilters;
  export function catalogOffset(page: number): number;
  export function variantCombinationKey(valueIds: readonly string[]): string;
  export function chooseCatalogCurrency(requested: string | undefined, available: readonly string[]): string;
  ```

- [ ] **Step 1: Écrire le test qui échoue**

Créer `packages/domain/src/utils/catalog-filters.utils.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
    CATALOG_PAGE_SIZE,
    catalogOffset,
    chooseCatalogCurrency,
    readCatalogFilters,
} from "./catalog-filters.utils.js";

describe("readCatalogFilters", () => {
    it("rend des valeurs sûres quand rien n'est fourni", () => {
        expect(readCatalogFilters({})).toEqual({
            search: null,
            category: null,
            sort: "newest",
            page: 1,
        });
    });

    it("lit une recherche, une catégorie et un tri valides", () => {
        expect(readCatalogFilters({ q: "cabas", category: "JEWELLERY", sort: "price_asc" })).toEqual(
            { search: "cabas", category: "JEWELLERY", sort: "price_asc", page: 1 },
        );
    });

    // Rien de ce qui vient de l'URL n'est digne de confiance. Chacune de ces entrées
    // retombe sur une valeur sûre, sans lever : une page publique ne rend pas une erreur
    // parce qu'un paramètre a été bricolé.
    it("refuse une clé de tri inventée", () => {
        expect(readCatalogFilters({ sort: "price_asc; DROP TABLE products" }).sort).toBe("newest");
        expect(readCatalogFilters({ sort: "" }).sort).toBe("newest");
    });

    it("refuse une catégorie inconnue", () => {
        expect(readCatalogFilters({ category: "FOOD" }).category).toBeNull();
    });

    it("borne la page par le bas", () => {
        expect(readCatalogFilters({ page: "0" }).page).toBe(1);
        expect(readCatalogFilters({ page: "-5" }).page).toBe(1);
        expect(readCatalogFilters({ page: "abc" }).page).toBe(1);
        expect(readCatalogFilters({ page: "1e9" }).page).toBe(1);
    });

    it("borne la page par le haut", () => {
        expect(readCatalogFilters({ page: "100000" }).page).toBe(1000);
    });

    it("ignore un paramètre répété plutôt que d'en concaténer les valeurs", () => {
        expect(readCatalogFilters({ q: ["a", "b"] }).search).toBe("a");
    });

    it("traite une recherche vide ou blanche comme une absence", () => {
        expect(readCatalogFilters({ q: "   " }).search).toBeNull();
        expect(readCatalogFilters({ q: "" }).search).toBeNull();
    });

    it("borne la longueur du terme recherché", () => {
        expect(readCatalogFilters({ q: "a".repeat(500) }).search).toHaveLength(100);
    });
});

describe("chooseCatalogCurrency", () => {
    it("garde la devise demandée quand elle est disponible", () => {
        expect(chooseCatalogCurrency("XOF", ["EUR", "XOF"])).toBe("XOF");
    });

    // LE cas qui motive la fonction. Un cookie bricolé, ou une devise dont la dernière
    // boutique a fermé, ne doit pas rendre une liste vide : le visiteur croirait que le
    // catalogue n'a aucun produit.
    it("retombe sur la première disponible quand la demandée est inconnue", () => {
        expect(chooseCatalogCurrency("ZZZ", ["EUR", "XOF"])).toBe("EUR");
        expect(chooseCatalogCurrency(undefined, ["XOF", "EUR"])).toBe("XOF");
        expect(chooseCatalogCurrency("", ["EUR"])).toBe("EUR");
    });

    it("rend l'euro quand le catalogue est vide", () => {
        expect(chooseCatalogCurrency("XOF", [])).toBe("EUR");
        expect(chooseCatalogCurrency(undefined, [])).toBe("EUR");
    });
});

describe("catalogOffset", () => {
    it("rend zéro pour la première page", () => {
        expect(catalogOffset(1)).toBe(0);
    });

    it("avance d'une page entière", () => {
        expect(catalogOffset(3)).toBe(CATALOG_PAGE_SIZE * 2);
    });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @clemperl/domain exec vitest run src/utils/catalog-filters.utils.spec.ts`
Expected: FAIL, `Failed to resolve import "./catalog-filters.utils.js"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `packages/domain/src/utils/catalog-filters.utils.ts` :

```ts
import { PRODUCT_CATEGORIES } from "../schemas/product.schema.js";

// Les tris que le catalogue sait faire, et RIEN d'autre. C'est une liste fermée parce
// qu'elle désigne des fragments de SQL : une valeur venue de l'URL choisit une clé, elle
// ne devient jamais du SQL. Voir `catalog.repository.ts`.
export const CATALOG_SORTS = ["price_asc", "price_desc", "newest"] as const;

export type TCatalogSort = (typeof CATALOG_SORTS)[number];

// Vingt-quatre : trois rangées pleines sur une grille de huit, deux sur une de douze.
export const CATALOG_PAGE_SIZE = 24;

// Mille pages de vingt-quatre, soit vingt-quatre mille produits. Au-delà, personne ne
// pagine : la borne existe pour qu'un `OFFSET` démesuré ne fasse pas balayer la table.
const MAX_PAGE = 1000;

// Cent caractères. Un terme plus long ne décrit plus un produit, et la borne évite de
// faire travailler `ILIKE` sur une chaîne arbitraire.
const MAX_SEARCH_LENGTH = 100;

export interface ICatalogFilters {
    search: string | null;
    category: string | null;
    sort: TCatalogSort;
    page: number;
}

// Un paramètre d'URL peut être répété : `?q=a&q=b` rend un tableau. On garde la première
// valeur plutôt que de les joindre, ce qui produirait un terme que personne n'a tapé.
function premiere(valeur: string | string[] | undefined): string | undefined {
    return Array.isArray(valeur) ? valeur[0] : valeur;
}

// PUR, et c'est ce qui permet de l'éprouver exhaustivement. Rien de ce qui vient de l'URL
// n'est digne de confiance, et rien n'y lève : une page publique ne rend pas une erreur
// parce qu'un paramètre a été bricolé. Chaque entrée douteuse retombe sur une valeur sûre.
export function readCatalogFilters(
    params: Record<string, string | string[] | undefined>,
): ICatalogFilters {
    const brut = premiere(params["q"])?.trim() ?? "";
    const categorie = premiere(params["category"]) ?? "";
    const tri = premiere(params["sort"]) ?? "";

    // `Number.parseInt` et non `Number` : « 1e9 » vaut un milliard pour `Number`, et NaN
    // pour `parseInt`, qui retombe alors sur la première page.
    const page = Number.parseInt(premiere(params["page"]) ?? "", 10);

    return {
        search: brut.length === 0 ? null : brut.slice(0, MAX_SEARCH_LENGTH),
        category: (PRODUCT_CATEGORIES as readonly string[]).includes(categorie)
            ? categorie
            : null,
        sort: (CATALOG_SORTS as readonly string[]).includes(tri) ? (tri as TCatalogSort) : "newest",
        page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    };
}

export function catalogOffset(page: number): number {
    return (page - 1) * CATALOG_PAGE_SIZE;
}

// La liste est bornée à UNE devise, et le visiteur la choisit. Une valeur inconnue, ou
// une devise dont la dernière boutique a fermé, retombe sur la plus fournie : rendre une
// liste vide ferait croire à un catalogue sans produits, ce qui est le pire des deux
// mondes.
//
// `available` arrive trié par nombre de produits décroissant, donc sa tête est la plus
// représentée. L'euro n'est un repli que pour un catalogue entièrement vide, où aucun
// choix n'a de sens.
export function chooseCatalogCurrency(
    requested: string | undefined,
    available: readonly string[],
): string {
    if (requested !== undefined && available.includes(requested)) {
        return requested;
    }
    return available[0] ?? "EUR";
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `pnpm --filter @clemperl/domain exec vitest run src/utils/catalog-filters.utils.spec.ts`
Expected: PASS, onze tests.

- [ ] **Step 5: Exporter depuis les deux barillets**

Dans `packages/domain/src/utils/index.ts` et dans `packages/domain/src/browser.ts`,
ajouter `export * from "./utils/catalog-filters.utils.js";` (chemin adapté au fichier).

Le sous-chemin navigateur en a besoin : le composant de filtres est client et construit
ses options depuis `CATALOG_SORTS`.

- [ ] **Step 6: Écrire le test de la clé de combinaison**

Dans `packages/domain/src/utils/variant-matrix.utils.spec.ts`, ajouter
`variantCombinationKey` à l'import existant depuis `./variant-matrix.utils.js`, puis :

```ts
describe("variantCombinationKey", () => {
    // C'est la clé rangée en BASE, et elle n'a rien à voir avec `selectionKey`, qui est
    // une clé d'écran faite de noms d'axes et de libellés. Les confondre ferait chercher
    // un prix sous une clé qui n'existe nulle part, en silence.
    it("trie les identifiants puis les joint", () => {
        expect(variantCombinationKey(["v2", "v1"])).toBe("v1|v2");
        expect(variantCombinationKey(["v1", "v2"])).toBe("v1|v2");
    });

    it("rend la chaîne vide pour un produit sans axe", () => {
        expect(variantCombinationKey([])).toBe("");
    });
});
```

- [ ] **Step 7: Lancer ce test et vérifier qu'il échoue**

Run: `pnpm --filter @clemperl/domain exec vitest run src/utils/variant-matrix.utils.spec.ts`
Expected: FAIL, `variantCombinationKey is not a function`.

- [ ] **Step 8: Écrire la fonction, et la faire adopter par le dépôt**

Dans `packages/domain/src/utils/variant-matrix.utils.ts` :

```ts
// LA clé rangée en base, distincte de `selectionKey` qui est une clé d'écran. Le tri est
// ce qui rend l'index unique capable de voir un doublon : non trié, `a|b` et `b|a`
// passeraient pour deux combinaisons distinctes.
//
// Elle vit ici parce que DEUX endroits la construisent désormais : le dépôt qui écrit les
// variantes, et la fiche publique qui cherche le prix d'une sélection. Écrite deux fois,
// elle divergerait au premier ajustement, et la fiche afficherait « choisissez une
// déclinaison » pour une sélection pourtant complète.
export function variantCombinationKey(valueIds: readonly string[]): string {
    return [...valueIds].sort().join("|");
}
```

Puis, dans `packages/db/src/repositories/product.repository.ts`, remplacer la construction
en ligne par un appel :

```ts
                    combinationKey: variantCombinationKey(rows.map((row) => row.optionValueId)),
```

en important `variantCombinationKey` depuis `@clemperl/domain`. Le commentaire sur le tri
part avec la fonction, il ne reste pas en double.

- [ ] **Step 9: Lancer les deux suites et vérifier qu'elles passent**

Run: `pnpm --filter @clemperl/domain exec vitest run`
Expected: PASS.

Run: `docker exec clemperl_dev_api sh -c "cd /app && pnpm --filter @clemperl/db build && cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand product-repository"`
Expected: PASS. Ce test existe depuis T2b et vaut maintenant preuve que la fonction extraite
produit exactement la même clé qu'avant.

- [ ] **Step 10: Vérifier la couverture du paquet**

Run: `pnpm --filter @clemperl/domain test`
Expected: PASS, branches à 100 %. Si une branche manque, c'est un cas que le test ci-dessus
n'exerce pas : l'ajouter plutôt que de baisser le seuil.

---

## Task 3: La requête de catalogue, en SQL paramétré

**Files:**
- Create: `packages/db/src/repositories/catalog.repository.ts`
- Modify: `packages/db/src/repositories/index.ts`
- Create: `apps/api/test/catalog-repository.int-spec.ts`

**Interfaces:**
- Consumes: `ICatalogFilters`, `CATALOG_PAGE_SIZE`, `catalogOffset` de la tâche 2.
- Produces:
  ```ts
  export interface ICatalogRow {
      id: string; slug: string; title: string; category: string;
      shopSlug: string; shopName: string; currency: string;
      minPriceAmount: number; variantCount: number; imagePath: string;
  }
  export async function searchPublishedProducts(prisma, input: { filters: ICatalogFilters; currency: string; shopSlug?: string }): Promise<{ rows: ICatalogRow[]; total: number }>;
  export async function listCatalogCurrencies(prisma): Promise<{ currency: string; productCount: number }[]>;
  export async function readPublishedProduct(prisma, input: { shopSlug: string; productSlug: string }): Promise<IPublicProduct | null>;
  export async function readPublishedShop(prisma, input: { shopSlug: string }): Promise<IPublicShop | null>;
  ```

- [ ] **Step 1: Écrire le test d'intégration qui échoue**

Créer `apps/api/test/catalog-repository.int-spec.ts` :

```ts
import {
    createProduct,
    listCatalogCurrencies,
    prisma,
    readPublishedProduct,
    searchPublishedProducts,
    setProductStatus,
} from "@clemperl/db";
import { readCatalogFilters } from "@clemperl/domain";

const PREFIX = "catalog";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
let counter = 0;

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

// Un produit PUBLIÉ complet : une variante, une image READY. Sans l'image, la garantie
// du dépôt refuserait la publication.
async function publishProduct(input: {
    vendorId: string;
    title: string;
    category: string;
    priceAmount: number;
    currency: string;
}) {
    counter += 1;
    const slug = `${PREFIX}-p-${counter}`;
    const { id } = await createProduct(prisma, {
        vendorId: input.vendorId,
        slug,
        title: input.title,
        description: DESCRIPTION,
        priceAmount: input.priceAmount,
        expectedCurrency: input.currency,
        category: input.category,
    });
    await prisma.productImage.create({
        data: {
            productId: id,
            objectPath: `${id}/1111111${counter}-2222-3333-4444-555555555555/original.jpg`,
            originalName: "photo.jpg",
            position: 0,
            status: "READY",
            width: 1200,
            height: 800,
        },
    });
    await setProductStatus(prisma, { productId: id, vendorId: input.vendorId, publish: true });
    return { id, slug };
}

describe("searchPublishedProducts", () => {
    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("rend un produit publié, avec sa boutique, son prix plancher et son image", async () => {
        const shop = await createShop("EUR");
        const { slug } = await publishProduct({
            vendorId: shop.id,
            title: "Sac cabas unique",
            category: "LEATHER_GOODS",
            priceAmount: 18000,
            currency: "EUR",
        });

        const { rows } = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "Sac cabas unique" }),
            currency: "EUR",
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.slug).toBe(slug);
        expect(rows[0]?.shopSlug).toBe(shop.slug);
        expect(rows[0]?.currency).toBe("EUR");
        expect(rows[0]?.imagePath).toContain("/original.jpg");
    });

    // node-postgres rend certains types numériques en CHAÎNE. Un prix devenu chaîne
    // traverserait le formatage sans erreur, en affichant un montant faux.
    it("rend le prix plancher en nombre, pas en chaîne", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Bracelet type numérique",
            category: "JEWELLERY",
            priceAmount: 4500,
            currency: "EUR",
        });

        const { rows } = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "Bracelet type numérique" }),
            currency: "EUR",
        });

        expect(typeof rows[0]?.minPriceAmount).toBe("number");
        expect(rows[0]?.minPriceAmount).toBe(4500);
        expect(typeof rows[0]?.variantCount).toBe("number");
    });

    it("ne rend jamais un brouillon", async () => {
        const shop = await createShop("EUR");
        counter += 1;
        await createProduct(prisma, {
            vendorId: shop.id,
            slug: `${PREFIX}-draft-${counter}`,
            title: "Brouillon invisible",
            description: DESCRIPTION,
            priceAmount: 1000,
            expectedCurrency: "EUR",
            category: "APPAREL",
        });

        const { rows } = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "Brouillon invisible" }),
            currency: "EUR",
        });

        expect(rows).toHaveLength(0);
    });

    it("ne rend pas le produit d'une boutique supprimée", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Produit de boutique fermée",
            category: "APPAREL",
            priceAmount: 2000,
            currency: "EUR",
        });
        await prisma.vendor.update({
            where: { id: shop.id },
            data: { deletedAt: new Date() },
        });

        const { rows } = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "Produit de boutique fermée" }),
            currency: "EUR",
        });

        expect(rows).toHaveLength(0);
    });

    it("borne la liste à la devise demandée", async () => {
        const euro = await createShop("EUR");
        const cfa = await createShop("XOF");
        await publishProduct({
            vendorId: euro.id,
            title: "Ceinture bicolore devise",
            category: "LEATHER_GOODS",
            priceAmount: 5000,
            currency: "EUR",
        });
        await publishProduct({
            vendorId: cfa.id,
            title: "Ceinture bicolore devise",
            category: "LEATHER_GOODS",
            priceAmount: 30000,
            currency: "XOF",
        });

        const resultat = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "Ceinture bicolore devise" }),
            currency: "XOF",
        });

        expect(resultat.rows).toHaveLength(1);
        expect(resultat.rows[0]?.currency).toBe("XOF");
    });

    it("filtre par catégorie", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Objet filtre categorie",
            category: "JEWELLERY",
            priceAmount: 1000,
            currency: "EUR",
        });

        const joaillerie = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "Objet filtre categorie", category: "JEWELLERY" }),
            currency: "EUR",
        });
        const vetements = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "Objet filtre categorie", category: "APPAREL" }),
            currency: "EUR",
        });

        expect(joaillerie.rows).toHaveLength(1);
        expect(vetements.rows).toHaveLength(0);
    });

    it("cherche sans tenir compte de la casse ni des accents", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Étole brodée",
            category: "APPAREL",
            priceAmount: 3000,
            currency: "EUR",
        });

        for (const terme of ["étole brodée", "ETOLE BRODEE", "etole"]) {
            const { rows } = await searchPublishedProducts(prisma, {
                filters: readCatalogFilters({ q: terme }),
                currency: "EUR",
            });
            expect(rows.map((r) => r.title)).toContain("Étole brodée");
        }
    });

    // `%` et `_` sont les jokers d'ILIKE. Cherchés tels quels, ils feraient tout
    // remonter : « 100% coton » rendrait le catalogue entier.
    it("traite les jokers d'ILIKE comme du texte", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Pull 100% laine",
            category: "APPAREL",
            priceAmount: 7000,
            currency: "EUR",
        });
        await publishProduct({
            vendorId: shop.id,
            title: "Echarpe sans joker",
            category: "APPAREL",
            priceAmount: 2000,
            currency: "EUR",
        });

        const exact = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "100% laine" }),
            currency: "EUR",
        });
        const joker = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "%" }),
            currency: "EUR",
        });

        expect(exact.rows).toHaveLength(1);
        expect(joker.rows).toHaveLength(0);
    });

    it("trie par prix croissant et décroissant", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Tri cher article",
            category: "APPAREL",
            priceAmount: 90000,
            currency: "EUR",
        });
        await publishProduct({
            vendorId: shop.id,
            title: "Tri bon marche article",
            category: "APPAREL",
            priceAmount: 1000,
            currency: "EUR",
        });

        const croissant = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "Tri", sort: "price_asc" }),
            currency: "EUR",
        });
        const decroissant = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "Tri", sort: "price_desc" }),
            currency: "EUR",
        });

        expect(croissant.rows[0]?.minPriceAmount).toBe(1000);
        expect(decroissant.rows[0]?.minPriceAmount).toBe(90000);
    });

    it("pagine sans sauter ni répéter une ligne", async () => {
        const shop = await createShop("EUR");
        for (let i = 0; i < 3; i += 1) {
            await publishProduct({
                vendorId: shop.id,
                title: `Pagination article ${i}`,
                category: "APPAREL",
                priceAmount: 1000 + i,
                currency: "EUR",
            });
        }

        const tout = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "Pagination article", sort: "price_asc" }),
            currency: "EUR",
        });

        expect(tout.total).toBe(3);
        expect(new Set(tout.rows.map((r) => r.id)).size).toBe(3);
    });

    it("rend une liste vide, et non une erreur, au-delà de la dernière page", async () => {
        const resultat = await searchPublishedProducts(prisma, {
            filters: readCatalogFilters({ q: "rien ne porte ce titre improbable", page: "999" }),
            currency: "EUR",
        });

        expect(resultat.rows).toHaveLength(0);
        expect(resultat.total).toBe(0);
    });
});

describe("listCatalogCurrencies", () => {
    it("rend les devises portant au moins un produit publié, la plus fournie en tête", async () => {
        const devises = await listCatalogCurrencies(prisma);

        expect(devises.length).toBeGreaterThan(0);
        expect(typeof devises[0]?.productCount).toBe("number");
        for (let i = 1; i < devises.length; i += 1) {
            expect(devises[i - 1]!.productCount).toBeGreaterThanOrEqual(devises[i]!.productCount);
        }
    });
});

describe("readPublishedProduct", () => {
    it("rend le produit, ses images READY et ses déclinaisons", async () => {
        const shop = await createShop("EUR");
        const { slug } = await publishProduct({
            vendorId: shop.id,
            title: "Fiche produit lisible",
            category: "APPAREL",
            priceAmount: 12000,
            currency: "EUR",
        });

        const product = await readPublishedProduct(prisma, {
            shopSlug: shop.slug,
            productSlug: slug,
        });

        expect(product?.title).toBe("Fiche produit lisible");
        expect(product?.currency).toBe("EUR");
        expect(product?.images).toHaveLength(1);
        expect(product?.variants).toHaveLength(1);
        expect(product?.shopContactEmail).toBe(shop.contactEmail);
    });

    it("ne rend pas une image qui n'est pas READY", async () => {
        const shop = await createShop("EUR");
        const { id, slug } = await publishProduct({
            vendorId: shop.id,
            title: "Fiche avec image en cours",
            category: "APPAREL",
            priceAmount: 1000,
            currency: "EUR",
        });
        await prisma.productImage.create({
            data: {
                productId: id,
                objectPath: `${id}/99999999-2222-3333-4444-555555555555/original.jpg`,
                originalName: "deuxieme.jpg",
                position: 1,
                status: "PENDING",
            },
        });

        const product = await readPublishedProduct(prisma, {
            shopSlug: shop.slug,
            productSlug: slug,
        });

        expect(product?.images).toHaveLength(1);
    });

    it("rend null pour un brouillon", async () => {
        const shop = await createShop("EUR");
        counter += 1;
        const slug = `${PREFIX}-draft-fiche-${counter}`;
        await createProduct(prisma, {
            vendorId: shop.id,
            slug,
            title: "Brouillon de fiche",
            description: DESCRIPTION,
            priceAmount: 1000,
            expectedCurrency: "EUR",
            category: "APPAREL",
        });

        await expect(
            readPublishedProduct(prisma, { shopSlug: shop.slug, productSlug: slug }),
        ).resolves.toBeNull();
    });

    // Le slug produit n'est unique QUE par boutique. Demander le produit de B sous
    // l'identité de A doit rendre null, jamais le produit de B.
    it("rend null quand le produit appartient à une autre boutique", async () => {
        const premiere = await createShop("EUR");
        const seconde = await createShop("EUR");
        const { slug } = await publishProduct({
            vendorId: seconde.id,
            title: "Produit de la seconde boutique",
            category: "APPAREL",
            priceAmount: 1000,
            currency: "EUR",
        });

        await expect(
            readPublishedProduct(prisma, { shopSlug: premiere.slug, productSlug: slug }),
        ).resolves.toBeNull();
    });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand catalog-repository"`
Expected: FAIL, `searchPublishedProducts is not a function`.

- [ ] **Step 3: Écrire le dépôt**

Créer `packages/db/src/repositories/catalog.repository.ts` :

```ts
import {
    CATALOG_PAGE_SIZE,
    catalogOffset,
    type ICatalogFilters,
} from "@clemperl/domain";
import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

// LA requête que Prisma ne sait pas écrire. Ordonner une liste de produits par le minimum
// du prix de leurs variantes suppose de trier sur un agrégat de relation, et
// `ProductVariantOrderByRelationAggregateInput` n'expose que `_count`.
//
// La sortie n'est PAS de dénormaliser un prix plancher sur le produit : une colonne n'a
// pas à exister parce qu'un client TypeScript ne sait pas faire un `MIN`, et une valeur
// dénormalisée peut dériver. On écrit donc le SQL, et on le rend sûr par construction.
//
// Trois règles, et elles tiennent ensemble :
//
// 1. Les VALEURS passent toutes par l'interpolation de `Prisma.sql`, donc deviennent des
//    paramètres liés. Aucune ne touche la chaîne.
// 2. Le TRI se choisit dans la table fermée ci-dessous, dont les fragments sont des
//    littéraux écrits ici. `readCatalogFilters` garantit déjà qu'une clé inconnue retombe
//    sur « newest », et le `??` est la seconde barrière.
// 3. Les CONDITIONS sont des fragments assemblés par `Prisma.join`, ce qui garde chacun
//    paramétré.
const ORDERS: Record<string, Prisma.Sql> = {
    price_asc: Prisma.raw(`MIN(v.price_amount) ASC, p.published_at DESC`),
    price_desc: Prisma.raw(`MIN(v.price_amount) DESC, p.published_at DESC`),
    newest: Prisma.raw(`p.published_at DESC`),
};

export interface ICatalogRow {
    id: string;
    slug: string;
    title: string;
    category: string;
    shopSlug: string;
    shopName: string;
    currency: string;
    minPriceAmount: number;
    variantCount: number;
    imagePath: string;
}

// `%` et `_` sont les jokers d'ILIKE. Échappés, « 100% coton » cherche ce texte ; laissés
// tels quels, il rendrait le catalogue entier. Le `\` doit être échappé en premier, sinon
// il échapperait les échappements qu'on vient de poser.
function escapeLike(terme: string): string {
    return terme.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// `unaccent` n'est pas installé, et l'exiger ajouterait une extension PostgreSQL à la
// chaîne de déploiement pour une recherche que la spec veut simple. On compare donc des
// chaînes normalisées par PostgreSQL lui-même, avec `ILIKE` pour la casse et une
// collation insensible aux accents posée par la migration de la tâche 3.
function conditions(
    filters: ICatalogFilters,
    currency: string,
    shopSlug: string | undefined,
): Prisma.Sql[] {
    const liste: Prisma.Sql[] = [
        Prisma.sql`p.status = 'PUBLISHED'`,
        Prisma.sql`p.deleted_at IS NULL`,
        Prisma.sql`s.deleted_at IS NULL`,
        Prisma.sql`s.currency = ${currency}::"currency"`,
        Prisma.sql`i.id IS NOT NULL`,
    ];

    // La vitrine d'une boutique réutilise cette requête, bornée à elle. Filtrer en
    // mémoire après coup tronquerait la vitrine d'une boutique de plus de vingt-quatre
    // produits, sans que rien ne le dise.
    if (shopSlug !== undefined) {
        liste.push(Prisma.sql`s.slug = ${shopSlug}`);
    }

    if (filters.category !== null) {
        liste.push(Prisma.sql`p.category = ${filters.category}::"product_category"`);
    }

    if (filters.search !== null) {
        const motif = `%${escapeLike(filters.search)}%`;
        liste.push(
            Prisma.sql`(unaccent(p.title) ILIKE unaccent(${motif}) ESCAPE '\\'
                     OR unaccent(s.shop_name) ILIKE unaccent(${motif}) ESCAPE '\\')`,
        );
    }

    return liste;
}

// La jointure d'image choisit la READY de position la plus basse. `DISTINCT ON` est la
// forme PostgreSQL : un seul passage, et c'est la ligne qu'on veut.
const IMAGE_JOIN = Prisma.raw(`
    LEFT JOIN LATERAL (
        SELECT pi.object_path, pi.id
        FROM product_images pi
        WHERE pi.product_id = p.id AND pi.status = 'READY'
        ORDER BY pi.position ASC
        LIMIT 1
    ) i ON TRUE
`);

export async function searchPublishedProducts(
    prisma: PrismaClient,
    input: { filters: ICatalogFilters; currency: string; shopSlug?: string },
): Promise<{ rows: ICatalogRow[]; total: number }> {
    const where = Prisma.join(
        conditions(input.filters, input.currency, input.shopSlug),
        " AND ",
    );
    const order = ORDERS[input.filters.sort] ?? ORDERS["newest"]!;

    // `::int` sur les agrégats : `MIN` et `COUNT` reviennent en bigint ou en numeric selon
    // le type de départ, et `node-postgres` rend ces types en CHAÎNE. Un prix devenu
    // chaîne traverserait le formatage sans erreur, en affichant un montant faux.
    const rows = await prisma.$queryRaw<ICatalogRow[]>`
        SELECT p.id, p.slug, p.title, p.category::text AS "category",
               s.slug AS "shopSlug", s.shop_name AS "shopName", s.currency::text AS "currency",
               MIN(v.price_amount)::int AS "minPriceAmount",
               COUNT(v.id)::int AS "variantCount",
               i.object_path AS "imagePath"
        FROM products p
        JOIN vendors s ON s.id = p.vendor_id
        JOIN product_variants v ON v.product_id = p.id
        ${IMAGE_JOIN}
        WHERE ${where}
        GROUP BY p.id, s.slug, s.shop_name, s.currency, i.object_path
        ORDER BY ${order}
        LIMIT ${CATALOG_PAGE_SIZE} OFFSET ${catalogOffset(input.filters.page)}
    `;

    const compte = await prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(DISTINCT p.id)::int AS "total"
        FROM products p
        JOIN vendors s ON s.id = p.vendor_id
        JOIN product_variants v ON v.product_id = p.id
        ${IMAGE_JOIN}
        WHERE ${where}
    `;

    return { rows, total: compte[0]?.total ?? 0 };
}

export async function listCatalogCurrencies(
    prisma: PrismaClient,
): Promise<{ currency: string; productCount: number }[]> {
    return prisma.$queryRaw`
        SELECT s.currency::text AS "currency", COUNT(DISTINCT p.id)::int AS "productCount"
        FROM products p
        JOIN vendors s ON s.id = p.vendor_id
        WHERE p.status = 'PUBLISHED' AND p.deleted_at IS NULL AND s.deleted_at IS NULL
              AND s.currency IS NOT NULL
        GROUP BY s.currency
        ORDER BY "productCount" DESC, "currency" ASC
    `;
}

export interface IPublicProduct {
    id: string;
    slug: string;
    title: string;
    description: string;
    category: string;
    currency: string;
    shopSlug: string;
    shopName: string;
    shopContactEmail: string;
    images: { objectPath: string; altText: string | null }[];
    options: { name: string; values: { id: string; value: string }[] }[];
    variants: { combinationKey: string; priceAmount: number }[];
}

// Déclaratif, contrairement à la liste : aucun agrégat à trier ici, donc aucune raison
// d'écrire du SQL. Le filtre porte sur la BOUTIQUE autant que sur le produit, parce que
// le slug produit n'est unique que par boutique.
export async function readPublishedProduct(
    prisma: PrismaClient,
    input: { shopSlug: string; productSlug: string },
): Promise<IPublicProduct | null> {
    const product = await prisma.product.findFirst({
        where: {
            slug: input.productSlug,
            status: "PUBLISHED",
            deletedAt: null,
            vendor: { slug: input.shopSlug, deletedAt: null },
        },
        select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            category: true,
            vendor: {
                select: { slug: true, shopName: true, contactEmail: true, currency: true },
            },
            images: {
                where: { status: "READY" },
                orderBy: { position: "asc" },
                select: { objectPath: true, altText: true },
            },
            options: {
                orderBy: { position: "asc" },
                select: {
                    name: true,
                    values: { orderBy: { position: "asc" }, select: { id: true, value: true } },
                },
            },
            variants: { select: { combinationKey: true, priceAmount: true } },
        },
    });

    if (!product || !product.vendor.currency) {
        return null;
    }

    return {
        id: product.id,
        slug: product.slug,
        title: product.title,
        description: product.description,
        category: product.category,
        currency: product.vendor.currency,
        shopSlug: product.vendor.slug,
        shopName: product.vendor.shopName,
        shopContactEmail: product.vendor.contactEmail,
        images: product.images,
        options: product.options,
        variants: product.variants,
    };
}

export interface IPublicShop {
    slug: string;
    shopName: string;
    shopDescription: string;
    categories: string[];
    currency: string;
}

export async function readPublishedShop(
    prisma: PrismaClient,
    input: { shopSlug: string },
): Promise<IPublicShop | null> {
    const shop = await prisma.vendor.findFirst({
        where: { slug: input.shopSlug, deletedAt: null },
        select: {
            slug: true,
            shopName: true,
            shopDescription: true,
            categories: true,
            currency: true,
        },
    });

    // Une boutique sans devise n'a aucun produit publiable, donc aucune vitrine à montrer.
    if (!shop || !shop.currency) {
        return null;
    }

    return { ...shop, currency: shop.currency, categories: shop.categories as string[] };
}
```

- [ ] **Step 4: Poser l'extension `unaccent`**

La recherche insensible aux accents demande `unaccent`, qui est une extension PostgreSQL.
Créer `packages/db/prisma/migrations/20261002130000_unaccent/migration.sql` :

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
```

Puis l'appliquer :

```bash
docker exec clemperl_dev_api sh -c "cd /app/packages/db && pnpm exec prisma migrate deploy"
```

Expected: `Applied`. Si l'extension est refusée faute de droits, c'est une information,
pas un détail : la consigner et basculer la recherche sur `ILIKE` seul, en retirant le test
sur les accents et en notant la limite dans la spec.

- [ ] **Step 5: Exporter le dépôt**

Dans `packages/db/src/repositories/index.ts`, ajouter en première ligne, l'ordre étant
alphabétique :

```ts
export * from "./catalog.repository.js";
```

- [ ] **Step 6: Lancer le test et vérifier qu'il passe**

Run: `docker exec clemperl_dev_api sh -c "cd /app && pnpm --filter @clemperl/db build && cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand catalog-repository"`
Expected: PASS, dix-sept tests.

Si une assertion de type échoue sur `minPriceAmount`, c'est le cas que le test existe pour
attraper : vérifier que le `::int` est bien présent dans le SQL.

- [ ] **Step 7: Lancer toute la couche intégration**

Run: `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"`
Expected: toutes les suites au vert. Les slugs portent un préfixe propre, donc aucune
collision avec les suites voisines.

---

## Task 4: La liste publique et le choix de devise

**Files:**
- Create: `apps/storefront/src/lib/currency-cookie.ts`
- Create: `apps/storefront/src/app/[locale]/catalog/page.tsx`
- Create: `apps/storefront/src/app/[locale]/catalog/components/catalog-filters.tsx`
- Create: `apps/storefront/src/app/[locale]/catalog/components/product-card.tsx`
- Create: `apps/storefront/src/app/[locale]/components/currency-selector.tsx`
- Modify: `apps/storefront/src/app/[locale]/layout.tsx`
- Modify: `packages/i18n/messages/storefront/fr.json`, `packages/i18n/messages/storefront/en.json`
- Create: `e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: `searchPublishedProducts`, `listCatalogCurrencies` de la tâche 3 ;
  `readCatalogFilters`, `CATALOG_PAGE_SIZE`, `CATALOG_SORTS` de la tâche 2 ;
  `derivativePath` de `@clemperl/domain/browser`.
- Produces: `readCurrencyCookie(): Promise<string>`, `CURRENCY_COOKIE = "currency"`.

- [ ] **Step 1: Ajouter les libellés**

Dans `packages/i18n/messages/storefront/fr.json`, une section de premier niveau :

```json
"catalog": {
  "title": "Le catalogue",
  "searchLabel": "Rechercher",
  "searchPlaceholder": "Un article, une boutique",
  "categoryLabel": "Catégorie",
  "categoryAll": "Toutes les catégories",
  "sortLabel": "Trier par",
  "sortNewest": "Les plus récents",
  "sortPriceAsc": "Prix croissant",
  "sortPriceDesc": "Prix décroissant",
  "currencyLabel": "Devise",
  "currencyHint": "Le catalogue ne montre que les boutiques qui chiffrent dans cette devise.",
  "empty": "Aucun article ne correspond. Essayez un autre terme, ou retirez un filtre.",
  "emptyCurrency": "Aucune boutique ne vend encore dans cette devise.",
  "fromPrice": "à partir de {price}",
  "previous": "Page précédente",
  "next": "Page suivante",
  "pageStatus": "Page {page} sur {pages}",
  "resultCount": "{count} articles",
  "productCategory": {
    "APPAREL": "Vêtements",
    "JEWELLERY": "Joaillerie",
    "LEATHER_GOODS": "Maroquinerie"
  }
},
```

Et la traduction anglaise correspondante dans `en.json`, mêmes clés.

- [ ] **Step 2: Écrire la lecture du cookie**

Créer `apps/storefront/src/lib/currency-cookie.ts` :

```ts
import { listCatalogCurrencies, prisma } from "@clemperl/db";
import { chooseCatalogCurrency } from "@clemperl/domain";
import { cookies } from "next/headers";

// Non `httpOnly` : c'est un composant client qui l'écrit, et il ne porte rien de sensible.
export const CURRENCY_COOKIE = "currency";

// La devise borne la LISTE, et seulement elle. Une valeur inconnue, ou une devise
// qu'aucun produit publié ne porte, retombe sur la plus fournie plutôt que de rendre une
// liste vide qui ressemblerait à un catalogue sans produits.
export async function readCurrencyCookie(): Promise<{
    current: string;
    available: { currency: string; productCount: number }[];
}> {
    const available = await listCatalogCurrencies(prisma);
    const demandee = (await cookies()).get(CURRENCY_COOKIE)?.value;

    // La décision elle-même est PURE et vit dans le domaine, avec ses tests. Ici on ne
    // fait que lire le cookie et la base.
    return {
        current: chooseCatalogCurrency(
            demandee,
            available.map((entree) => entree.currency),
        ),
        available,
    };
}
```

- [ ] **Step 3: Écrire le sélecteur de devise**

Créer `apps/storefront/src/app/[locale]/components/currency-selector.tsx` :

```tsx
"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent, JSX } from "react";

interface CurrencySelectorProps {
    current: string;
    available: string[];
    label: string;
}

// Client, parce qu'il ÉCRIT le cookie. Un an, et `SameSite=Lax` pour qu'il survive à un
// lien entrant. `router.refresh()` plutôt qu'un rechargement : les composants serveur se
// rejouent avec le nouveau cookie, sans perdre la position de défilement.
export function CurrencySelector(props: CurrencySelectorProps): JSX.Element {
    const router = useRouter();

    function onChange(event: ChangeEvent<HTMLSelectElement>): void {
        document.cookie = `currency=${event.target.value}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
    }

    return (
        <label className="flex items-center gap-2 text-sm text-muet">
            {props.label}
            <select
                value={props.current}
                onChange={onChange}
                className="border border-bordure bg-transparent px-2 py-1 text-sm text-texte"
            >
                {props.available.map((code) => (
                    <option key={code} value={code}>
                        {code}
                    </option>
                ))}
            </select>
        </label>
    );
}
```

- [ ] **Step 4: Écrire la carte de produit**

Créer `apps/storefront/src/app/[locale]/catalog/components/product-card.tsx` :

```tsx
import { derivativePath } from "@clemperl/domain/browser";
import Link from "next/link";
import type { JSX } from "react";

interface ProductCardProps {
    shopSlug: string;
    productSlug: string;
    title: string;
    shopName: string;
    imagePath: string;
    /** Déjà formaté par le serveur. Aucun prix ne se formate côté client. */
    price: string;
}

// Composant SERVEUR. Un `img` ordinaire et non `next/image` : la vignette est servie par
// la route de relais de cette même application, avec un cache d'un an et un chemin
// immuable. L'optimiseur n'y gagnerait rien et demanderait d'autoriser l'origine.
export function ProductCard(props: ProductCardProps): JSX.Element {
    return (
        <Link
            href={`/shops/${props.shopSlug}/${props.productSlug}`}
            className="flex flex-col border border-bordure"
        >
            <img
                data-testid="vignette"
                src={`/api/media/${derivativePath(props.imagePath, 320)}`}
                alt=""
                className="aspect-square w-full object-cover"
            />
            <span className="px-4 pt-4 text-sm">{props.title}</span>
            <span className="px-4 text-xs text-muet">{props.shopName}</span>
            <span className="px-4 pb-4 pt-2 text-sm">{props.price}</span>
        </Link>
    );
}
```

- [ ] **Step 5: Écrire le composant de filtres**

Créer `apps/storefront/src/app/[locale]/catalog/components/catalog-filters.tsx` :

```tsx
"use client";

import { CATALOG_SORTS, PRODUCT_CATEGORIES } from "@clemperl/domain/browser";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, JSX } from "react";

interface CatalogFiltersProps {
    labels: Record<string, string>;
    categoryLabels: Record<string, string>;
}

// Client, parce qu'il ÉCRIT dans l'URL. Les filtres y vivent plutôt que dans un état
// React : une liste filtrée se partage et s'indexe, et le bouton Retour du navigateur
// retrouve le filtre précédent sans qu'on écrive quoi que ce soit.
export function CatalogFilters(props: CatalogFiltersProps): JSX.Element {
    const router = useRouter();
    const params = useSearchParams();

    function onSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const suivants = new URLSearchParams();
        for (const cle of ["q", "category", "sort"]) {
            const valeur = String(form.get(cle) ?? "").trim();
            if (valeur !== "") {
                suivants.set(cle, valeur);
            }
        }
        // La page repart à 1 : garder la page courante après un changement de filtre
        // montrerait une page vide sans que rien ne l'explique.
        router.push(`?${suivants.toString()}`);
    }

    return (
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
                {props.labels["searchLabel"]}
                <input
                    name="q"
                    defaultValue={params.get("q") ?? ""}
                    placeholder={props.labels["searchPlaceholder"]}
                    className="border border-bordure bg-transparent px-3 py-2 text-sm"
                />
            </label>

            <label className="flex flex-col gap-1 text-sm">
                {props.labels["categoryLabel"]}
                <select
                    name="category"
                    defaultValue={params.get("category") ?? ""}
                    className="border border-bordure bg-transparent px-3 py-2 text-sm"
                >
                    <option value="">{props.labels["categoryAll"]}</option>
                    {PRODUCT_CATEGORIES.map((value) => (
                        <option key={value} value={value}>
                            {props.categoryLabels[value] ?? value}
                        </option>
                    ))}
                </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
                {props.labels["sortLabel"]}
                <select
                    name="sort"
                    defaultValue={params.get("sort") ?? "newest"}
                    className="border border-bordure bg-transparent px-3 py-2 text-sm"
                >
                    {CATALOG_SORTS.map((value) => (
                        <option key={value} value={value}>
                            {props.labels[`sort_${value}`] ?? value}
                        </option>
                    ))}
                </select>
            </label>

            <button type="submit" className="border border-bordure px-4 py-2 text-sm">
                {props.labels["searchLabel"]}
            </button>
        </form>
    );
}
```

- [ ] **Step 6: Écrire la page de liste**

Créer `apps/storefront/src/app/[locale]/catalog/page.tsx` :

```tsx
import { prisma, searchPublishedProducts } from "@clemperl/db";
import { CATALOG_PAGE_SIZE, formatPrice, readCatalogFilters } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { JSX } from "react";
import { readCurrencyCookie } from "../../../lib/currency-cookie";
import { CurrencySelector } from "../components/currency-selector";
import { CatalogFilters } from "./components/catalog-filters";
import { ProductCard } from "./components/product-card";

// La devise vient d'un cookie, donc la page est PERSONNELLE et ne se met pas en cache
// page entière. C'est la conséquence assumée du choix de ranger la devise là. Le poids
// réel est sur les images, qui gardent le cache d'un an de la route de relais.
export const dynamic = "force-dynamic";

export default async function CatalogPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
    const { locale } = await params;
    const t = await getTranslations("catalog");
    const filters = readCatalogFilters(await searchParams);
    const { current, available } = await readCurrencyCookie();

    const { rows, total } = await searchPublishedProducts(prisma, { filters, currency: current });
    const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));

    const libelles = {
        searchLabel: t("searchLabel"),
        searchPlaceholder: t("searchPlaceholder"),
        categoryLabel: t("categoryLabel"),
        categoryAll: t("categoryAll"),
        sortLabel: t("sortLabel"),
        sort_newest: t("sortNewest"),
        sort_price_asc: t("sortPriceAsc"),
        sort_price_desc: t("sortPriceDesc"),
    };
    const categories = {
        APPAREL: t("productCategory.APPAREL"),
        JEWELLERY: t("productCategory.JEWELLERY"),
        LEATHER_GOODS: t("productCategory.LEATHER_GOODS"),
    };

    return (
        <main className="mx-auto max-w-6xl px-6 py-16">
            <div className="flex items-baseline justify-between">
                <h1 className="font-titre text-4xl tracking-tight">{t("title")}</h1>
                <CurrencySelector
                    current={current}
                    available={available.map((entree) => entree.currency)}
                    label={t("currencyLabel")}
                />
            </div>

            <div className="mt-10">
                <CatalogFilters labels={libelles} categoryLabels={categories} />
            </div>

            {rows.length === 0 ? (
                <p className="mt-16 text-sm text-muet">
                    {available.length === 0 ? t("emptyCurrency") : t("empty")}
                </p>
            ) : (
                <>
                    <p className="mt-10 text-xs text-muet">{t("resultCount", { count: total })}</p>
                    <ul className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-4">
                        {rows.map((row) => (
                            <li key={row.id}>
                                <ProductCard
                                    shopSlug={row.shopSlug}
                                    productSlug={row.slug}
                                    title={row.title}
                                    shopName={row.shopName}
                                    imagePath={row.imagePath}
                                    // Formaté ICI, côté serveur. `formatPrice` tire
                                    // `@clemperl/core`, donc nodemailer : un composant
                                    // client qui l'importerait casserait le paquet
                                    // navigateur.
                                    price={
                                        row.variantCount > 1
                                            ? t("fromPrice", {
                                                  price: formatPrice(
                                                      row.minPriceAmount,
                                                      row.currency as never,
                                                      locale,
                                                  ),
                                              })
                                            : formatPrice(
                                                  row.minPriceAmount,
                                                  row.currency as never,
                                                  locale,
                                              )
                                    }
                                />
                            </li>
                        ))}
                    </ul>

                    <nav className="mt-12 flex items-center gap-6 text-sm">
                        {filters.page > 1 && (
                            <Link href={`?page=${filters.page - 1}`} className="underline">
                                {t("previous")}
                            </Link>
                        )}
                        <span className="text-muet">
                            {t("pageStatus", { page: filters.page, pages })}
                        </span>
                        {filters.page < pages && (
                            <Link href={`?page=${filters.page + 1}`} className="underline">
                                {t("next")}
                            </Link>
                        )}
                    </nav>
                </>
            )}
        </main>
    );
}
```

- [ ] **Step 7: Ajouter le lien du catalogue dans l'en-tête**

Dans `apps/storefront/src/app/[locale]/layout.tsx`, dans la fonction `EnTete`, ajouter
entre le logo et le lien de compte :

```tsx
                <Link href="/catalog" className="text-sm text-muet hover:text-texte">
                    {t("catalog")}
                </Link>
```

Et la clé `"catalog": "Le catalogue"` dans la section `navigation` des deux catalogues de
traduction.

Élargir aussi le conteneur de l'en-tête de `max-w-2xl` à `max-w-6xl`, pour qu'il
s'aligne sur la grille du catalogue.

- [ ] **Step 8: Reconstruire et vérifier à l'écran**

```bash
pnpm docker:up
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/fr/catalog
```

Expected: `200`.

- [ ] **Step 9: Écrire le parcours navigateur**

Créer `e2e/catalog.spec.ts` :

```ts
import { expect, test } from "@playwright/test";
import { URL_STOREFRONT, URL_VENDOR } from "../playwright.config";
import { createApprovedVendorShop } from "./helpers/accounts";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test("un visiteur parcourt le catalogue, filtre, et ouvre une fiche", async ({
    page,
    request,
    browser,
}) => {
    // Un produit publié avec sa photo : le catalogue n'a rien à montrer sans lui.
    await createApprovedVendorShop(page, request, browser);
    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();

    await page.goto(`${URL_VENDOR}/products/new`);
    await page.getByRole("textbox", { name: "Titre" }).fill("Sac cabas du catalogue");
    await page
        .getByRole("textbox", { name: "Description" })
        .fill("Cuir pleine fleur tanné végétal, coutures à la main, doublure en lin.");
    await page.getByRole("combobox", { name: "Catégorie" }).selectOption("LEATHER_GOODS");
    await page.getByRole("textbox", { name: "Prix", exact: true }).fill("180,00");
    await page.getByRole("button", { name: "Créer le produit" }).click();
    await page.waitForURL(/\/products\/[^/]+$/);

    await page.getByLabel("Ajouter des photos").setInputFiles("e2e/fixtures/product.jpg");
    await expect(page.getByTestId("vignette")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByText("Publié")).toBeVisible();

    // Le visiteur, sans session.
    const visiteur = await browser.newPage();
    await visiteur.goto(`${URL_STOREFRONT}/fr/catalog`);
    await expect(visiteur.getByText("Sac cabas du catalogue")).toBeVisible();

    // Critère 2 : le filtre ne remonte que les produits de cette catégorie.
    await visiteur.getByRole("combobox", { name: "Catégorie" }).selectOption("JEWELLERY");
    await visiteur.getByRole("button", { name: "Rechercher" }).click();
    await expect(visiteur.getByText("Sac cabas du catalogue")).toHaveCount(0);

    await visiteur.getByRole("combobox", { name: "Catégorie" }).selectOption("LEATHER_GOODS");
    await visiteur.getByRole("button", { name: "Rechercher" }).click();
    await visiteur.getByText("Sac cabas du catalogue").click();

    await visiteur.waitForURL(/\/shops\/[^/]+\/[^/]+$/);
    await expect(visiteur.getByRole("heading", { name: "Sac cabas du catalogue" })).toBeVisible();
    await visiteur.close();
});
```

- [ ] **Step 10: Lancer le parcours**

Run: `pnpm test:e2e -- --grep "catalogue"`
Expected: PASS. Ce parcours dépend de la fiche, livrée en tâche 5 : il échouera sur la
dernière assertion tant que la tâche 5 n'est pas faite. L'exécuter quand même pour
constater que tout ce qui précède passe, puis le relancer en fin de tâche 5.

---

## Task 5: La vitrine et la fiche produit

**Files:**
- Create: `apps/storefront/src/app/[locale]/shops/[shop]/page.tsx`
- Create: `apps/storefront/src/app/[locale]/shops/[shop]/[product]/page.tsx`
- Create: `apps/storefront/src/app/[locale]/shops/[shop]/[product]/components/variant-selector.tsx`
- Modify: `packages/i18n/messages/storefront/fr.json`, `en.json`
- Modify: `e2e/catalog.spec.ts`
- Modify: `docs/passation.md`

**Interfaces:**
- Consumes: `readPublishedProduct`, `readPublishedShop`, `searchPublishedProducts` de la
  tâche 3 ; `selectionKey` de `@clemperl/domain/browser`.

- [ ] **Step 1: Ajouter les libellés de la fiche**

Dans les deux catalogues storefront, section `catalog`, ajouter :

```json
"shopProducts": "Les articles de cette boutique",
"contactShop": "Contacter la boutique",
"contactSubject": "Votre article : {title}",
"contactBody": "Bonjour,\n\nJe suis intéressé par « {title} » ({variant}), au prix de {price}.\n\nMerci de me dire comment procéder.",
"noVariantChosen": "Choisissez une déclinaison",
"shopNotFound": "Cette boutique n'existe pas, ou n'a pas encore ouvert.",
```

- [ ] **Step 2: Écrire le sélecteur de déclinaison**

Créer `apps/storefront/src/app/[locale]/shops/[shop]/[product]/components/variant-selector.tsx` :

```tsx
"use client";

import { variantCombinationKey } from "@clemperl/domain/browser";
import { useState, type JSX } from "react";

interface VariantSelectorProps {
    options: { name: string; values: { id: string; value: string }[] }[];
    /** Clé de combinaison vers prix DÉJÀ FORMATÉ par le serveur. */
    prices: Record<string, string>;
    contact: { href: string; label: string };
    emptyLabel: string;
}

// Le seul composant interactif de la fiche, et il ne formate AUCUN prix : il reçoit des
// chaînes déjà prêtes. `formatPrice` tire `@clemperl/core`, donc nodemailer, donc
// `node:net`, et Turbopack refuse d'assembler un paquet navigateur qui le contient.
// L'erreur, si quelqu'un l'importe ici, ne nomme aucun de ces maillons.
export function VariantSelector(props: VariantSelectorProps): JSX.Element {
    // La sélection range des IDENTIFIANTS de valeur, pas des libellés : c'est ce que la
    // clé de combinaison attend, et c'est ce que la base range.
    const [selection, setSelection] = useState<Record<string, string>>({});

    const complet = props.options.every(
        (option) => (selection[option.name] ?? "") !== "",
    );
    const cle = variantCombinationKey(Object.values(selection).filter((id) => id !== ""));
    const prix = props.prices[cle];

    return (
        <div className="mt-8 flex flex-col gap-6">
            {props.options.map((option) => (
                <label key={option.name} className="flex flex-col gap-1 text-sm">
                    {option.name}
                    <select
                        className="border border-bordure bg-transparent px-3 py-2 text-sm"
                        value={selection[option.name] ?? ""}
                        onChange={(event) =>
                            setSelection((courant) => ({
                                ...courant,
                                [option.name]: event.target.value,
                            }))
                        }
                    >
                        <option value="">{props.emptyLabel}</option>
                        {option.values.map((valeur) => (
                            <option key={valeur.id} value={valeur.id}>
                                {valeur.value}
                            </option>
                        ))}
                    </select>
                </label>
            ))}

            <p data-testid="prix" className="text-2xl">
                {complet && prix !== undefined ? prix : props.emptyLabel}
            </p>

            {complet && prix !== undefined && (
                <a href={props.contact.href} className="self-start border border-bordure px-6 py-3 text-sm">
                    {props.contact.label}
                </a>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Écrire la fiche produit**

Créer `apps/storefront/src/app/[locale]/shops/[shop]/[product]/page.tsx` :

```tsx
import { prisma, readPublishedProduct } from "@clemperl/db";
import { derivativePath, formatPrice } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { VariantSelector } from "./components/variant-selector";

export const dynamic = "force-dynamic";

export default async function ProductPage({
    params,
}: {
    params: Promise<{ locale: string; shop: string; product: string }>;
}): Promise<JSX.Element> {
    const { locale, shop, product: productSlug } = await params;
    const t = await getTranslations("catalog");

    // Le filtre porte sur la BOUTIQUE autant que sur le produit : le slug produit n'est
    // unique que par boutique, donc `/shops/A/<produit-de-B>` doit rendre 404 et non le
    // produit de B sous l'identité de A.
    const product = await readPublishedProduct(prisma, {
        shopSlug: shop,
        productSlug,
    });
    if (!product) {
        notFound();
    }

    // Formaté ICI, une fois, et passé au composant client sous forme de chaînes.
    const prices = Object.fromEntries(
        product.variants.map((variant) => [
            variant.combinationKey,
            formatPrice(variant.priceAmount, product.currency as never, locale),
        ]),
    );
    const plancher = Math.min(...product.variants.map((variant) => variant.priceAmount));
    const prixPlancher = formatPrice(plancher, product.currency as never, locale);

    const sujet = t("contactSubject", { title: product.title });
    const corps = t("contactBody", {
        title: product.title,
        variant: product.options.map((option) => option.name).join(", "),
        price: prixPlancher,
    });
    const contactHref = `mailto:${product.shopContactEmail}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;

    return (
        <main className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid gap-12 md:grid-cols-2">
                <div className="flex flex-col gap-4">
                    {product.images.map((image) => (
                        <img
                            key={image.objectPath}
                            data-testid="vignette"
                            src={`/api/media/${derivativePath(image.objectPath, 800)}`}
                            alt={image.altText ?? ""}
                            className="w-full object-cover"
                        />
                    ))}
                </div>

                <div>
                    <h1 className="font-titre text-4xl tracking-tight">{product.title}</h1>
                    <Link
                        href={`/shops/${product.shopSlug}`}
                        className="mt-2 inline-block text-sm text-muet underline"
                    >
                        {product.shopName}
                    </Link>
                    <p className="mt-8 text-sm leading-relaxed">{product.description}</p>

                    <VariantSelector
                        options={product.options}
                        prices={prices}
                        contact={{ href: contactHref, label: t("contactShop") }}
                        emptyLabel={t("noVariantChosen")}
                    />
                </div>
            </div>
        </main>
    );
}
```

Attention au cas du produit SANS axe : `product.options` est vide, `selectionKey({})` rend
la chaîne vide, et `prices[""]` existe puisque T2b écrit une variante de clé vide. Le
sélecteur affiche alors directement le prix et le lien, ce qui est le comportement voulu.

- [ ] **Step 4: Écrire la vitrine**

Créer `apps/storefront/src/app/[locale]/shops/[shop]/page.tsx` :

```tsx
import { prisma, readPublishedShop, searchPublishedProducts } from "@clemperl/db";
import { formatPrice, readCatalogFilters } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { ProductCard } from "../../catalog/components/product-card";

export const dynamic = "force-dynamic";

export default async function ShopPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string; shop: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
    const { locale, shop: shopSlug } = await params;
    const t = await getTranslations("catalog");

    const shop = await readPublishedShop(prisma, { shopSlug });
    if (!shop) {
        notFound();
    }

    // La vitrine ne respecte PAS le cookie de devise : un produit s'affiche toujours dans
    // la devise de sa boutique. Borner la vitrine ferait disparaître les produits de la
    // boutique qu'on est précisément venu voir.
    const { rows: siens } = await searchPublishedProducts(prisma, {
        filters: readCatalogFilters(await searchParams),
        currency: shop.currency,
        shopSlug,
    });

    return (
        <main className="mx-auto max-w-6xl px-6 py-16">
            <h1 className="font-titre text-4xl tracking-tight">{shop.shopName}</h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muet">
                {shop.shopDescription}
            </p>

            <h2 className="mt-16 text-sm text-muet">{t("shopProducts")}</h2>
            <ul className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-4">
                {siens.map((row) => (
                    <li key={row.id}>
                        <ProductCard
                            shopSlug={row.shopSlug}
                            productSlug={row.slug}
                            title={row.title}
                            shopName={row.shopName}
                            imagePath={row.imagePath}
                            price={formatPrice(row.minPriceAmount, row.currency as never, locale)}
                        />
                    </li>
                ))}
            </ul>
        </main>
    );
}
```

Le filtre par boutique est passé à la REQUÊTE, pas appliqué après coup : filtrer en
mémoire la page rendue tronquerait la vitrine d'une boutique de plus de vingt-quatre
produits, en silence.

- [ ] **Step 5: Compléter le parcours navigateur**

Dans `e2e/catalog.spec.ts`, après l'assertion sur le titre de la fiche :

```ts
    // Critère 7 : le prix suit la déclinaison choisie, et le contact est prérempli.
    await expect(visiteur.getByTestId("prix")).toContainText("180,00");
    await expect(visiteur.getByRole("link", { name: "Contacter la boutique" })).toHaveAttribute(
        "href",
        /^mailto:.*subject=/,
    );

    // Le nom de la boutique mène à sa vitrine.
    await visiteur.getByRole("link", { name: /Atelier|Boutique/ }).first().click();
    await visiteur.waitForURL(/\/shops\/[^/]+$/);
    await expect(visiteur.getByTestId("vignette").first()).toBeVisible();
```

Et un second test, dans le même fichier :

```ts
test("un brouillon n'est pas lisible par son URL directe", async ({ page }) => {
    const reponse = await page.goto(`${URL_STOREFRONT}/fr/shops/inexistante/inexistant`);
    expect(reponse?.status()).toBe(404);
});
```

- [ ] **Step 6: Lancer le parcours complet**

Run: `pnpm test:e2e`
Expected: tous les parcours au vert, les anciens comme les deux nouveaux.

- [ ] **Step 7: Mettre la passation à jour**

Dans `docs/passation.md`, passer la ligne T2d à `**Livrée**`, et ajouter dans la section
des décisions ouvertes :

```markdown
**La liste du catalogue n'est pas cacheable page entière.** La devise vit dans un cookie,
donc la page est personnelle. C'est la conséquence assumée du choix de T2d, et le poids
réel reste sur les images, qui gardent le cache d'un an de la route de relais. Le jour où
la liste coûte trop cher, la sortie est de passer la devise dans l'URL, ce qui rend la
page cacheable par adresse.
```

- [ ] **Step 8: Vérification finale, toutes couches**

```bash
pnpm lint && pnpm typecheck && pnpm test
docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.e2e.ts --runInBand"
pnpm test:e2e
```

Expected: tout au vert, seuils de couverture tenus.

- [ ] **Step 9: Vérifier qu'aucun prix n'est formaté côté client**

C'est le critère 8 de la spec, et il se cherche mécaniquement :

```bash
grep -rln '"use client"' apps/storefront/src \
  | xargs grep -n "^import.*@clemperl/core\|^import.*formatPrice" || echo "aucun"
```

Expected: `aucun`. Le motif vise les lignes d'IMPORT et non toute mention : un commentaire
qui explique pourquoi on n'importe pas `formatPrice` est exactement ce qu'on veut lire, et
un contrôle qui le signale apprend à ignorer ses propres alertes. Un fichier qui remonte ici ferait entrer nodemailer dans le paquet
navigateur, et l'erreur de Turbopack ne nommerait aucun des maillons en cause.

- [ ] **Step 10: Vérifier qu'aucun tiret quadratin n'a été introduit**

```bash
git diff | grep -n "^+.*—"
```

Expected: aucune sortie, hors citation verbatim.
