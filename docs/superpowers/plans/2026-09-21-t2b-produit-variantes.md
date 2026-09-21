# T2b — Le produit et ses variantes : plan d'implémentation

> **Pour un exécutant agentique :** SOUS-SKILL REQUISE — `superpowers:executing-plans`.
> Les étapes utilisent des cases à cocher (`- [ ]`).

**But** : un vendeur validé crée un produit, déclare ses axes, fixe un prix par variante,
et le publie.

**Architecture** : cinq tables relationnelles dans `packages/db` ; les règles pures dans
`packages/domain` ; les écrans dans `apps/vendor` par server actions, sans passer par
l'API NestJS. La grille de variantes est une fonction **pure**, et l'unicité d'une
combinaison est une contrainte de base, pas une vérification de code.

**Pile** : Prisma 7 + PostgreSQL, Next 16 (App Router, server actions), Zod, Vitest
(packages), Jest + Testcontainers (intégration), Playwright (navigateur).

**Spec** : `docs/superpowers/specs/2026-09-21-t2b-produit-variantes-design.md`

## Contraintes globales

Ces règles s'appliquent à **toutes** les tâches. Elles ne sont pas répétées ensuite.

- **Aucun commit intermédiaire.** Ni par tâche, ni par étape. Un seul commit à la fin de
  la tranche, rédigé à la tâche 8 et **exécuté par le propriétaire du dépôt**. Le design
  et ce plan ne se commitent pas séparément : ils partent dans ce commit unique.
- **Aucune écriture Git** de la part de l'exécutant : ni `add`, ni `commit`, ni `push`,
  ni `checkout`, ni `branch`.
- **Le code s'écrit en anglais** — identifiants, noms de fichiers, segments d'URL, clés
  de traduction. **Les commentaires et la documentation en français.**
- **Aucun libellé visible n'est écrit dans un `.tsx`** : tout passe par
  `packages/i18n/messages/vendor/fr.json`.
- **Un commentaire explique POURQUOI**, jamais ce que le code dit déjà.
- **Nommage Prisma** : `@map` en snake_case par colonne, `@@map` au **pluriel** par
  table, enums au **singulier** avec `@@map`, identifiants en `cuid(2)`.
- **`noUncheckedIndexedAccess` est actif** : une cellule lue par indice vaut
  `T | undefined`. Déclarer des tuples plutôt que d'indexer un tableau de tableaux.
- **Tailwind 4 n'accepte plus `classe-[--variable]`.** Écrire l'utilitaire généré
  (`accent-texte`, `text-muet`) quand le jeton vient de `@theme`.
- **Playwright** : préférer `getByRole` avec un nom accessible à `getByLabel` — `Field`
  enveloppe son contrôle dans le `<label>`, et la comparaison se fait par sous-chaîne.
- **Le cliquet de couverture monte, il ne descend jamais.** Les planchers valent la
  valeur mesurée.
- **Toute variable lue au build va dans `globalEnv` de `turbo.json`**, sinon le mode
  strict de Turbo la filtre.

## Structure des fichiers

### `packages/db`

| Fichier | Responsabilité |
|---|---|
| `prisma/schema.prisma` | + `E_PRODUCT_STATUS`, 5 modèles, `Vendor.currency` |
| `prisma/migrations/<horodatage>_products/migration.sql` | la migration, générée |
| `src/repositories/product.repository.ts` | lire, créer, corriger, publier — toujours filtré par `vendorId` |
| `src/repositories/vendor.repository.ts` | + `setShopCurrency`, + `countProductsForVendor` |
| `src/index.ts` | réexport des nouveaux types et de l'enum |

### `packages/domain`

| Fichier | Responsabilité |
|---|---|
| `utils/slug.utils.ts` | le noyau de slugification, neutre |
| `utils/shop-slug.utils.ts` | *modifié* — délègue au noyau |
| `utils/product-slug.utils.ts` | le slug d'un titre de produit |
| `utils/price.utils.ts` | chaîne saisie ↔ unité mineure, par devise |
| `utils/variant-matrix.utils.ts` | les axes → la grille, **pure** |
| `schemas/product.schema.ts` | titre, description, axes, prix |
| `errors/product.error.ts` | les refus, localisés |

### `apps/vendor`

| Fichier | Responsabilité |
|---|---|
| `src/app/products/page.tsx` | la liste |
| `src/app/products/actions.ts` | créer |
| `src/app/products/new/page.tsx` | l'écran de création |
| `src/app/products/new/new-product-form.tsx` | son formulaire |
| `src/app/products/[id]/page.tsx` | la fiche |
| `src/app/products/[id]/actions.ts` | corriger, publier, dépublier |
| `src/app/products/[id]/product-form.tsx` | le formulaire, axes et grille |
| `src/app/products/types/product-form-state.interface.ts` | l'état des formulaires |
| `src/app/shop/shop-form.tsx` | *modifié* — le sélecteur de devise |
| `src/app/shop/actions.ts` | *modifié* — `saveShopCurrency` |

---

## Tâche 1 : Le schéma, la migration et ses contraintes

**Fichiers**
- Modifier : `packages/db/prisma/schema.prisma`
- Créer : `packages/db/prisma/migrations/<horodatage>_products/migration.sql` (générée)
- Modifier : `packages/db/src/index.ts`
- Tester : `apps/api/test/product-schema.int-spec.ts`

**Interfaces**
- Produit : l'enum `E_PRODUCT_STATUS`, les modèles `Product`, `ProductOption`,
  `ProductOptionValue`, `ProductVariant`, `ProductVariantValue`, et la colonne
  `Vendor.currency`.

- [x] **Étape 1 : ajouter l'enum et la colonne de devise**

Dans `packages/db/prisma/schema.prisma`, à la suite des enums existants :

```prisma
enum E_PRODUCT_STATUS {
  DRAFT
  PUBLISHED

  @@map("product_status")
}
```

Dans `model Vendor`, après `categories` :

```prisma
  // Nullable et SANS valeur par défaut. Un défaut faux est exactement ce qui produit
  // des montants faux sans rien signaler : `10000` vaut dix mille francs CFA ou cent
  // euros selon cette colonne, et rien à l'écran ne distingue les deux. Le vendeur la
  // choisit dans `/shop`, et elle se fige dès qu'un produit existe.
  currency E_CURRENCY? @map("currency")
```

`E_CURRENCY` n'existe pas encore côté Prisma. L'ajouter avec les mêmes valeurs que
`packages/core/src/enums/currency.enum.ts`, qui reste la source pour le code :

```prisma
enum E_CURRENCY {
  EUR
  USD
  XOF
  XAF
  CDF

  @@map("currency")
}
```

- [x] **Étape 2 : ajouter les cinq modèles**

À la fin de `schema.prisma` :

```prisma
model Product {
  id          String           @id @default(cuid(2))
  vendorId    String           @map("vendor_id")
  slug        String
  title       String
  description String
  status      E_PRODUCT_STATUS @default(DRAFT)

  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")
  publishedAt DateTime? @map("published_at")

  // `Cascade` : fermer une boutique emporte son catalogue, qui n'a aucun sens sans
  // elle. C'est l'inverse d'une décision administrative, qu'on conserve.
  vendor   Vendor          @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  options  ProductOption[]
  variants ProductVariant[]

  // Le slug part dans les URL publiques en T2d. Unique par boutique, pas globalement :
  // deux vendeurs ont le droit de vendre chacun leur « sac-cabas ».
  @@unique([vendorId, slug])
  @@index([vendorId, status])
  @@map("products")
}

model ProductOption {
  id        String @id @default(cuid(2))
  productId String @map("product_id")
  name      String
  position  Int

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  values  ProductOptionValue[]
  variantValues ProductVariantValue[]

  @@unique([productId, name])
  @@map("product_options")
}

model ProductOptionValue {
  id       String @id @default(cuid(2))
  optionId String @map("option_id")
  label    String
  position Int

  option        ProductOption         @relation(fields: [optionId], references: [id], onDelete: Cascade)
  variantValues ProductVariantValue[]

  @@unique([optionId, label])
  @@map("product_option_values")
}

model ProductVariant {
  id        String @id @default(cuid(2))
  productId String @map("product_id")

  // Entier, dans l'unité mineure de la devise de la BOUTIQUE. La devise n'est pas ici :
  // une seule écriture par boutique, donc aucune divergence entre deux variantes.
  priceAmount Int @map("price_amount")

  // Les identifiants des valeurs de cette variante, TRIÉS puis joints. Sans le tri,
  // « M|Noir » et « Noir|M » désigneraient la même combinaison sous deux clés, et
  // l'index unique ne verrait rien. Vide quand le produit n'a aucun axe — l'unicité
  // garantit alors EXACTEMENT une variante.
  combinationKey String @map("combination_key")
  position       Int

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  values  ProductVariantValue[]

  @@unique([productId, combinationKey])
  @@map("product_variants")
}

model ProductVariantValue {
  id            String @id @default(cuid(2))
  variantId     String @map("variant_id")
  optionId      String @map("option_id")
  optionValueId String @map("option_value_id")

  variant     ProductVariant     @relation(fields: [variantId], references: [id], onDelete: Cascade)
  option      ProductOption      @relation(fields: [optionId], references: [id], onDelete: Cascade)
  optionValue ProductOptionValue @relation(fields: [optionValueId], references: [id], onDelete: Cascade)

  // `optionId` paraît redondant — une jointure le retrouverait depuis la valeur. Il est
  // là pour porter CET index, qui interdit qu'une variante déclare deux tailles. Une
  // colonne dénormalisée contre une contrainte que la base tient seule.
  @@unique([variantId, optionId])
  @@map("product_variant_values")
}
```

`ProductOption` déclare deux relations vers `Product` en apparence — celle de son
parent et celle de `ProductVariantValue`. Prisma exige alors un nom de relation sur
chacune, OU que les deux extrémités soient sans ambiguïté. Ici elles le sont : `product`
pointe `Product`, `variantValues` pointe `ProductVariantValue`. Si `prisma validate`
réclame quand même un nom, le donner explicitement plutôt que de déplacer un champ.

Ajouter enfin dans `model Vendor`, à la liste des relations :

```prisma
  products Product[]
```

- [x] **Étape 3 : générer la migration**

`migrate dev` est **interactif** et attend une réponse que personne ne donnera dans un
conteneur. Passer par `migrate diff` puis `migrate deploy` :

