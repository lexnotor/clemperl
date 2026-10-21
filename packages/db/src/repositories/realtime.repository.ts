import type { PrismaClient } from "../../generated/prisma/client.js";

// Ces lectures disent À QUI émettre une alerte en temps réel, et rien d'autre. Elles ne
// portent AUCUNE portée de lecteur (ni acheteur, ni boutique en paramètre), et c'est voulu :
// seul le service de l'API les appelle, pour décider des destinataires d'un événement dont
// l'objet est déjà connu, jamais pour rendre une donnée à un écran. Ne jamais les appeler
// depuis un front : sans portée, elles rendraient à n'importe qui l'acheteur et la boutique
// d'une commande dont il connaîtrait l'identifiant.

export interface IOrderAudience {
    buyerId: string;
    vendorId: string;
    reference: string;
}

export async function readOrderAudience(
    prisma: PrismaClient,
    orderId: string,
): Promise<IOrderAudience | null> {
    return prisma.order.findUnique({
        where: { id: orderId },
        select: { buyerId: true, vendorId: true, reference: true },
    });
}

// L'audience d'un litige est celle de sa commande.
export async function readDisputeAudience(
    prisma: PrismaClient,
    disputeId: string,
): Promise<IOrderAudience | null> {
    const dispute = await prisma.dispute.findUnique({
        where: { id: disputeId },
        select: {
            order: { select: { buyerId: true, vendorId: true, reference: true } },
        },
    });
    return dispute?.order ?? null;
}

export async function readProductImageAudience(
    prisma: PrismaClient,
    imageId: string,
): Promise<{ vendorId: string; productTitle: string; status: string } | null> {
    const image = await prisma.productImage.findUnique({
        where: { id: imageId },
        select: {
            status: true,
            product: { select: { vendorId: true, title: true } },
        },
    });
    if (!image) {
        return null;
    }
    return {
        vendorId: image.product.vendorId,
        productTitle: image.product.title,
        status: image.status,
    };
}

// Les boutiques non fermées d'un membre, triées par identifiant : l'ordre est stable d'un
// appel à l'autre, donc comparable.
export async function listVendorIdsForMember(
    prisma: PrismaClient,
    userId: string,
): Promise<string[]> {
    const memberships = await prisma.vendorMember.findMany({
        where: { userId, vendor: { deletedAt: null } },
        orderBy: { vendorId: "asc" },
        select: { vendorId: true },
    });
    return memberships.map((m) => m.vendorId);
}
