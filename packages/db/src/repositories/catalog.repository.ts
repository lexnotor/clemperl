import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

// LA requête que Prisma ne sait pas écrire. Ordonner une liste de produits par le minimum
// du prix de leurs variantes suppose de trier sur un agrégat de relation, et
// `ProductVariantOrderByRelationAggregateInput` n'expose que `_count`.
//
// La sortie n'est PAS de dénormaliser un prix plancher sur le produit : une colonne n'a pas
// à exister parce qu'un client TypeScript ne sait pas faire un `MIN`, et une valeur
// dénormalisée peut dériver. On écrit donc le SQL, et on le rend sûr par construction.
//
// Trois règles, et elles tiennent ensemble :
//
// 1. Les VALEURS passent toutes par l'interpolation de `Prisma.sql`, donc deviennent des
//    paramètres liés. Aucune ne touche la chaîne.
// 2. Le TRI se choisit dans la table fermée ci-dessous, dont les fragments sont des
//    littéraux écrits ici. Une clé inconnue retombe sur `newest`.
// 3. Les CONDITIONS sont des fragments assemblés par `Prisma.join`, ce qui garde chacun
//    paramétré.
//
// Ce dépôt ne reçoit que des PRIMITIVES, jamais un type du domaine : `packages/domain`
// dépend déjà de `@clemperl/db`, et l'importer ici fermerait un cycle que Turbo ne saurait
// pas ordonner. C'est la même règle que pour la grille de variantes en T2b.
const ORDERS: Record<string, Prisma.Sql> = {
    price_asc: Prisma.raw(`MIN(v.price_amount) ASC, p.published_at DESC`),
    price_desc: Prisma.raw(`MIN(v.price_amount) DESC, p.published_at DESC`),
    newest: Prisma.raw(`p.published_at DESC`),
};

export interface ICatalogQuery {
    search: string | null;
    category: string | null;
    sort: string;
    currency: string;
    shopSlug?: string;
    limit: number;
    offset: number;
}

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

// `%` et `_` sont les jokers d'`ILIKE`. Échappés, « 100% coton » cherche ce texte ; laissés
// tels quels, il rendrait le catalogue entier. La barre oblique doit être échappée en
// premier, sinon elle échapperait les échappements qu'on vient de poser.
function escapeLike(terme: string): string {
    return terme.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function conditions(input: ICatalogQuery): Prisma.Sql[] {
    const liste: Prisma.Sql[] = [
        Prisma.sql`p.status = 'PUBLISHED'`,
        Prisma.sql`p.deleted_at IS NULL`,
        Prisma.sql`s.deleted_at IS NULL`,
        Prisma.sql`s.currency = ${input.currency}::"currency"`,
        // Un produit publié a forcément une image prête, c'est la garantie du dépôt depuis
        // T2c. La jointure reste une condition explicite : une ligne sans image rendrait
        // une carte sans vignette, et la garantie se vérifie ici plutôt que de se supposer.
        Prisma.sql`i.object_path IS NOT NULL`,
    ];

    // La vitrine d'une boutique réutilise cette requête, bornée à elle. Filtrer en mémoire
    // après coup tronquerait la vitrine d'une boutique de plus d'une page, sans rien dire.
    if (input.shopSlug !== undefined) {
        liste.push(Prisma.sql`s.slug = ${input.shopSlug}`);
    }

    if (input.category !== null) {
        liste.push(Prisma.sql`p.category = ${input.category}::"product_category"`);
    }

    if (input.search !== null) {
        const motif = `%${escapeLike(input.search)}%`;
        liste.push(
            Prisma.sql`(unaccent(p.title) ILIKE unaccent(${motif}) ESCAPE '\\'
                     OR unaccent(s.shop_name) ILIKE unaccent(${motif}) ESCAPE '\\')`,
        );
    }

    return liste;
}

// La jointure d'image choisit la READY de position la plus basse. `LEFT JOIN LATERAL` avec
// `LIMIT 1` est la forme PostgreSQL : un seul passage, et c'est la ligne qu'on veut.
const IMAGE_JOIN = Prisma.raw(`
    LEFT JOIN LATERAL (
        SELECT pi.object_path
        FROM product_images pi
        WHERE pi.product_id = p.id AND pi.status = 'READY'
        ORDER BY pi.position ASC
        LIMIT 1
    ) i ON TRUE
`);

export async function searchPublishedProducts(
    prisma: PrismaClient,
    input: ICatalogQuery,
): Promise<{ rows: ICatalogRow[]; total: number }> {
    const where = Prisma.join(conditions(input), " AND ");
    const order = ORDERS[input.sort] ?? (ORDERS["newest"] as Prisma.Sql);

    // `::int` sur les agrégats : `MIN` et `COUNT` reviennent en bigint ou en numeric selon
    // le type de départ, et `node-postgres` rend ces types en CHAÎNE. Un prix devenu chaîne
    // traverserait le formatage sans erreur, en affichant un montant faux.
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
        LIMIT ${input.limit} OFFSET ${input.offset}
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
    options: { name: string; values: { id: string; label: string }[] }[];
    variants: { combinationKey: string; priceAmount: number }[];
}

// Déclaratif, contrairement à la liste : aucun agrégat à trier ici, donc aucune raison
// d'écrire du SQL. Le filtre porte sur la BOUTIQUE autant que sur le produit, parce que le
// slug produit n'est unique que par boutique : sans cela, `/shops/A/<produit-de-B>`
// servirait le produit de B sous l'identité de A.
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
            // Seulement les PRÊTES. Une image ajoutée après publication peut être en cours
            // de traitement, et la servir rendrait une vignette cassée.
            images: {
                where: { status: "READY" },
                orderBy: { position: "asc" },
                select: { objectPath: true, altText: true },
            },
            options: {
                orderBy: { position: "asc" },
                select: {
                    name: true,
                    values: { orderBy: { position: "asc" }, select: { id: true, label: true } },
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

    return {
        slug: shop.slug,
        shopName: shop.shopName,
        shopDescription: shop.shopDescription,
        categories: shop.categories as string[],
        currency: shop.currency,
    };
}