```bash
docker exec clemperl_dev_api sh -c "cd packages/db && \
  pnpm exec prisma migrate diff \
    --from-config-datasource prisma.config.ts \
    --to-schema-datamodel prisma/schema.prisma \
    --script" > /tmp/products.sql
```

Créer le dossier `packages/db/prisma/migrations/20260921120000_products/` et y déposer
le contenu sous `migration.sql`. Puis :

```bash
docker exec clemperl_dev_api sh -c "cd packages/db && pnpm exec prisma migrate deploy"
```

Attendu : `Applying migration 20260921120000_products`, puis `All migrations have been
successfully applied.`

- [x] **Étape 4 : réexporter les types**

Dans `packages/db/src/index.ts`, ajouter aux blocs existants :

```ts
export type {
    Product,
    ProductOption,
    ProductOptionValue,
    ProductVariant,
    ProductVariantValue,
} from "../generated/prisma/client.js";
export { E_CURRENCY, E_PRODUCT_STATUS } from "../generated/prisma/client.js";
```

- [x] **Étape 5 : écrire le test d'intégration des contraintes**

`apps/api/test/product-schema.int-spec.ts` :

```ts
import { prisma } from "@clemperl/db";

// Les trois garanties de cette tranche sont des CONTRAINTES DE BASE. Un client simulé
// renverrait ce qu'on lui a dit de renvoyer : seul un vrai PostgreSQL refuse.
let counter = 0;

async function createShopWithProduct(): Promise<{ vendorId: string; productId: string }> {
    counter += 1;
    const vendor = await prisma.vendor.create({
        data: {
            slug: `boutique-${counter}`,
            shopName: "Atelier Lumière",
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: "contact@atelier.test",
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: "Atelier Lumière SRL",
            registrationNumber: "0123456789",
            country: "BE",
            currency: "EUR",
        },
    });
    const product = await prisma.product.create({
        data: {
            vendorId: vendor.id,
            slug: `sac-cabas-${counter}`,
            title: "Sac cabas",
            description: "Cuir pleine fleur, coutures à la main.",
        },
    });
    return { vendorId: vendor.id, productId: product.id };
}

describe("contraintes du catalogue", () => {
    it("refuse deux variantes de même combinaison", async () => {
        const { productId } = await createShopWithProduct();
        await prisma.productVariant.create({
            data: { productId, priceAmount: 12000, combinationKey: "a|b", position: 0 },
        });

        await expect(
            prisma.productVariant.create({
                data: { productId, priceAmount: 9900, combinationKey: "a|b", position: 1 },
            }),
        ).rejects.toThrow();
    });

    // La clé vide est le cas « aucun axe ». L'unicité y devient « exactement une
    // variante », sans qu'aucun code n'ait à le vérifier.
    it("refuse une deuxième variante sans axe", async () => {
        const { productId } = await createShopWithProduct();
        await prisma.productVariant.create({
            data: { productId, priceAmount: 12000, combinationKey: "", position: 0 },
        });

        await expect(
            prisma.productVariant.create({
                data: { productId, priceAmount: 9900, combinationKey: "", position: 1 },
            }),
        ).rejects.toThrow();
    });

    it("refuse qu'une variante porte deux valeurs du même axe", async () => {
        const { productId } = await createShopWithProduct();
        const option = await prisma.productOption.create({
            data: { productId, name: "Taille", position: 0 },
        });
        const [small, medium] = await Promise.all([
            prisma.productOptionValue.create({
                data: { optionId: option.id, label: "S", position: 0 },
            }),
            prisma.productOptionValue.create({
                data: { optionId: option.id, label: "M", position: 1 },
            }),
        ]);
        const variant = await prisma.productVariant.create({
            data: { productId, priceAmount: 12000, combinationKey: small.id, position: 0 },
        });

        await prisma.productVariantValue.create({
            data: { variantId: variant.id, optionId: option.id, optionValueId: small.id },
        });

        await expect(
            prisma.productVariantValue.create({
                data: { variantId: variant.id, optionId: option.id, optionValueId: medium.id },
            }),
        ).rejects.toThrow();
    });

    // Deux vendeurs ont le droit de vendre chacun leur « sac-cabas ». L'unicité du slug
    // est par boutique, jamais globale.
    it("autorise le même slug dans deux boutiques", async () => {
        const first = await createShopWithProduct();
        const second = await createShopWithProduct();
        const slug = "meme-slug";

        await prisma.product.update({ where: { id: first.productId }, data: { slug } });
        await expect(
            prisma.product.update({ where: { id: second.productId }, data: { slug } }),
        ).resolves.toBeDefined();
    });
});
```

- [x] **Étape 6 : exécuter**

```bash
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand -t 'contraintes du catalogue'"
```

Attendu : 4 tests verts. Si le troisième passe alors qu'il devrait échouer, l'index
`@@unique([variantId, optionId])` manque dans la migration.

---

## Tâche 2 : Le slug, le prix et les schémas de saisie

**Fichiers**
- Créer : `packages/domain/src/utils/slug.utils.ts`
- Modifier : `packages/domain/src/utils/shop-slug.utils.ts`
- Créer : `packages/domain/src/utils/product-slug.utils.ts`
- Créer : `packages/domain/src/utils/price.utils.ts`
- Créer : `packages/domain/src/schemas/product.schema.ts`
- Créer : `packages/domain/src/errors/product.error.ts`
- Modifier : `packages/domain/src/utils/index.ts`, `schemas/index.ts`, `errors/index.ts`
- Tester : `packages/domain/src/utils/price.utils.spec.ts`,
  `packages/domain/src/utils/product-slug.utils.spec.ts`,
  `packages/domain/src/schemas/product.schema.spec.ts`

**Interfaces**
- Consomme : `CURRENCY_EXPONENT`, `TCurrency`, `DomainError` de `@clemperl/core`.
- Produit : `slugify(text: string): string` ; `slugifyProductTitle(title: string): string` ;
  `parsePrice(input: string, currency: TCurrency): number` ;
  `formatPrice(amount: number, currency: TCurrency, locale?: string): string` ;
  `productDetailsSchema` ; `InvalidPriceError`.

- [x] **Étape 1 : écrire le test du prix, qui n'a pas encore d'implémentation**

`packages/domain/src/utils/price.utils.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import { formatPrice, parsePrice } from "./price.utils.js";

describe("parsePrice", () => {
    it("lit une virgule comme séparateur décimal", () => {
        expect(parsePrice("12,50", "EUR")).toBe(1250);
    });

    it("lit aussi un point", () => {
        expect(parsePrice("12.50", "EUR")).toBe(1250);
    });

    it("complète les décimales manquantes", () => {
        expect(parsePrice("12,5", "EUR")).toBe(1250);
        expect(parsePrice("12", "EUR")).toBe(1200);
    });

    // Le franc CFA n'a AUCUNE décimale. Multiplier par 100 y produirait un prix cent
    // fois trop grand, et tous les tests en euros passeraient quand même.
    it("n'ajoute aucune décimale à une devise d'exposant zéro", () => {
        expect(parsePrice("12000", "XOF")).toBe(12000);
    });

    it("refuse une décimale dans une devise qui n'en a pas", () => {
        expect(() => parsePrice("12,50", "XOF")).toThrow(/décimale/i);
    });

    it("refuse plus de décimales que la devise n'en porte", () => {
        expect(() => parsePrice("12,505", "EUR")).toThrow(/décimale/i);
    });

    it("refuse un prix négatif", () => {
        expect(() => parsePrice("-1", "EUR")).toThrow();
    });

    it("refuse ce qui n'est pas un nombre", () => {
        expect(() => parsePrice("douze", "EUR")).toThrow();
        expect(() => parsePrice("", "EUR")).toThrow();
    });

    it("tolère les espaces autour et les séparateurs de milliers", () => {
        expect(parsePrice("  1 200,00 ", "EUR")).toBe(120000);
    });
});

describe("formatPrice", () => {
    it("rend un montant en euros avec ses décimales", () => {
        expect(formatPrice(1250, "EUR", "fr-FR")).toContain("12,50");
    });

    it("rend un montant en francs CFA sans décimale", () => {
        expect(formatPrice(12000, "XOF", "fr-FR")).not.toContain(",00");
    });
});
```

- [x] **Étape 2 : exécuter pour voir l'échec**

```bash
pnpm --filter @clemperl/domain exec vitest run src/utils/price.utils.spec.ts
```

Attendu : `Failed to resolve import "./price.utils.js"`.

- [x] **Étape 3 : écrire `price.utils.ts`**

```ts
import { CURRENCY_EXPONENT, DomainError, type TCurrency } from "@clemperl/core";

export class InvalidPriceError extends DomainError {
    constructor(key: string, fallbackMessage: string) {
        super({ i18nKey: `errors.product.${key}`, fallbackMessage });
    }
}

// Une saisie francophone écrit « 1 200,50 ». Un `Number()` direct y rend `NaN`, et un
// `parseFloat` y rend `1` — les deux silencieusement. La conversion est donc écrite,
// testée, et passe par l'exposant de la devise plutôt que par un `* 100` en dur.
export function parsePrice(input: string, currency: TCurrency): number {
    const cleaned = input.trim().replace(/[\s  ]/g, "").replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(cleaned)) {
        throw new InvalidPriceError("price_not_a_number", `Prix illisible : « ${input} ».`);
    }

    const exponent = CURRENCY_EXPONENT[currency];
    const [whole = "0", decimals = ""] = cleaned.split(".");

    if (decimals.length > exponent) {
        throw new InvalidPriceError(
            "price_too_many_decimals",
            exponent === 0
                ? `Le ${currency} ne prend aucune décimale.`
                : `Le ${currency} ne prend que ${exponent} décimales.`,
        );
    }

    // On compose l'entier par concaténation plutôt que par multiplication : 12.10 * 100
    // vaut 1209.9999999999998 en virgule flottante, et `Math.round` le rattraperait ici
    // mais pas sur toutes les valeurs.
    return Number(whole + decimals.padEnd(exponent, "0"));
}

export function formatPrice(amount: number, currency: TCurrency, locale = "fr-FR"): string {
    const exponent = CURRENCY_EXPONENT[currency];
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: exponent,
        maximumFractionDigits: exponent,
    }).format(amount / 10 ** exponent);
}
```

- [x] **Étape 4 : exécuter**

