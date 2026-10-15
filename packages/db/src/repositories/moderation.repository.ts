import type { PrismaClient } from "../../generated/prisma/client.js";

export const ERROR_MODERATION_PRODUCT_NOT_FOUND = "MODERATION_PRODUCT_NOT_FOUND";

/**
 * La file de modération : les publiés sans la marque, du plus récent au plus ancien.
 *
 * Elle se VIDE, et c'est sa propriété importante : un administrateur sait qu'il a fini. Un
 * filtre par date ne le dirait jamais, et deux administrateurs s'y recouvriraient sans le
 * savoir.
 *
 * La boutique suspendue est exclue : la suspension est déjà la décision la plus forte, et
 * ses articles ne sont plus au catalogue.
 *
 * `id` départage : deux produits publiés dans la même milliseconde oscilleraient sinon d'un
 * rendu à l'autre.
 */
export async function listProductsToModerate(prisma: PrismaClient): Promise<
    {
        id: string;
        title: string;
        publishedAt: Date | null;
        imagePath: string;
        shopName: string;
        shopSlug: string;
        productSlug: string;
    }[]
> {
    const rows = await prisma.product.findMany({
        where: {
            status: "PUBLISHED",
            deletedAt: null,
            // `NOT ... has` et non `isEmpty` : un produit peut porter un autre tag sans
            // porter `REVIEWED`, et `isEmpty` l'exclurait à tort. Aucun second tag n'existe
            // aujourd'hui, donc les deux formes se valent ; celle-ci reste vraie demain.
            NOT: { systemTags: { has: "REVIEWED" } },
            vendor: { deletedAt: null, suspendedAt: null },
        },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        select: {
            id: true,
            slug: true,
            title: true,
            publishedAt: true,
            vendor: { select: { shopName: true, slug: true } },
            images: {
                where: { status: "READY" as const },
                orderBy: { position: "asc" as const },
                take: 1,
                select: { objectPath: true },
            },
        },
    });

    return rows.map((row) => ({
        id: row.id,
        title: row.title,
        publishedAt: row.publishedAt,
        imagePath: row.images[0]?.objectPath ?? "",
        shopName: row.vendor.shopName,
        shopSlug: row.vendor.slug,
        productSlug: row.slug,
    }));
}

/**
 * Marque un produit comme examiné, et le sort de la file.
 *
 * Idempotente : poser la marque deux fois n'écrit rien la seconde fois, et le tableau ne
 * porte pas deux `REVIEWED`. Le `updateMany` filtré rend zéro ligne touchée au lieu de
 * lever, ce qui est le comportement voulu pour deux administrateurs sur la même ligne.
 */
export async function markProductReviewed(
    prisma: PrismaClient,
    productId: string,
): Promise<void> {
    await prisma.product.updateMany({
        where: { id: productId, NOT: { systemTags: { has: "REVIEWED" } } },
        data: { systemTags: { push: "REVIEWED" } },
    });
}

/**
 * Retire un produit du catalogue, et rend de quoi écrire à son vendeur.
 *
 * L'écriture et la lecture sont dans la MÊME transaction : l'appelant a besoin du titre et
 * de l'adresse pour son courriel, et les relire après coup les lirait peut-être changés.
 *
 * `alreadyRetired` dit à l'appelant de ne PAS envoyer de second courriel. Un vendeur qui
 * reçoit deux fois le même reproche pour un seul acte croit qu'on s'acharne.
 */
export async function retireProduct(
    prisma: PrismaClient,
    input: { productId: string },
): Promise<{ title: string; contactEmail: string; locale: string; alreadyRetired: boolean }> {
    return prisma.$transaction(async (tx) => {
        const product = await tx.product.findFirst({
            where: { id: input.productId, deletedAt: null },
            select: {
                id: true,
                title: true,
                status: true,
                vendor: {
                    select: {
                        contactEmail: true,
                        // NULLABLE : toute boutique ne vient pas d'une candidature, et
                        // c'est d'elle que vient la langue du vendeur.
                        application: { select: { locale: true } },
                    },
                },
            },
        });
        if (!product) {
            throw new Error(ERROR_MODERATION_PRODUCT_NOT_FOUND);
        }

        // C'est L'ÉCRITURE qui tranche, pas une lecture suivie d'une décision. Le filtre
        // `status: "PUBLISHED"` fait que la base départage deux retraits simultanés : le
        // second touche zéro ligne, et c'est ce zéro qui dit « déjà retiré ».
        //
        // Lire l'état puis décider laisserait les deux appels voir `PUBLISHED` avant que
        // l'un ait commis, donc annoncer deux fois le retrait, et le vendeur recevrait deux
        // fois le même reproche pour un seul acte.
        //
        // `publishedAt` ne bouge pas : il date le moment où le slug a cessé de pouvoir
        // changer, et un retrait ne rend pas une URL réutilisable. Même raison qu'une
        // dépublication ordinaire.
        const { count } = await tx.product.updateMany({
            where: { id: product.id, status: "PUBLISHED" },
            data: { status: "DRAFT" },
        });
        const alreadyRetired = count === 0;

        return {
            title: product.title,
            contactEmail: product.vendor.contactEmail,
            locale: product.vendor.application?.locale ?? "fr",
            alreadyRetired,
        };
    });
}
