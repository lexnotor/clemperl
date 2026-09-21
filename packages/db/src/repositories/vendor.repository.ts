import type { E_CURRENCY, E_VENDOR_CATEGORY } from "../../generated/prisma/enums.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

type TCategory = (typeof E_VENDOR_CATEGORY)[keyof typeof E_VENDOR_CATEGORY];

// Une boutique fermée n'est pas une boutique qu'on administre : `deletedAt` la retire de
// la lecture plutôt que de laisser un ancien vendeur devant un espace fonctionnel.
export async function readVendorForMember(prisma: PrismaClient, userId: string) {
    return prisma.vendor.findFirst({
        where: { deletedAt: null, members: { some: { userId } } },
        include: { members: { select: { id: true, userId: true, role: true } } },
    });
}

// Les champs légaux et le `slug` ne sont pas absents de cette interface par oubli : ils
// en sont exclus pour qu'aucun appelant ne PUISSE les écrire par ce chemin. Une
// vérification à l'entrée s'oublie au prochain appelant ; une signature, non.
export interface IUpdateShopProfile {
    vendorId: string;
    shopName: string;
    shopDescription: string;
    contactEmail: string;
    contactPhone: string;
    categories: TCategory[];
}

export async function updateShopProfile(prisma: PrismaClient, input: IUpdateShopProfile) {
    const { vendorId, ...fields } = input;
    return prisma.vendor.update({ where: { id: vendorId }, data: fields });
}

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
//
// Le comptage et l'écriture sont dans la MÊME transaction : entre les deux, un autre
// onglet peut créer un produit.
export async function setShopCurrency(
    prisma: PrismaClient,
    input: { vendorId: string; currency: TShopCurrency },
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        // Le verrou AVANT le comptage. Sans lui, PostgreSQL en `READ COMMITTED` laisse ce
        // comptage voir zéro produit pendant qu'une création s'engage à côté : les deux
        // transactions réussissent, et le prix du nouveau produit se retrouve interprété
        // dans une devise qu'il n'avait pas quand le vendeur l'a saisi. `createProduct`
        // prend le même verrou, sur la même ligne.
        await tx.$executeRaw`SELECT id FROM vendors WHERE id = ${input.vendorId} FOR UPDATE`;

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