```bash
pnpm --filter @clemperl/domain exec vitest run src/utils/price.utils.spec.ts
```

Attendu : 11 tests verts.

- [x] **Étape 5 : extraire le noyau de slugification**

`packages/domain/src/utils/slug.utils.ts` :

```ts
const MAX_SLUG_LENGTH = 60;

// Les accents sont dépliés et non encodés : `créations` et `creations` désigneraient
// sinon deux entités dont personne ne saurait dire laquelle il a visitée.
export function slugify(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/^-+|-+$/g, "");
}
```

Remplacer le corps de `packages/domain/src/utils/shop-slug.utils.ts` par une délégation,
**sans toucher à son nom ni à son comportement** — ses tests de T1b doivent passer
inchangés :

```ts
import { slugify } from "./slug.utils.js";

export function slugifyShopName(name: string): string {
    return slugify(name);
}
```

`packages/domain/src/utils/product-slug.utils.ts` :

```ts
import { slugify } from "./slug.utils.js";

// Même opération que pour une boutique, sur une autre entrée. La fonction existe pour
// que l'appelant nomme son intention, et pour que le jour où un titre de produit
// demande une règle propre, elle ait un endroit où aller.
export function slugifyProductTitle(title: string): string {
    return slugify(title);
}
```

- [x] **Étape 6 : tester le slug de produit**

`packages/domain/src/utils/product-slug.utils.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import { slugifyProductTitle } from "./product-slug.utils.js";

describe("dérivation du slug de produit", () => {
    it("déplie les accents", () => {
        expect(slugifyProductTitle("Sac à main Été")).toBe("sac-a-main-ete");
    });

    it("réduit la ponctuation à des tirets", () => {
        expect(slugifyProductTitle("Cabas — cuir & lin")).toBe("cabas-cuir-lin");
    });
});
```

```bash
pnpm --filter @clemperl/domain exec vitest run src/utils/
```

Attendu : les tests de `shop-slug.utils.spec.ts` passent **inchangés**, plus les deux
nouveaux.

- [x] **Étape 7 : écrire le schéma de saisie**

`packages/domain/src/schemas/product.schema.ts` :

```ts
import { z } from "zod";

// Le titre produit le slug, donc les mêmes deux caractères latins qu'un nom de
// boutique : sans eux, le slug est vide et deux produits se percutent sur l'unicité.
export const productDetailsFields = {
    title: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .regex(/(?:[a-zA-Z0-9].*){2}/u, "doit contenir au moins deux caractères latins"),
    description: z.string().trim().min(20).max(4000),
};

export const productDetailsSchema = z.object(productDetailsFields);

export type TProductDetails = z.infer<typeof productDetailsSchema>;

// Un axe et ses valeurs, tels que le formulaire les envoie. Les doublons sont refusés
// ici plutôt qu'en base : « Noir » deux fois dans le même axe produirait deux variantes
// que l'index unique rejetterait, avec un message qui ne dirait pas pourquoi.
export const productOptionSchema = z.object({
    name: z.string().trim().min(1).max(40),
    values: z
        .array(z.string().trim().min(1).max(40))
        .min(1)
        .max(20)
        .refine((values) => new Set(values).size === values.length, {
            message: "deux valeurs identiques dans le même axe",
        }),
});

export const productOptionsSchema = z
    .array(productOptionSchema)
    .max(3)
    .refine((options) => new Set(options.map((o) => o.name)).size === options.length, {
        message: "deux axes portent le même nom",
    });

export type TProductOption = z.infer<typeof productOptionSchema>;
```

- [x] **Étape 8 : tester le schéma**

`packages/domain/src/schemas/product.schema.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import { productDetailsSchema, productOptionsSchema } from "./product.schema.js";

describe("productDetailsSchema", () => {
    it("accepte un produit ordinaire", () => {
        expect(
            productDetailsSchema.safeParse({
                title: "Sac cabas",
                description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
            }).success,
        ).toBe(true);
    });

    it("refuse un titre dont aucun slug ne peut sortir", () => {
        expect(
            productDetailsSchema.safeParse({
                title: "!!!",
                description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
            }).success,
        ).toBe(false);
    });
});

describe("productOptionsSchema", () => {
    it("accepte deux axes distincts", () => {
        expect(
            productOptionsSchema.safeParse([
                { name: "Taille", values: ["S", "M"] },
                { name: "Couleur", values: ["Noir"] },
            ]).success,
        ).toBe(true);
    });

    // Deux « Noir » produiraient deux variantes que l'index unique rejetterait, avec un
    // message de base de données que personne ne peut relier à sa saisie.
    it("refuse deux valeurs identiques dans un axe", () => {
        expect(
            productOptionsSchema.safeParse([{ name: "Couleur", values: ["Noir", "Noir"] }]).success,
        ).toBe(false);
    });

    it("refuse deux axes de même nom", () => {
        expect(
            productOptionsSchema.safeParse([
                { name: "Taille", values: ["S"] },
                { name: "Taille", values: ["M"] },
            ]).success,
        ).toBe(false);
    });
});
```

- [x] **Étape 9 : écrire les erreurs et brancher les index**

`packages/domain/src/errors/product.error.ts` :

```ts
import { DomainError } from "@clemperl/core";

export class CurrencyNotSetError extends DomainError {
    constructor() {
        super({
            i18nKey: "errors.product.currency_not_set",
            fallbackMessage: "La boutique n'a pas encore déclaré sa devise.",
        });
    }
}

export class CurrencyLockedError extends DomainError {
    constructor() {
        super({
            i18nKey: "errors.product.currency_locked",
            fallbackMessage: "La devise ne change plus dès qu'un produit existe.",
        });
    }
}

export class ProductNotFoundError extends DomainError {
    constructor() {
        super({
            i18nKey: "errors.product.not_found",
            fallbackMessage: "Ce produit n'existe pas dans cette boutique.",
        });
    }
}
```

Ajouter dans `packages/domain/src/utils/index.ts` :

```ts
export * from "./slug.utils.js";
export * from "./product-slug.utils.js";
export * from "./price.utils.js";
```

Dans `schemas/index.ts` : `export * from "./product.schema.js";`
Dans `errors/index.ts` : `export * from "./product.error.js";`

- [x] **Étape 10 : exécuter tout le package**

```bash
pnpm --filter @clemperl/domain test
```

Attendu : vert, couverture à 100 %.

---

## Tâche 3 : La grille de variantes, fonction pure

**Fichiers**
- Créer : `packages/domain/src/utils/variant-matrix.utils.ts`
- Modifier : `packages/domain/src/utils/index.ts`
- Tester : `packages/domain/src/utils/variant-matrix.utils.spec.ts`

**Interfaces**
- Produit :
  ```ts
  interface IOptionDraft { name: string; values: readonly string[] }
  interface IExistingVariant { selections: Readonly<Record<string, string>>; priceAmount: number }
  interface IVariantDraft { selections: Readonly<Record<string, string>>; priceAmount: number; position: number }
  function buildVariantMatrix(
      options: readonly IOptionDraft[],
      existing: readonly IExistingVariant[],
      fallbackPrice: number,
  ): IVariantDraft[]
  function selectionKey(selections: Readonly<Record<string, string>>): string
  ```
- `selections` associe un **nom d'axe** à un **libellé de valeur**. Les identifiants de
  base n'apparaissent pas ici : la tâche 4 les résout dans sa transaction. Cette
  fonction ne connaît que ce que le formulaire a envoyé.

- [x] **Étape 1 : écrire les tests, exhaustivement**

`packages/domain/src/utils/variant-matrix.utils.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import { buildVariantMatrix, selectionKey } from "./variant-matrix.utils.js";

describe("selectionKey", () => {
    // Sans le tri, la même combinaison produirait deux clés et l'unicité de la base ne
    // verrait rien.
    it("ne dépend pas de l'ordre des axes", () => {
        expect(selectionKey({ Taille: "M", Couleur: "Noir" })).toBe(
            selectionKey({ Couleur: "Noir", Taille: "M" }),
        );
    });

    it("distingue deux combinaisons différentes", () => {
        expect(selectionKey({ Taille: "M" })).not.toBe(selectionKey({ Taille: "L" }));
    });

    it("rend une chaîne vide quand il n'y a aucun axe", () => {
        expect(selectionKey({})).toBe("");
    });
});

describe("buildVariantMatrix", () => {
    it("rend exactement une variante quand il n'y a aucun axe", () => {
        const grid = buildVariantMatrix([], [], 12000);
        expect(grid).toHaveLength(1);
        expect(grid[0]?.selections).toEqual({});
        expect(grid[0]?.priceAmount).toBe(12000);
    });

    it("rend le produit cartésien de deux axes", () => {
        const grid = buildVariantMatrix(
            [
                { name: "Taille", values: ["S", "M"] },
                { name: "Couleur", values: ["Noir", "Écru"] },
            ],
            [],
            9900,
        );
        expect(grid).toHaveLength(4);
        expect(grid.map((v) => v.position)).toEqual([0, 1, 2, 3]);
    });

    // Un vendeur qui déclare « Taille : L » après avoir fixé un prix ne repart pas de
    // zéro.
    it("conserve le prix d'une combinaison déjà connue", () => {
        const grid = buildVariantMatrix(
            [{ name: "Taille", values: ["S", "M"] }],
            [{ selections: { Taille: "M" }, priceAmount: 15000 }],
            9900,
        );
        expect(grid.find((v) => v.selections["Taille"] === "M")?.priceAmount).toBe(15000);
    });

    it("donne le prix de repli à une combinaison nouvelle", () => {
        const grid = buildVariantMatrix(
            [{ name: "Taille", values: ["S", "M"] }],
            [{ selections: { Taille: "M" }, priceAmount: 15000 }],
            9900,
        );
        expect(grid.find((v) => v.selections["Taille"] === "S")?.priceAmount).toBe(9900);
    });

    it("supprime les variantes d'une valeur retirée, et elles seules", () => {
        const grid = buildVariantMatrix(
            [{ name: "Taille", values: ["S"] }],
            [
                { selections: { Taille: "S" }, priceAmount: 15000 },
                { selections: { Taille: "M" }, priceAmount: 16000 },
            ],
            9900,
        );
        expect(grid).toHaveLength(1);
        expect(grid[0]?.priceAmount).toBe(15000);
    });

    it("retomber à zéro axe ramène à une variante unique", () => {
        const grid = buildVariantMatrix(
            [],
            [
                { selections: { Taille: "S" }, priceAmount: 15000 },
                { selections: { Taille: "M" }, priceAmount: 16000 },
            ],
            9900,
        );
        expect(grid).toHaveLength(1);
        expect(grid[0]?.selections).toEqual({});
        expect(grid[0]?.priceAmount).toBe(15000);
    });

    // L'ordre que rend la base n'est pas garanti. Si le prix hérité en dépendait, il
    // changerait d'une exécution à l'autre sans que rien ne le signale.
    it("hérite du prix de la variante existante la plus ancienne, pas d'une au hasard", () => {
        const grid = buildVariantMatrix(
            [],
            [
                { selections: { Taille: "S" }, priceAmount: 11100 },
                { selections: { Taille: "M" }, priceAmount: 22200 },
            ],
            9900,
        );
        expect(grid[0]?.priceAmount).toBe(11100);
    });

    it("ignore un axe sans aucune valeur", () => {
        const grid = buildVariantMatrix(
            [
                { name: "Taille", values: ["S", "M"] },
                { name: "Couleur", values: [] },
            ],
            [],
            9900,
        );
        expect(grid).toHaveLength(2);
        expect(grid[0]?.selections).toEqual({ Taille: "S" });
    });
});
```

