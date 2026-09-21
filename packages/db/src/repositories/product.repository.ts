import type { PrismaClient } from "../../generated/prisma/client.js";

export interface ICreateProduct {
    vendorId: string;
    slug: string;
    title: string;
    description: string;
    priceAmount: number;
}

export interface IOptionToWrite {
    name: string;
    values: readonly string[];
}

export interface IVariantToWrite {
    /** Nom d'axe → libellé de valeur. Vide quand le produit n'a aucun axe. */
    selections: Readonly<Record<string, string>>;
    priceAmount: number;
    position: number;
}

export interface ISaveProduct {
    productId: string;
    vendorId: string;
    title: string;
    /** Dérivé du titre. Ignoré dès que le produit a été publié une fois. */
    slug: string;
    description: string;
    options: readonly IOptionToWrite[];
    variants: readonly IVariantToWrite[];
}

export const ERROR_PRODUCT_NOT_FOUND = "PRODUCT_NOT_FOUND";
export const ERROR_PRODUCT_SLUG_TAKEN = "PRODUCT_SLUG_TAKEN";

// Prisma signale une violation d'unicité par ce code. Le distinguer d'une panne permet
// de dire au vendeur de changer son titre plutôt que de « réessayer » — un conseil qui
// ne marchera jamais, puisque le second essai portera le même slug.
function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: unknown }).code === "P2002"
    );
}

// Verrouille la ligne de la boutique jusqu'à la fin de la transaction courante.
//
// Sans lui, `setShopCurrency` compte zéro produit pendant qu'une création s'engage à
// côté : les deux transactions réussissent, et le prix du nouveau produit se retrouve
// interprété dans une devise qu'il n'avait pas au moment de sa saisie. PostgreSQL est en
// `READ COMMITTED` par défaut, où un comptage ne bloque personne.
async function lockVendor(
    tx: { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number> },
    vendorId: string,
): Promise<void> {
    await tx.$executeRaw`SELECT id FROM vendors WHERE id = ${vendorId} FOR UPDATE`;
}

// Ce dépôt ne calcule AUCUNE règle : la grille de variantes lui arrive déjà construite.
// `packages/domain`, qui la construit, dépend déjà de `@clemperl/db/enums` — l'importer
// ici fermerait un cycle entre les deux paquets, et `turbo` ne saurait plus lequel
// construire en premier.

// TOUTE lecture et TOUTE écriture filtrent sur `(id, vendorId)`, jamais sur `id` seul.
// Le `productId` vient de l'URL, donc du client : sans ce filtre, un vendeur corrige le
// catalogue d'un autre en changeant un chiffre. La garantie est dans la SIGNATURE — une
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

// Un produit naît avec sa variante unique, dans la même écriture. Un produit sans
// variante n'aurait pas de prix, et tout le reste de la tranche suppose qu'il en a un.
export async function createProduct(
    prisma: PrismaClient,
    input: ICreateProduct,
): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
        // Le verrou se prend AVANT l'insertion : il sérialise cette création avec tout
        // changement de devise concurrent, et c'est ce qui rend le gel de la devise vrai
        // plutôt que probable.
        await lockVendor(tx, input.vendorId);

        try {
            return await tx.product.create({
                data: {
                    vendorId: input.vendorId,
                    slug: input.slug,
                    title: input.title,
                    description: input.description,
                    variants: {
                        create: { priceAmount: input.priceAmount, combinationKey: "", position: 0 },
                    },
                },
                select: { id: true },
            });
        } catch (error) {
            if (isUniqueViolation(error)) {
                throw new Error(ERROR_PRODUCT_SLUG_TAKEN, { cause: error });
            }
            throw error;
        }
    });
}

// Corriger les axes supprime des variantes, en crée d'autres et met à jour des prix. Une
// écriture partielle laisserait un produit sans variante, ou des variantes orphelines de
// leur combinaison : tout passe donc par une seule transaction.
export async function saveProduct(prisma: PrismaClient, input: ISaveProduct): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const product = await tx.product.findFirst({
            where: { id: input.productId, vendorId: input.vendorId, deletedAt: null },
            select: { id: true, publishedAt: true },
        });
        if (!product) {
            throw new Error(ERROR_PRODUCT_NOT_FOUND);
        }

        // Les axes sont reconstruits à neuf. Les réconcilier ligne à ligne demanderait de
        // suivre les renommages, et `onDelete: Cascade` emporte de toute façon valeurs et
        // jonctions.
        await tx.productOption.deleteMany({ where: { productId: product.id } });
        await tx.productVariant.deleteMany({ where: { productId: product.id } });

        const optionIds = new Map<string, string>();
        const valueIds = new Map<string, string>();

        for (const [position, option] of input.options.entries()) {
            if (option.values.length === 0) continue;

            const created = await tx.productOption.create({
                data: { productId: product.id, name: option.name, position },
                select: { id: true },
            });
            optionIds.set(option.name, created.id);

            for (const [valuePosition, label] of option.values.entries()) {
                const value = await tx.productOptionValue.create({
                    data: { optionId: created.id, label, position: valuePosition },
                    select: { id: true },
                });
                valueIds.set(`${option.name}\u001e${label}`, value.id);
            }
        }

        for (const variant of input.variants) {
            const pairs = Object.entries(variant.selections);
            const rows = pairs.map(([name, label]) => ({
                optionId: optionIds.get(name) ?? "",
                optionValueId: valueIds.get(`${name}\u001e${label}`) ?? "",
            }));

            await tx.productVariant.create({
                data: {
                    productId: product.id,
                    priceAmount: variant.priceAmount,
                    // Les identifiants TRIÉS : c'est ce tri qui rend l'index unique
                    // capable de voir un doublon. Non trié, `a|b` et `b|a` passeraient
                    // tous deux pour des combinaisons distinctes.
                    combinationKey: rows
                        .map((row) => row.optionValueId)
                        .sort()
                        .join("|"),
                    position: variant.position,
                    values: { create: rows },
                },
            });
        }

        try {
            await tx.product.update({
                where: { id: product.id },
                data: {
                    title: input.title,
                    description: input.description,
                    // Le slug suit le titre tant que le produit n'a JAMAIS été publié.
                    // Après la première publication il est figé : il est parti dans une
                    // URL publique, et une URL qui bouge est une URL cassée.
                    ...(product.publishedAt === null ? { slug: input.slug } : {}),
                },
            });
        } catch (error) {
            if (isUniqueViolation(error)) {
                throw new Error(ERROR_PRODUCT_SLUG_TAKEN, { cause: error });
            }
            throw error;
        }
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
