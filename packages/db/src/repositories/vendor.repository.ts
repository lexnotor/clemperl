import type { E_VENDOR_CATEGORY } from "../../generated/prisma/enums.js";
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