- [x] **Étape 2 : exécuter pour voir l'échec**

```bash
pnpm --filter @clemperl/domain exec vitest run src/utils/variant-matrix.utils.spec.ts
```

Attendu : `Failed to resolve import "./variant-matrix.utils.js"`.

- [x] **Étape 3 : écrire la fonction**

```ts
export interface IOptionDraft {
    name: string;
    values: readonly string[];
}

export interface IExistingVariant {
    selections: Readonly<Record<string, string>>;
    priceAmount: number;
}

export interface IVariantDraft {
    selections: Readonly<Record<string, string>>;
    priceAmount: number;
    position: number;
}

// Le TRI est ce qui fait fonctionner l'unicité en base : sans lui, `{Taille:M,
// Couleur:Noir}` et `{Couleur:Noir, Taille:M}` produiraient deux clés différentes pour
// la même combinaison, et l'index ne verrait aucun doublon.
export function selectionKey(selections: Readonly<Record<string, string>>): string {
    return Object.entries(selections)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, label]) => `${name}=${label}`)
        .join("\u001f");
}

// Pure : ni base, ni réseau, ni horloge. C'est la fonction où une erreur coûterait le
// plus cher — un produit sans variante, ou des variantes en double — et c'est la seule
// de la tranche qui se teste exhaustivement sans rien monter.
export function buildVariantMatrix(
    options: readonly IOptionDraft[],
    existing: readonly IExistingVariant[],
    fallbackPrice: number,
): IVariantDraft[] {
    const knownPrices = new Map(
        existing.map((variant) => [selectionKey(variant.selections), variant.priceAmount]),
    );

    // « Le prix de repli » n'est pas le premier venu : l'ordre que rend la base n'est
    // pas garanti, donc l'appelant passe une liste déjà ordonnée par `position` et on
    // prend sa tête. À défaut, le prix que le formulaire a saisi.
    const inherited = existing[0]?.priceAmount ?? fallbackPrice;

    // Un axe sans valeur ne distingue rien : il ne multiplie pas la grille.
    const usable = options.filter((option) => option.values.length > 0);

    const combinations = usable.reduce<Record<string, string>[]>(
        (accumulated, option) =>
            accumulated.flatMap((partial) =>
                option.values.map((label) => ({ ...partial, [option.name]: label })),
            ),
        [{}],
    );

    return combinations.map((selections, position) => ({
        selections,
        priceAmount: knownPrices.get(selectionKey(selections)) ?? inherited,
        position,
    }));
}
```

- [x] **Étape 4 : exécuter**

```bash
pnpm --filter @clemperl/domain exec vitest run src/utils/variant-matrix.utils.spec.ts
```

Attendu : 11 tests verts.

- [x] **Étape 5 : réexporter et vérifier le package entier**

Ajouter `export * from "./variant-matrix.utils.js";` à `packages/domain/src/utils/index.ts`,
puis :

```bash
pnpm --filter @clemperl/domain test
```

Attendu : vert, couverture à 100 %.

---

## Tâche 4 : Le dépôt, filtré par boutique et transactionnel

**Fichiers**
- Créer : `packages/db/src/repositories/product.repository.ts`
- Modifier : `packages/db/src/repositories/vendor.repository.ts`
- Modifier : `packages/db/src/repositories/index.ts`
- Tester : `apps/api/test/product-repository.int-spec.ts`

**Interfaces**
- Consomme : `buildVariantMatrix`, `selectionKey`, `IVariantDraft` de `@clemperl/domain`.
- Produit :
  ```ts
  function listProductsForVendor(prisma, vendorId: string)
  function readProductForVendor(prisma, input: { productId: string; vendorId: string })
  function createProduct(prisma, input: ICreateProduct): Promise<{ id: string }>
  function saveProduct(prisma, input: ISaveProduct): Promise<void>
  function setProductStatus(prisma, input: { productId: string; vendorId: string; publish: boolean })
  function setShopCurrency(prisma, input: { vendorId: string; currency: TCurrency })
  function countProductsForVendor(prisma, vendorId: string): Promise<number>
  ```

- [x] **Étape 1 : écrire le dépôt**

`packages/db/src/repositories/product.repository.ts` :

```ts
import { buildVariantMatrix, selectionKey, type IOptionDraft } from "@clemperl/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

export interface ICreateProduct {
    vendorId: string;
    slug: string;
    title: string;
    description: string;
    priceAmount: number;
}

export interface ISaveProduct {
    productId: string;
    vendorId: string;
    title: string;
    description: string;
    options: readonly IOptionDraft[];
    /** Prix par clé de combinaison, telle que `selectionKey` la calcule. */
    prices: Readonly<Record<string, number>>;
}

// TOUTE lecture et TOUTE écriture filtrent sur `(id, vendorId)`, jamais sur `id` seul.
// Le `productId` vient de l'URL, donc du client : sans ce filtre, un vendeur corrige le
// produit d'un autre en changeant un chiffre. La garantie est dans la SIGNATURE — une
// vérification à l'entrée s'oublie au prochain appelant.
export async function listProductsForVendor(prisma: PrismaClient, vendorId: string) {
    return prisma.product.findMany({
        where: { vendorId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { variants: { orderBy: { position: "asc" } } },
    });
}

export async function readProductForVendor(
    prisma: PrismaClient,
    input: { productId: string; vendorId: string },
) {
    return prisma.product.findFirst({
        where: { id: input.productId, vendorId: input.vendorId, deletedAt: null },
        include: {
            options: {
                orderBy: { position: "asc" },
                include: { values: { orderBy: { position: "asc" } } },
            },
            variants: {
                orderBy: { position: "asc" },
                include: { values: { include: { option: true, optionValue: true } } },
            },
        },
    });
}

// Un produit naît avec sa variante unique, dans la même transaction. Un produit sans
// variante n'aurait pas de prix, et tout le reste de la tranche suppose qu'il en a un.
export async function createProduct(
    prisma: PrismaClient,
    input: ICreateProduct,
): Promise<{ id: string }> {
    return prisma.product.create({
        data: {
            vendorId: input.vendorId,
            slug: input.slug,
            title: input.title,
            description: input.description,
            variants: { create: { priceAmount: input.priceAmount, combinationKey: "", position: 0 } },
        },
        select: { id: true },
    });
}

// Corriger les axes supprime des variantes, en crée d'autres et met à jour des prix.
// Une écriture partielle laisserait un produit sans variante, ou des variantes
// orphelines de leur combinaison : tout passe donc par une seule transaction.
export async function saveProduct(prisma: PrismaClient, input: ISaveProduct): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const product = await tx.product.findFirst({
            where: { id: input.productId, vendorId: input.vendorId, deletedAt: null },
            include: {
                variants: {
                    orderBy: { position: "asc" },
                    include: { values: { include: { option: true, optionValue: true } } },
                },
            },
        });
        if (!product) {
            throw new Error("PRODUCT_NOT_FOUND");
        }

        const existing = product.variants.map((variant) => ({
            selections: Object.fromEntries(
                variant.values.map((value) => [value.option.name, value.optionValue.label]),
            ),
            priceAmount: variant.priceAmount,
        }));

        const fallback = product.variants[0]?.priceAmount ?? 0;
        const grid = buildVariantMatrix(input.options, existing, fallback);

        // Les axes sont reconstruits à neuf. Les réconcilier ligne à ligne demanderait
        // de suivre les renommages, et `onDelete: Cascade` emporte de toute façon
        // valeurs et jonctions.
        await tx.productOption.deleteMany({ where: { productId: product.id } });
        await tx.productVariant.deleteMany({ where: { productId: product.id } });

        const valueIds = new Map<string, string>();
        for (const [position, option] of input.options.entries()) {
            if (option.values.length === 0) continue;
            const created = await tx.productOption.create({
                data: { productId: product.id, name: option.name, position },
                select: { id: true },
            });
            for (const [valuePosition, label] of option.values.entries()) {
                const value = await tx.productOptionValue.create({
                    data: { optionId: created.id, label, position: valuePosition },
                    select: { id: true },
                });
                valueIds.set(`${option.name}\u001f${label}`, value.id);
                valueIds.set(`option\u001f${option.name}`, created.id);
            }
        }

        for (const draft of grid) {
            const pairs = Object.entries(draft.selections);
            const ids = pairs
                .map(([name, label]) => valueIds.get(`${name}\u001f${label}`) ?? "")
                .sort();

            await tx.productVariant.create({
                data: {
                    productId: product.id,
                    priceAmount: input.prices[selectionKey(draft.selections)] ?? draft.priceAmount,
                    // Les identifiants TRIÉS : c'est ce tri qui rend l'index unique
                    // capable de voir un doublon.
                    combinationKey: ids.join("|"),
                    position: draft.position,
                    values: {
                        create: pairs.map(([name, label]) => ({
                            optionId: valueIds.get(`option\u001f${name}`) ?? "",
                            optionValueId: valueIds.get(`${name}\u001f${label}`) ?? "",
                        })),
                    },
                },
            });
        }

        await tx.product.update({
            where: { id: product.id },
            data: { title: input.title, description: input.description },
        });
    });
}

export async function setProductStatus(
    prisma: PrismaClient,
    input: { productId: string; vendorId: string; publish: boolean },
): Promise<void> {
    await prisma.product.updateMany({
        where: { id: input.productId, vendorId: input.vendorId, deletedAt: null },
        data: {
            status: input.publish ? "PUBLISHED" : "DRAFT",
            // `publishedAt` ne se remet jamais à zéro : il date le moment où le slug a
            // cessé de pouvoir bouger, et dépublier ne rend pas une URL réutilisable.
            ...(input.publish ? { publishedAt: new Date() } : {}),
        },
    });
}
```

- [x] **Étape 2 : ajouter les deux fonctions de boutique**

À la fin de `packages/db/src/repositories/vendor.repository.ts` :

```ts
import type { E_CURRENCY } from "../../generated/prisma/enums.js";

type TShopCurrency = (typeof E_CURRENCY)[keyof typeof E_CURRENCY];

export const ERROR_CURRENCY_LOCKED = "CURRENCY_LOCKED";

export async function countProductsForVendor(
    prisma: PrismaClient,
    vendorId: string,
): Promise<number> {
    return prisma.product.count({ where: { vendorId, deletedAt: null } });
}

// La devise n'entre PAS dans `updateShopProfile`. Cette signature-là dit « ces champs se
// corrigent librement », et la devise ne le fait pas : la changer après coup
// transformerait `10000` de dix mille francs CFA en cent euros sur tout le catalogue,
// sans erreur et sans trace. Elle a donc sa propre fonction, qui refuse.
export async function setShopCurrency(
    prisma: PrismaClient,
    input: { vendorId: string; currency: TShopCurrency },
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const products = await tx.product.count({
            where: { vendorId: input.vendorId, deletedAt: null },
        });
        if (products > 0) {
            throw new Error(ERROR_CURRENCY_LOCKED);
        }
        await tx.vendor.update({
            where: { id: input.vendorId },
            data: { currency: input.currency },
        });
    });
}
```

Ajouter `export * from "./product.repository.js";` à
`packages/db/src/repositories/index.ts`.

- [x] **Étape 3 : écrire le test d'intégration**

`apps/api/test/product-repository.int-spec.ts` :

```ts
import {
    countProductsForVendor,
    createProduct,
    listProductsForVendor,
    prisma,
    readProductForVendor,
    saveProduct,
    setProductStatus,
    setShopCurrency,
} from "@clemperl/db";

let counter = 0;

async function createShop(): Promise<string> {
    counter += 1;
    const vendor = await prisma.vendor.create({
        data: {
            slug: `atelier-${counter}`,
            shopName: "Atelier Lumière",
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: "contact@atelier.test",
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: "Atelier Lumière SRL",
            registrationNumber: "0123456789",
            country: "BE",
            currency: "EUR",
        },
    });
    return vendor.id;
}

describe("createProduct", () => {
    it("crée un brouillon avec exactement une variante", async () => {
        const vendorId = await createShop();
        const { id } = await createProduct(prisma, {
            vendorId,
            slug: "sac-cabas",
            title: "Sac cabas",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
            priceAmount: 12000,
        });

        const product = await readProductForVendor(prisma, { productId: id, vendorId });
        expect(product?.status).toBe("DRAFT");
        expect(product?.variants).toHaveLength(1);
        expect(product?.variants[0]?.combinationKey).toBe("");
        expect(product?.variants[0]?.priceAmount).toBe(12000);
    });
});

// LE test de sécurité de la tranche. Le `productId` vient de l'URL : sans le filtre sur
// `vendorId`, un vendeur lit et corrige le catalogue d'un autre.
describe("l'isolation entre boutiques", () => {
    it("ne lit pas le produit d'une autre boutique", async () => {
        const mine = await createShop();
        const theirs = await createShop();
        const { id } = await createProduct(prisma, {
            vendorId: theirs,
            slug: "sac-cabas",
            title: "Sac cabas",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
            priceAmount: 12000,
        });

        expect(await readProductForVendor(prisma, { productId: id, vendorId: mine })).toBeNull();
    });

    it("ne publie pas le produit d'une autre boutique", async () => {
        const mine = await createShop();
        const theirs = await createShop();
        const { id } = await createProduct(prisma, {
            vendorId: theirs,
            slug: "sac-cabas",
            title: "Sac cabas",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
            priceAmount: 12000,
        });

        await setProductStatus(prisma, { productId: id, vendorId: mine, publish: true });

        const after = await readProductForVendor(prisma, { productId: id, vendorId: theirs });
        expect(after?.status).toBe("DRAFT");
    });
});

describe("saveProduct", () => {
    it("déclare un axe à trois valeurs et produit trois variantes", async () => {
        const vendorId = await createShop();
        const { id } = await createProduct(prisma, {
            vendorId,
            slug: "tee-shirt",
            title: "Tee-shirt",
            description: "Coton biologique peigné, coupe droite, col rond.",
            priceAmount: 4900,
        });

        await saveProduct(prisma, {
            productId: id,
            vendorId,
            title: "Tee-shirt",
            description: "Coton biologique peigné, coupe droite, col rond.",
            options: [{ name: "Taille", values: ["S", "M", "L"] }],
            prices: {},
        });

        const product = await readProductForVendor(prisma, { productId: id, vendorId });
        expect(product?.variants).toHaveLength(3);
        expect(product?.variants.map((v) => v.priceAmount)).toEqual([4900, 4900, 4900]);
    });

    it("retirer une valeur supprime ses variantes, et jamais les autres", async () => {
        const vendorId = await createShop();
        const { id } = await createProduct(prisma, {
            vendorId,
            slug: "tee-shirt",
            title: "Tee-shirt",
            description: "Coton biologique peigné, coupe droite, col rond.",
            priceAmount: 4900,
        });
        const base = {
            productId: id,
            vendorId,
            title: "Tee-shirt",
            description: "Coton biologique peigné, coupe droite, col rond.",
            prices: {},
        };

        await saveProduct(prisma, { ...base, options: [{ name: "Taille", values: ["S", "M"] }] });
        await saveProduct(prisma, { ...base, options: [{ name: "Taille", values: ["S"] }] });

        const product = await readProductForVendor(prisma, { productId: id, vendorId });
        expect(product?.variants).toHaveLength(1);
        expect(product?.variants[0]?.values[0]?.optionValue.label).toBe("S");
    });

    it("conserve le prix d'une combinaison déjà connue", async () => {
        const vendorId = await createShop();
        const { id } = await createProduct(prisma, {
            vendorId,
            slug: "tee-shirt",
            title: "Tee-shirt",
            description: "Coton biologique peigné, coupe droite, col rond.",
            priceAmount: 4900,
        });
        const base = {
            productId: id,
            vendorId,
            title: "Tee-shirt",
            description: "Coton biologique peigné, coupe droite, col rond.",
        };

        await saveProduct(prisma, {
            ...base,
            options: [{ name: "Taille", values: ["S"] }],
            prices: { "Taille=S": 7700 },
        });
        await saveProduct(prisma, {
            ...base,
            options: [{ name: "Taille", values: ["S", "M"] }],
            prices: {},
        });

        const product = await readProductForVendor(prisma, { productId: id, vendorId });
        const small = product?.variants.find((v) => v.values[0]?.optionValue.label === "S");
        expect(small?.priceAmount).toBe(7700);
    });
});

describe("setShopCurrency", () => {
    it("enregistre la devise tant qu'aucun produit n'existe", async () => {
        const vendorId = await createShop();
        await setShopCurrency(prisma, { vendorId, currency: "XOF" });
        const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
        expect(vendor?.currency).toBe("XOF");
    });

    // Sans ce refus, `10000` passerait de dix mille francs CFA à cent euros sur tout le
    // catalogue, sans erreur et sans trace.
    it("refuse dès qu'un produit existe", async () => {
        const vendorId = await createShop();
        await createProduct(prisma, {
            vendorId,
            slug: "sac-cabas",
            title: "Sac cabas",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
            priceAmount: 12000,
        });

        await expect(setShopCurrency(prisma, { vendorId, currency: "XOF" })).rejects.toThrow(
            /CURRENCY_LOCKED/,
        );
        expect(await countProductsForVendor(prisma, vendorId)).toBe(1);
    });
});

describe("listProductsForVendor", () => {
    it("ne rend que les produits de la boutique", async () => {
        const mine = await createShop();
        const theirs = await createShop();
        await createProduct(prisma, {
            vendorId: mine,
            slug: "a",
            title: "Le mien",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
            priceAmount: 100,
        });
        await createProduct(prisma, {
            vendorId: theirs,
            slug: "b",
            title: "Le sien",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
            priceAmount: 100,
        });

        const list = await listProductsForVendor(prisma, mine);
        expect(list).toHaveLength(1);
        expect(list[0]?.title).toBe("Le mien");
    });
});
```

- [x] **Étape 4 : exécuter**

```bash
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
```

Attendu : toutes les suites vertes, dont les 9 nouvelles.

---

## Tâche 5 : Le sélecteur de devise dans `/shop`

**Fichiers**
- Modifier : `apps/vendor/src/app/shop/actions.ts`
- Modifier : `apps/vendor/src/app/shop/shop-form.tsx`
- Modifier : `apps/vendor/src/app/shop/page.tsx`
- Modifier : `packages/i18n/messages/vendor/fr.json`

**Interfaces**
- Consomme : `setShopCurrency`, `countProductsForVendor`, `ERROR_CURRENCY_LOCKED`.
- Produit : l'action `saveShopCurrency(previous, form)`, de même forme que
  `saveShopProfile`.

- [x] **Étape 1 : ajouter les libellés**

Dans `packages/i18n/messages/vendor/fr.json`, à la section `shop` :

```json
    "currencySection": "Devise",
    "currency": "Devise des prix",
    "currencyHint": "Elle se fige dès que votre premier produit existe.",
    "currencyLocked": "Vos produits sont déjà chiffrés dans cette devise : elle ne change plus.",
    "currencyNotSet": "Choisissez d'abord la devise de vos prix.",
    "saveCurrency": "Enregistrer la devise",
```

Et une section nouvelle, à la racine :

```json
  "currency": {
    "EUR": "Euro (€)",
    "USD": "Dollar américain ($)",
    "XOF": "Franc CFA — UEMOA (F CFA)",
    "XAF": "Franc CFA — CEMAC (F CFA)",
    "CDF": "Franc congolais (FC)"
  },
```

- [x] **Étape 2 : ajouter l'action**

À la fin de `apps/vendor/src/app/shop/actions.ts` :

```ts
import { E_CURRENCY } from "@clemperl/db/enums";
import { ERROR_CURRENCY_LOCKED, setShopCurrency } from "@clemperl/db";
import { z } from "zod";

const currencySchema = z.object({ currency: z.enum(E_CURRENCY) });

export async function saveShopCurrency(
    _previous: IShopFormState,
    form: FormData,
): Promise<IShopFormState> {
    // La garde est rappelée ICI : une action serveur est une route publique, et la page
    // qui l'a rendue ne la protège pas.
    const { vendor } = await requireVendorMembership();

    const parsed = currencySchema.safeParse({ currency: form.get("currency") });
    if (!parsed.success) {
        return { message: [messages.errors.invalid], saved: false };
    }

    try {
        await setShopCurrency(prisma, { vendorId: vendor.id, currency: parsed.data.currency });
    } catch (error) {
        // Journaliser AVANT de rendre le message localisé : un `catch` nu laisse le
        // vendeur devant « l'enregistrement a échoué » et les journaux vides, ce qui ne
        // distingue pas une panne passagère d'un défaut qui ne réussira jamais.
        console.error("saveShopCurrency", error);
        const locked = error instanceof Error && error.message === ERROR_CURRENCY_LOCKED;
        return {
            message: [locked ? messages.shop.currencyLocked : messages.errors.failed],
            saved: false,
        };
    }

    revalidatePath("/shop");
    return { message: [], saved: true };
}
```

- [x] **Étape 3 : afficher le sélecteur**

Dans `apps/vendor/src/app/shop/page.tsx`, après avoir obtenu `vendor` :

```ts
const productCount = await countProductsForVendor(prisma, vendor.id);
```

et passer à `ShopForm` deux propriétés de plus : `currency={vendor.currency}` et
`currencyLocked={productCount > 0}`.

Dans `shop-form.tsx`, une seconde `<form>` **séparée** — la devise a sa propre action,
donc son propre formulaire ; les imbriquer produirait un HTML invalide :

```tsx
const CURRENCIES = Object.values(E_CURRENCY);

// …dans le composant
const [currencyState, currencyAction, currencyPending] = useActionState(
    saveShopCurrency,
    INITIAL_STATE,
);
```

```tsx
<form action={currencyAction} className="mt-12 flex flex-col gap-6">
    <FormSection title={t.currencySection}>
        <label className="flex flex-col gap-1">
            <span className="text-sm text-muet">{t.currency}</span>
            <select
                name="currency"
                defaultValue={shop.currency ?? ""}
                disabled={shop.currencyLocked}
                required
                className="w-full border-0 border-b border-bordure bg-transparent px-0 py-2 text-base outline-none"
            >
                <option value="" disabled>
                    —
                </option>
                {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                        {currencyLabels[code] as string}
                    </option>
                ))}
            </select>
            <span className="text-xs text-muet">
                {shop.currencyLocked ? t.currencyLocked : t.currencyHint}
            </span>
        </label>
    </FormSection>
    {currencyState.message.length > 0 && (
        <p role="alert" className="text-sm text-accent">
            {currencyState.message.join(" ")}
        </p>
    )}
    <Button type="submit" disabled={currencyPending || shop.currencyLocked}>
        {t.saveCurrency}
    </Button>
</form>
```

`E_CURRENCY` s'importe depuis `@clemperl/db/enums` et **jamais** depuis `@clemperl/db` :
le point d'entrée principal entraînerait le client Prisma jusque dans le paquet envoyé au
navigateur.

- [x] **Étape 4 : vérifier**

```bash
pnpm lint && pnpm typecheck
```

Attendu : vert. Puis, la stack étant démarrée, ouvrir `http://localhost:3001/shop` et
constater le sélecteur actif.

---

## Tâche 6 : La liste et la création

**Fichiers**
- Créer : `apps/vendor/src/app/products/page.tsx`
- Créer : `apps/vendor/src/app/products/actions.ts`
- Créer : `apps/vendor/src/app/products/new/page.tsx`
- Créer : `apps/vendor/src/app/products/new/new-product-form.tsx`
- Créer : `apps/vendor/src/app/products/types/product-form-state.interface.ts`
- Modifier : `packages/i18n/messages/vendor/fr.json`
- Modifier : `apps/vendor/src/app/layout.tsx` (le lien de navigation)

**Interfaces**
- Consomme : `requireVendorMembership`, `listProductsForVendor`, `createProduct`,
  `parsePrice`, `slugifyProductTitle`, `productDetailsSchema`, `formatPrice`.
- Produit : `createProductAction(previous, form)`.

- [x] **Étape 1 : les libellés**

Dans `packages/i18n/messages/vendor/fr.json`, une section `products` :

```json
  "products": {
    "title": "Mes produits",
    "empty": "Vous n'avez pas encore de produit. Créez le premier.",
    "create": "Nouveau produit",
    "createTitle": "Nouveau produit",
    "productTitle": "Titre",
    "description": "Description",
    "descriptionHint": "Vingt caractères au minimum.",
    "price": "Prix",
    "priceHint": "Le prix de vente, dans la devise de votre boutique.",
    "save": "Créer le produit",
    "status": "État",
    "DRAFT": "Brouillon",
    "PUBLISHED": "Publié",
    "variantCount": "{count} déclinaisons",
    "singleVariant": "Une seule déclinaison"
  },
```

Et dans `navigation` : `"products": "Mes produits"`.

Et dans `errors`, deux entrées de plus :

```json
    "currencyMissing": "Choisissez d'abord la devise de vos prix, dans Ma boutique.",
    "priceInvalid": "Ce prix n'est pas lisible dans la devise de votre boutique."
```

- [x] **Étape 2 : l'état des formulaires**

`apps/vendor/src/app/products/types/product-form-state.interface.ts` :

```ts
export interface IProductFormState {
    message: string[];
    saved: boolean;
}

// Cette constante ne peut PAS vivre dans un fichier « use server » : un tel fichier
// n'exporte que des fonctions asynchrones, et une constante qu'on y exporte quand même
// arrive `undefined` au client — l'erreur qu'on lit alors parle d'autre chose.
export const INITIAL_PRODUCT_STATE: IProductFormState = { message: [], saved: false };
```

- [x] **Étape 3 : l'action de création**

`apps/vendor/src/app/products/actions.ts` :

```ts
"use server";

import { createProduct, prisma } from "@clemperl/db";
import { parsePrice, productDetailsSchema, slugifyProductTitle } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { redirect } from "next/navigation";
import { requireVendorMembership } from "../../lib/session";
import type { IProductFormState } from "./types/product-form-state.interface";

export async function createProductAction(
    _previous: IProductFormState,
    form: FormData,
): Promise<IProductFormState> {
    const { vendor } = await requireVendorMembership();

    // On ne fixe pas un prix avant d'avoir dit en quoi. Le contrôle est ici et non dans
    // un composant : l'action est appelable directement.
    if (!vendor.currency) {
        return { message: [messages.errors.currencyMissing], saved: false };
    }

    const parsed = productDetailsSchema.safeParse({
        title: form.get("title"),
        description: form.get("description"),
    });
    if (!parsed.success) {
        return { message: [messages.errors.invalid], saved: false };
    }

    let priceAmount: number;
    try {
        priceAmount = parsePrice(String(form.get("price") ?? ""), vendor.currency);
    } catch {
        return { message: [messages.errors.priceInvalid], saved: false };
    }

    let created: { id: string };
    try {
        created = await createProduct(prisma, {
            vendorId: vendor.id,
            slug: slugifyProductTitle(parsed.data.title),
            title: parsed.data.title,
            description: parsed.data.description,
            priceAmount,
        });
    } catch (error) {
        console.error("createProductAction", error);
        return { message: [messages.errors.failed], saved: false };
    }

    // `redirect` lève : il doit rester HORS du `try`, sinon le `catch` l'avale et
    // l'utilisateur voit « l'enregistrement a échoué » sur une création réussie.
    redirect(`/products/${created.id}`);
}
```

- [x] **Étape 4 : la liste**

`apps/vendor/src/app/products/page.tsx` :

```tsx
import { listProductsForVendor, prisma } from "@clemperl/db";
import { formatPrice } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { JSX } from "react";
import { requireVendorMembership } from "../../lib/session";

export const dynamic = "force-dynamic";

const t = messages.products;

export default async function ProductsPage(): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();

    // Un prix sans devise n'est pas un prix. On renvoie là où la devise se choisit
    // plutôt que d'afficher une liste que le vendeur ne pourra pas alimenter.
    if (!vendor.currency) {
        redirect("/shop");
    }

    const products = await listProductsForVendor(prisma, vendor.id);

    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <div className="flex items-baseline justify-between gap-6">
                <h1 className="font-titre text-4xl leading-tight tracking-tight">{t.title}</h1>
                <Link href="/products/new" className="text-sm underline">
                    {t.create}
                </Link>
            </div>

            {products.length === 0 ? (
                <p className="mt-12 text-sm text-muet">{t.empty}</p>
            ) : (
                <ul className="mt-12 flex flex-col">
                    {products.map((product) => {
                        const prices = product.variants.map((variant) => variant.priceAmount);
                        const low = Math.min(...prices);
                        const high = Math.max(...prices);
                        return (
                            <li key={product.id} className="border-t border-bordure py-4">
                                <Link href={`/products/${product.id}`} className="flex justify-between gap-6">
                                    <span>{product.title}</span>
                                    <span className="text-sm text-muet">
                                        {low === high
                                            ? formatPrice(low, vendor.currency)
                                            : `${formatPrice(low, vendor.currency)} – ${formatPrice(high, vendor.currency)}`}
                                    </span>
                                </Link>
                                <p className="mt-1 text-xs text-muet">
                                    {t[product.status]} ·{" "}
                                    {product.variants.length === 1
                                        ? t.singleVariant
                                        : t.variantCount.replace("{count}", String(product.variants.length))}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}
        </main>
    );
}
```

- [x] **Étape 5 : l'écran de création**

`apps/vendor/src/app/products/new/new-product-form.tsx` :

```tsx
"use client";

import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { Button, Field, FormSection, TextAreaField } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { createProductAction } from "../actions";
import { INITIAL_PRODUCT_STATE } from "../types/product-form-state.interface";

export function NewProductForm(): JSX.Element {
    const t = messages.products;
    const [state, action, pending] = useActionState(createProductAction, INITIAL_PRODUCT_STATE);

    return (
        <form action={action} className="mt-12 flex flex-col gap-12">
            <FormSection title={t.createTitle}>
                <Field label={t.productTitle} name="title" required minLength={2} maxLength={120} />
                <TextAreaField
                    label={t.description}
                    name="description"
                    required
                    minLength={20}
                    maxLength={4000}
                    rows={4}
                    hint={t.descriptionHint}
                />
                {/* Un champ TEXTE et non `type="number"` : la saisie francophone écrit
                    « 12,50 », qu'un contrôle numérique refuse silencieusement selon la
                    locale du navigateur. La conversion est faite par le domaine. */}
                <Field label={t.price} name="price" required inputMode="decimal" hint={t.priceHint} />
            </FormSection>

            {state.message.length > 0 && (
                <p role="alert" className="text-sm text-accent">
                    {state.message.join(" ")}
                </p>
            )}

            <Button type="submit" disabled={pending}>
                {t.save}
            </Button>
        </form>
    );
}
```

`apps/vendor/src/app/products/new/page.tsx` :

```tsx
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { redirect } from "next/navigation";
import type { JSX } from "react";
import { requireVendorMembership } from "../../../lib/session";
import { NewProductForm } from "./new-product-form";

export const dynamic = "force-dynamic";

export default async function NewProductPage(): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();
    if (!vendor.currency) {
        redirect("/shop");
    }

    return (
        <main className="mx-auto max-w-2xl px-6 py-16">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">
                {messages.products.createTitle}
            </h1>
            <NewProductForm />
        </main>
    );
}
```

- [x] **Étape 6 : le lien de navigation**

Dans `apps/vendor/src/app/layout.tsx`, ajouter à côté du lien « Ma boutique » :

```tsx
<Link href="/products">{messages.navigation.products}</Link>
```

- [x] **Étape 7 : vérifier**

```bash
pnpm lint && pnpm typecheck
```

Puis, la stack démarrée, créer un produit à la main sur `http://localhost:3001/products/new`
et constater la redirection vers sa fiche.

---

## Tâche 7 : La fiche et la grille de variantes

**Fichiers**
- Créer : `apps/vendor/src/app/products/[id]/page.tsx`
- Créer : `apps/vendor/src/app/products/[id]/actions.ts`
- Créer : `apps/vendor/src/app/products/[id]/product-form.tsx`
- Modifier : `packages/i18n/messages/vendor/fr.json`
- Tester : `e2e/vendor-product.spec.ts`

**Interfaces**
- Consomme : `readProductForVendor`, `saveProduct`, `setProductStatus`,
  `buildVariantMatrix`, `selectionKey`, `parsePrice`, `formatPrice`.
- Produit : `saveProductAction(previous, form)`, `toggleProductStatus(form)`.

- [x] **Étape 1 : les libellés**

Ajouter à la section `products` de `packages/i18n/messages/vendor/fr.json` :

```json
    "detailsSection": "Le produit",
    "optionsSection": "Déclinaisons",
    "optionsHint": "Déclarez ce qui distingue vos déclinaisons : une taille, une couleur, une finition. Laissez vide si votre produit est unique.",
    "optionName": "Nom de l'axe",
    "optionValues": "Valeurs, séparées par une virgule",
    "addOption": "Ajouter un axe",
    "removeOption": "Retirer",
    "priceGrid": "Prix",
    "saveProduct": "Enregistrer",
    "publish": "Publier",
    "unpublish": "Repasser en brouillon",
    "savedProduct": "Votre produit est enregistré."
```

- [x] **Étape 2 : les actions**

`apps/vendor/src/app/products/[id]/actions.ts` :

```ts
"use server";

import { prisma, saveProduct, setProductStatus } from "@clemperl/db";
import { parsePrice, productDetailsSchema, productOptionsSchema, selectionKey } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { revalidatePath } from "next/cache";
import { requireVendorMembership } from "../../../lib/session";
import type { IProductFormState } from "../types/product-form-state.interface";

// Les axes arrivent en deux champs parallèles répétés : `optionName` et `optionValues`.
// Un formulaire HTML n'envoie pas de structure — il envoie des paires, et c'est ici
// qu'elles redeviennent une liste.
function readOptions(form: FormData): { name: string; values: string[] }[] {
    const names = form.getAll("optionName").map(String);
    const raw = form.getAll("optionValues").map(String);
    return names
        .map((name, index) => ({
            name: name.trim(),
            values: (raw[index] ?? "")
                .split(",")
                .map((value) => value.trim())
                .filter((value) => value.length > 0),
        }))
        .filter((option) => option.name.length > 0 && option.values.length > 0);
}

export async function saveProductAction(
    _previous: IProductFormState,
    form: FormData,
): Promise<IProductFormState> {
    const { vendor } = await requireVendorMembership();
    if (!vendor.currency) {
        return { message: [messages.errors.currencyMissing], saved: false };
    }

    const productId = String(form.get("productId") ?? "");
    const details = productDetailsSchema.safeParse({
        title: form.get("title"),
        description: form.get("description"),
    });
    const options = productOptionsSchema.safeParse(readOptions(form));
    if (!details.success || !options.success) {
        return { message: [messages.errors.invalid], saved: false };
    }

    // Les prix arrivent comme `price:<clé de combinaison>`. La clé est produite par la
    // même fonction des deux côtés, donc aucune divergence de format n'est possible.
    const prices: Record<string, number> = {};
    try {
        for (const [field, value] of form.entries()) {
            if (!field.startsWith("price:")) continue;
            prices[field.slice("price:".length)] = parsePrice(String(value), vendor.currency);
        }
    } catch {
        return { message: [messages.errors.priceInvalid], saved: false };
    }

    try {
        // `productId` vient du CLIENT. Le dépôt filtre sur `(id, vendorId)` : sans cela,
        // un vendeur corrige le produit d'un autre en changeant un chiffre dans l'URL.
        await saveProduct(prisma, {
            productId,
            vendorId: vendor.id,
            title: details.data.title,
            description: details.data.description,
            options: options.data,
            prices,
        });
    } catch (error) {
        console.error("saveProductAction", error);
        return { message: [messages.errors.failed], saved: false };
    }

    revalidatePath(`/products/${productId}`);
    return { message: [], saved: true };
}

export async function toggleProductStatus(form: FormData): Promise<void> {
    const { vendor } = await requireVendorMembership();
    const productId = String(form.get("productId") ?? "");
    const publish = form.get("publish") === "1";

    await setProductStatus(prisma, { productId, vendorId: vendor.id, publish });
    revalidatePath(`/products/${productId}`);
}
```

- [x] **Étape 3 : la fiche**

`apps/vendor/src/app/products/[id]/page.tsx` :

```tsx
import { prisma, readProductForVendor } from "@clemperl/db";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";
import { requireVendorMembership } from "../../../lib/session";
import { ProductForm } from "./product-form";
import { toggleProductStatus } from "./actions";

export const dynamic = "force-dynamic";

const t = messages.products;

export default async function ProductPage({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();
    if (!vendor.currency) {
        redirect("/shop");
    }

    const { id } = await params;
    const product = await readProductForVendor(prisma, { productId: id, vendorId: vendor.id });

    // `notFound()` et non une redirection : ne pas confirmer à un intrus que cet
    // identifiant existe ailleurs.
    if (!product) {
        notFound();
    }

    const options = product.options.map((option) => ({
        name: option.name,
        values: option.values.map((value) => value.label),
    }));
    const variants = product.variants.map((variant) => ({
        selections: Object.fromEntries(
            variant.values.map((value) => [value.option.name, value.optionValue.label]),
        ),
        priceAmount: variant.priceAmount,
    }));

    return (
        <main className="mx-auto max-w-2xl px-6 py-16">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">{product.title}</h1>
            <p className="mt-2 text-sm text-muet">{t[product.status]}</p>

            <ProductForm
                productId={product.id}
                title={product.title}
                description={product.description}
                currency={vendor.currency}
                options={options}
                variants={variants}
            />

            <form action={toggleProductStatus} className="mt-12">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="publish" value={product.status === "PUBLISHED" ? "0" : "1"} />
                <button type="submit" className="text-sm underline">
                    {product.status === "PUBLISHED" ? t.unpublish : t.publish}
                </button>
            </form>
        </main>
    );
}
```

- [x] **Étape 4 : le formulaire et sa grille**

`apps/vendor/src/app/products/[id]/product-form.tsx` :

```tsx
"use client";

import type { TCurrency } from "@clemperl/core";
import { buildVariantMatrix, formatPrice, selectionKey } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { Button, Field, FormSection, TextAreaField } from "@clemperl/ui";
import { useActionState, useState, type JSX } from "react";
import { saveProductAction } from "./actions";
import { INITIAL_PRODUCT_STATE } from "../types/product-form-state.interface";

interface OptionRow {
    name: string;
    values: string[];
}

interface ProductFormProps {
    productId: string;
    title: string;
    description: string;
    currency: TCurrency;
    options: OptionRow[];
    variants: { selections: Record<string, string>; priceAmount: number }[];
}

export function ProductForm(product: ProductFormProps): JSX.Element {
    const t = messages.products;
    const [state, action, pending] = useActionState(saveProductAction, INITIAL_PRODUCT_STATE);
    const [options, setOptions] = useState<OptionRow[]>(product.options);

    // La MÊME fonction pure que le serveur : la grille affichée est celle qui sera
    // écrite, sans qu'aucune règle ne soit recopiée côté client.
    const grid = buildVariantMatrix(options, product.variants, product.variants[0]?.priceAmount ?? 0);

    return (
        <form action={action} className="mt-12 flex flex-col gap-12">
            <input type="hidden" name="productId" value={product.productId} />

            <FormSection title={t.detailsSection}>
                <Field label={t.productTitle} name="title" required minLength={2} maxLength={120} defaultValue={product.title} />
                <TextAreaField
                    label={t.description}
                    name="description"
                    required
                    minLength={20}
                    maxLength={4000}
                    rows={4}
                    defaultValue={product.description}
                />
            </FormSection>

            <FormSection title={t.optionsSection}>
                <p className="text-sm text-muet">{t.optionsHint}</p>
                {options.map((option, index) => (
                    <div key={index} className="flex flex-col gap-2 border-t border-bordure pt-4">
                        <Field
                            label={t.optionName}
                            name="optionName"
                            defaultValue={option.name}
                            onChange={(event) =>
                                setOptions((current) =>
                                    current.map((row, position) =>
                                        position === index ? { ...row, name: event.target.value } : row,
                                    ),
                                )
                            }
                        />
                        <Field
                            label={t.optionValues}
                            name="optionValues"
                            defaultValue={option.values.join(", ")}
                            onChange={(event) =>
                                setOptions((current) =>
                                    current.map((row, position) =>
                                        position === index
                                            ? {
                                                  ...row,
                                                  values: event.target.value
                                                      .split(",")
                                                      .map((value) => value.trim())
                                                      .filter((value) => value.length > 0),
                                              }
                                            : row,
                                    ),
                                )
                            }
                        />
                        <button
                            type="button"
                            className="self-start text-xs underline"
                            onClick={() =>
                                setOptions((current) => current.filter((_, position) => position !== index))
                            }
                        >
                            {t.removeOption}
                        </button>
                    </div>
                ))}
                {options.length < 3 && (
                    <button
                        type="button"
                        className="self-start text-sm underline"
                        onClick={() => setOptions((current) => [...current, { name: "", values: [] }])}
                    >
                        {t.addOption}
                    </button>
                )}
            </FormSection>

            {/* La grille n'apparaît QUE s'il existe un axe. Sans axe, le vendeur voit un
                champ « Prix » et le mot « déclinaison » n'est écrit nulle part — un
                joaillier qui vend des pièces uniques n'a pas à comprendre la notion. */}
            <FormSection title={t.priceGrid}>
                {grid.map((variant) => {
                    const key = selectionKey(variant.selections);
                    const label = Object.values(variant.selections).join(" / ");
                    return (
                        <Field
                            key={key}
                            label={label.length > 0 ? label : t.price}
                            name={`price:${key}`}
                            required
                            inputMode="decimal"
                            defaultValue={formatPriceForInput(variant.priceAmount, product.currency)}
                        />
                    );
                })}
            </FormSection>

            {state.message.length > 0 && (
                <p role="alert" className="text-sm text-accent">
                    {state.message.join(" ")}
                </p>
            )}
            {state.saved && <p className="text-sm text-muet">{t.savedProduct}</p>}

            <Button type="submit" disabled={pending}>
                {t.saveProduct}
            </Button>
        </form>
    );
}

// `formatPrice` rend « 12,50 € ». Un champ de saisie ne doit porter que le nombre,
// sinon le renvoi du formulaire échoue sur son propre affichage.
function formatPriceForInput(amount: number, currency: TCurrency): string {
    return formatPrice(amount, currency)
        .replace(/[^\d,.\s  ]/g, "")
        .trim();
}
```

- [x] **Étape 5 : le parcours navigateur**

`e2e/vendor-product.spec.ts` :

```ts
import { expect, test } from "@playwright/test";
import { URL_VENDOR } from "../playwright.config";
import { signInAsApprovedVendor } from "./helpers/accounts";

// `getByRole` avec un nom accessible, jamais `getByLabel` : `Field` enveloppe son
// contrôle dans le `<label>`, et Playwright compare le texte du label par SOUS-CHAÎNE —
// une description qui contient « Taille » ferait correspondre deux éléments.
test("un vendeur crée un produit, le décline en trois tailles et le publie", async ({ page }) => {
    await signInAsApprovedVendor(page);

    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();

    await page.goto(`${URL_VENDOR}/products/new`);
    await page.getByRole("textbox", { name: "Titre" }).fill("Tee-shirt en lin");
    await page
        .getByRole("textbox", { name: "Description" })
        .fill("Lin lavé tissé en Europe, coupe droite, col rond, coutures renforcées.");
    await page.getByRole("textbox", { name: "Prix" }).fill("49,00");
    await page.getByRole("button", { name: "Créer le produit" }).click();

    await page.waitForURL(/\/products\/[^/]+$/);

    // Sans axe, le mot « déclinaison » ne doit apparaître nulle part comme intitulé de
    // ligne de grille : c'est la contrainte d'interface de la tranche.
    await expect(page.getByRole("textbox", { name: "Prix" })).toBeVisible();

    await page.getByRole("button", { name: "Ajouter un axe" }).click();
    await page.getByRole("textbox", { name: "Nom de l'axe" }).fill("Taille");
    await page.getByRole("textbox", { name: "Valeurs, séparées par une virgule" }).fill("S, M, L");

    await expect(page.getByRole("textbox", { name: "S" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "M" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "L" })).toBeVisible();

    await page.getByRole("textbox", { name: "L" }).fill("55,00");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Votre produit est enregistré.")).toBeVisible();

    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByText("Publié")).toBeVisible();

    await page.goto(`${URL_VENDOR}/products`);
    await expect(page.getByRole("link", { name: /Tee-shirt en lin/ })).toBeVisible();
    await expect(page.getByText("3 déclinaisons")).toBeVisible();
});
```

Si `signInAsApprovedVendor` n'existe pas encore dans `e2e/helpers/accounts.ts`, l'écrire
en reprenant le parcours d'approbation de `e2e/vendor-shop.spec.ts` — **ne pas le
dupliquer dans le nouveau fichier**.

- [x] **Étape 6 : ajouter la route au préchauffage**

Dans `e2e/global-setup.ts`, ajouter `${URL_VENDOR}/products` à la liste des routes
visitées. En développement, Next compile au PREMIER accès — jusqu'à une vingtaine de
secondes — et un test sain dépasserait alors son délai.

- [x] **Étape 7 : exécuter**

```bash
pnpm docker:up
# attendre la santé des conteneurs
docker compose --env-file .env -f docker/docker-compose.dev.yml ps
pnpm exec playwright test e2e/vendor-product.spec.ts
```

Attendu : vert. En cas d'échec sur un sélecteur, préférer corriger le **nom accessible**
du composant plutôt que d'assouplir le sélecteur.

---

## Tâche 8 : Planchers, critères, et remise

**Fichiers**
- Modifier : `packages/domain/vitest.config.ts`, et les autres configurations dont la
  couverture a monté
- Modifier : `docs/passation.md`
- Modifier : `docs/pieges.md` (si un piège nouveau a été payé)
- Modifier : `CLAUDE.md` (ligne de routage vers la spec T2b)

- [x] **Étape 1 : relever les couvertures**

```bash
env -u DATABASE_URL pnpm test 2>&1 | grep -E "^All files|@clemperl/.*All files"
```

Inscrire les valeurs **mesurées** dans chaque `vitest.config.ts` concerné. Le cliquet
monte, il ne descend jamais : un plancher qui baisse est un plancher qu'on a contourné.

- [x] **Étape 2 : prouver que le cliquet mord**

```bash
cat > packages/domain/src/utils/ratchet-probe.utils.ts <<'EOF'
export function neverCalled(value: number): number {
    return value > 0 ? value * 2 : 0;
}
EOF
pnpm --filter @clemperl/domain test
rm packages/domain/src/utils/ratchet-probe.utils.ts
pnpm --filter @clemperl/domain test
```

Attendu : échec sur `does not meet global threshold`, puis retour au vert.

- [x] **Étape 3 : passer les neuf critères d'acceptation**

```bash
pnpm lint && pnpm typecheck && env -u DATABASE_URL pnpm test && pnpm verify:thresholds
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.e2e.ts --runInBand"
pnpm test:e2e
```

Puis vérifier un à un les neuf critères de la section 12 de la spec. Le septième —
l'isolation entre boutiques — est couvert par `product-repository.int-spec.ts` ; le
huitième par `setShopCurrency`.

- [x] **Étape 4 : mettre à jour la documentation**

Dans `docs/passation.md`, passer T2b à « **Livrée** » et ajouter à « Ce qui reste
ouvert » ce que la tranche laisse en l'état : aucune image sur un produit jusqu'à T2c,
aucun stock jusqu'à T3, et le plafond de `Int` sur `priceAmount`.

Dans `CLAUDE.md`, ajouter la ligne de routage :

```
| Modéliser un produit, ses axes, ses variantes ou un prix | [Design T2b](docs/superpowers/specs/2026-09-21-t2b-produit-variantes-design.md) |
```

- [x] **Étape 5 : nettoyer**

```bash
docker image prune -f
docker ps -a --filter "ancestor=postgres:17-alpine" --format '{{.Names}}'
rm -rf test-results playwright-report
```

Attendu : aucun conteneur hors `clemperl_dev_postgres`.

- [ ] **Étape 6 : remettre le commit au propriétaire du dépôt**

Rédiger le message en **anglais**, sans trailer d'attribution, et le remettre. Ne pas
l'exécuter sauf autorisation explicite de l'utilisateur.

Le corps dit : ce que la tranche livre, les cinq décisions de modélisation et leur
raison, ce qui n'est pas armé (aucune image, aucun stock, rien de public), ce qui n'a pas
été vérifié, et les suites hors périmètre.

---

## Auto-revue du plan

**Couverture de la spec.** Les treize sections de la spec sont couvertes : le modèle et
ses contraintes en tâche 1 ; l'argent et les schémas en tâche 2 ; la grille en tâche 3 ;
les dépôts et l'isolation en tâche 4 ; la devise en tâche 5 ; les écrans en tâches 6 et
7 ; les tests répartis ; les critères et la remise en tâche 8.

**Cohérence des types.** `selectionKey` produit la clé utilisée par `IVariantDraft`
(tâche 3), par `ISaveProduct.prices` (tâche 4) et par l'attribut `name` des champs de
prix (tâche 7) — une seule fonction, aucun format recopié. `IOptionDraft` est défini en
tâche 3 et consommé tel quel en tâches 4 et 7.

**Un point à surveiller à l'exécution.** En tâche 7, `ProductForm` importe
`buildVariantMatrix` depuis `@clemperl/domain` dans un composant client. Vérifier que
`@clemperl/domain` figure bien dans `transpilePackages` de `apps/vendor/next.config.ts`
— il y a été ajouté juste avant T2b — et que le module n'entraîne aucun import de
`@clemperl/db` autre que `@clemperl/db/enums`, faute de quoi le client Prisma partirait
dans le paquet du navigateur.
