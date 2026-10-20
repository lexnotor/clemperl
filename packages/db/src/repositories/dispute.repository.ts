import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { isUniqueViolation } from "../prisma-errors.js";
import { ERROR_ORDER_NOT_FOUND } from "./order.repository.js";

// Aucune de ces valeurs n'est une sous-chaîne d'une autre : un appelant qui comparerait par
// `includes` ne doit pas pouvoir confondre deux refus.
export const ERROR_DISPUTE_NOT_ELIGIBLE = "DISPUTE_NOT_ELIGIBLE";
export const ERROR_DISPUTE_EXISTS = "DISPUTE_EXISTS";
export const ERROR_DISPUTE_INVALID_LINES = "DISPUTE_INVALID_LINES";
export const ERROR_DISPUTE_NOT_FOUND = "DISPUTE_NOT_FOUND";
export const ERROR_DISPUTE_STALE = "DISPUTE_STALE";

export interface IDisputeAttachmentToStore {
    objectPath: string;
    mimeType: string;
    sizeBytes: number;
    originalName: string;
}

/**
 * Ouvre un litige sur une commande expédiée de l'acheteur, avec son premier message.
 *
 * `shippedAfter` vient de l'appelant, qui le tient du domaine : ce paquet ne peut pas
 * l'importer. Le domaine a déjà dit que la commande était contestable ; la règle est
 * revérifiée ici parce que c'est l'écriture qui fait foi, pas l'écran qui l'a précédée.
 *
 * Rend de quoi prévenir la boutique, lu dans la même transaction que l'écriture.
 */
export async function openDispute(
    prisma: PrismaClient,
    input: {
        buyerId: string;
        orderReference: string;
        shippedAfter: Date;
        reason: string;
        lineIds: readonly string[];
        body: string;
        locale: string;
        attachments: readonly IDisputeAttachmentToStore[];
    },
): Promise<{
    disputeId: string;
    orderId: string;
    reference: string;
    vendorContactEmail: string;
    vendorLocale: string;
}> {
    try {
        return await prisma.$transaction(async (tx) => {
            // L'acheteur est dans le `where` : la référence vient de l'URL, donc du client.
            const order = await tx.order.findFirst({
                where: { reference: input.orderReference, buyerId: input.buyerId },
                select: {
                    id: true,
                    reference: true,
                    status: true,
                    shippedAt: true,
                    items: { select: { id: true } },
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
            if (!order) {
                throw new Error(ERROR_ORDER_NOT_FOUND);
            }
            if (
                order.status !== "SHIPPED" ||
                order.shippedAt === null ||
                order.shippedAt < input.shippedAfter
            ) {
                throw new Error(ERROR_DISPUTE_NOT_ELIGIBLE);
            }

            // Dédoublonnées : une ligne postée deux fois violerait l'unicité de
            // `dispute_items`, et ce refus se lirait « litige déjà ouvert ».
            const owned = new Set(order.items.map((item) => item.id));
            const lineIds = [...new Set(input.lineIds)];
            if (lineIds.length === 0 || lineIds.some((id) => !owned.has(id))) {
                throw new Error(ERROR_DISPUTE_INVALID_LINES);
            }

            const now = new Date();
            const dispute = await tx.dispute.create({
                data: {
                    orderId: order.id,
                    reason: input.reason as never,
                    locale: input.locale,
                    lastActivityAt: now,
                    items: { create: lineIds.map((orderItemId) => ({ orderItemId })) },
                    messages: {
                        create: {
                            authorId: input.buyerId,
                            party: "BUYER",
                            body: input.body,
                            createdAt: now,
                            attachments: { create: input.attachments.map((attachment) => ({ ...attachment })) },
                        },
                    },
                },
                select: { id: true },
            });

            return {
                disputeId: dispute.id,
                orderId: order.id,
                reference: order.reference,
                vendorContactEmail: order.vendor.contactEmail,
                vendorLocale: order.vendor.application?.locale ?? "fr",
            };
        });
    } catch (error) {
        // L'unicité sur la commande départage deux ouvertures simultanées : la seconde
        // attend la première, puis bute sur l'index.
        if (isUniqueViolation(error)) {
            throw new Error(ERROR_DISPUTE_EXISTS, { cause: error });
        }
        throw error;
    }
}

// La portée est optionnelle ICI et nulle part ailleurs, comme pour l'écriture d'état d'une
// commande : les deux fonctions exportées plus bas sont les seules entrées, et chacune
// impose la sienne. Une portée optionnelle dans une signature publique ferait de la garde
// un paramètre qu'on oublie sans que rien ne proteste.
async function writeDisputeMessage(
    prisma: PrismaClient,
    input: {
        scope: { buyerId: string } | { vendorId: string };
        party: "BUYER" | "VENDOR";
        authorId: string;
        disputeId: string;
        body: string;
        attachments: readonly IDisputeAttachmentToStore[];
    },
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const now = new Date();

        // `status: "OPEN"` dans le `where`, et pas une relecture suivie d'une décision : un
        // message posté pendant que l'administration tranche est refusé par la base, jamais
        // rattaché à un litige fermé.
        const change = await tx.dispute.updateMany({
            where: { id: input.disputeId, status: "OPEN", order: input.scope },
            data: { lastActivityAt: now },
        });
        if (change.count === 0) {
            const exists = await tx.dispute.findFirst({
                where: { id: input.disputeId, order: input.scope },
                select: { id: true },
            });
            throw new Error(exists ? ERROR_DISPUTE_STALE : ERROR_DISPUTE_NOT_FOUND);
        }

        await tx.disputeMessage.create({
            data: {
                disputeId: input.disputeId,
                authorId: input.authorId,
                party: input.party,
                body: input.body,
                createdAt: now,
                attachments: { create: input.attachments.map((attachment) => ({ ...attachment })) },
            },
        });
    });
}

export async function postDisputeMessageAsBuyer(
    prisma: PrismaClient,
    input: {
        buyerId: string;
        disputeId: string;
        body: string;
        attachments: readonly IDisputeAttachmentToStore[];
    },
): Promise<void> {
    return writeDisputeMessage(prisma, {
        scope: { buyerId: input.buyerId },
        party: "BUYER",
        authorId: input.buyerId,
        disputeId: input.disputeId,
        body: input.body,
        attachments: input.attachments,
    });
}

// Le membre écrit POUR la boutique : la portée est la boutique, l'auteur est le compte.
export async function postDisputeMessageAsVendor(
    prisma: PrismaClient,
    input: {
        vendorId: string;
        authorId: string;
        disputeId: string;
        body: string;
        attachments: readonly IDisputeAttachmentToStore[];
    },
): Promise<void> {
    return writeDisputeMessage(prisma, {
        scope: { vendorId: input.vendorId },
        party: "VENDOR",
        authorId: input.authorId,
        disputeId: input.disputeId,
        body: input.body,
        attachments: input.attachments,
    });
}

/**
 * Tranche un litige, et rend de quoi écrire aux deux parties.
 *
 * `from` est l'état LU par l'appelant, et `status` celui que le domaine a calculé : la
 * comparaison-et-échange fait que deux administrateurs ne tranchent pas deux fois.
 */
export async function decideDispute(
    prisma: PrismaClient,
    input: {
        disputeId: string;
        decidedById: string;
        from: string;
        status: string;
        comment: string;
    },
): Promise<{
    orderId: string;
    reference: string;
    buyerEmail: string;
    buyerLocale: string;
    vendorContactEmail: string;
    vendorLocale: string;
}> {
    return prisma.$transaction(async (tx) => {
        const change = await tx.dispute.updateMany({
            where: { id: input.disputeId, status: input.from as never },
            data: {
                status: input.status as never,
                decisionComment: input.comment,
                decidedAt: new Date(),
                decidedById: input.decidedById,
            },
        });
        if (change.count === 0) {
            const exists = await tx.dispute.findUnique({
                where: { id: input.disputeId },
                select: { id: true },
            });
            throw new Error(exists ? ERROR_DISPUTE_STALE : ERROR_DISPUTE_NOT_FOUND);
        }

        const dispute = await tx.dispute.findUniqueOrThrow({
            where: { id: input.disputeId },
            select: {
                locale: true,
                order: {
                    select: {
                        id: true,
                        reference: true,
                        buyer: { select: { email: true } },
                        vendor: {
                            select: {
                                contactEmail: true,
                                application: { select: { locale: true } },
                            },
                        },
                    },
                },
            },
        });

        return {
            orderId: dispute.order.id,
            reference: dispute.order.reference,
            buyerEmail: dispute.order.buyer.email,
            buyerLocale: dispute.locale,
            vendorContactEmail: dispute.order.vendor.contactEmail,
            vendorLocale: dispute.order.vendor.application?.locale ?? "fr",
        };
    });
}

// L'acheteur seul se déclare servi : la portée est la sienne. Les champs de décision restent
// intacts, pour qu'on sache encore que l'administration avait tranché.
export async function markDisputeServed(
    prisma: PrismaClient,
    input: { buyerId: string; disputeId: string; from: string },
): Promise<void> {
    const scope = { buyerId: input.buyerId };
    const change = await prisma.dispute.updateMany({
        where: { id: input.disputeId, status: input.from as never, order: scope },
        data: { status: "SERVED", servedAt: new Date() },
    });
    if (change.count === 0) {
        const exists = await prisma.dispute.findFirst({
            where: { id: input.disputeId, order: scope },
            select: { id: true },
        });
        throw new Error(exists ? ERROR_DISPUTE_STALE : ERROR_DISPUTE_NOT_FOUND);
    }
}

// Le détail d'un litige, écrit UNE fois et partagé par les trois lecteurs : trois copies
// divergeraient au premier champ ajouté, et l'une des parties verrait moins que les autres
// sans que rien ne le signale.
//
// L'ordre des messages se CLÔT sur l'identifiant : deux messages de la même milliseconde
// doivent toujours se lire dans le même ordre.
const DISPUTE_DETAIL = {
    id: true,
    reason: true,
    status: true,
    lastActivityAt: true,
    decisionComment: true,
    decidedAt: true,
    servedAt: true,
    createdAt: true,
    items: {
        orderBy: { id: "asc" },
        select: {
            orderItem: {
                select: { id: true, productTitle: true, variantLabel: true, quantity: true },
            },
        },
    },
    messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
            id: true,
            party: true,
            body: true,
            createdAt: true,
            attachments: {
                orderBy: { id: "asc" },
                select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
            },
        },
    },
} satisfies Prisma.DisputeSelect;

// La portée de chaque lecteur vit dans la SIGNATURE, jamais dans une vérification de
// l'appelant : la référence et l'identifiant viennent de l'URL, donc du client.
export async function readDisputeForBuyer(
    prisma: PrismaClient,
    input: { buyerId: string; orderReference: string },
) {
    return prisma.dispute.findFirst({
        where: { order: { reference: input.orderReference, buyerId: input.buyerId } },
        select: DISPUTE_DETAIL,
    });
}

export async function readDisputeForVendor(
    prisma: PrismaClient,
    input: { vendorId: string; orderId: string },
) {
    return prisma.dispute.findFirst({
        where: { orderId: input.orderId, order: { vendorId: input.vendorId } },
        select: DISPUTE_DETAIL,
    });
}

// Le nom de boutique n'est pas unique : son slug l'accompagne, sans quoi l'administration
// trancherait le litige de quelqu'un d'autre.
export async function readDisputeForAdministration(prisma: PrismaClient, disputeId: string) {
    return prisma.dispute.findUnique({
        where: { id: disputeId },
        select: {
            ...DISPUTE_DETAIL,
            order: {
                select: {
                    id: true,
                    reference: true,
                    vendor: { select: { shopName: true, slug: true } },
                },
            },
        },
    });
}

// Tous les litiges ouverts, mûrs ou non : l'administration doit pouvoir trancher avant les
// sept jours. L'ordre croissant du dernier échange met d'office les plus longs silences en
// tête ; la maturité, elle, se calcule dans le domaine, et pas dans cette requête, qui en
// serait une seconde vérité.
//
// Sans pagination, comme la file de modération : un litige est une exception, pas un flux.
export async function listOpenDisputesForAdministration(prisma: PrismaClient) {
    return prisma.dispute.findMany({
        where: { status: "OPEN" },
        orderBy: [{ lastActivityAt: "asc" }, { id: "asc" }],
        select: {
            id: true,
            reason: true,
            lastActivityAt: true,
            order: {
                select: {
                    reference: true,
                    vendor: { select: { shopName: true, slug: true } },
                },
            },
        },
    });
}

const ATTACHMENT_FILE = { objectPath: true, mimeType: true, originalName: true } as const;

// Une pièce devinée hors de sa portée rend `null`, que la route traduit en 404 : répondre
// « interdit » confirmerait qu'elle existe.
export async function readDisputeAttachmentForBuyer(
    prisma: PrismaClient,
    input: { attachmentId: string; buyerId: string },
) {
    return prisma.disputeAttachment.findFirst({
        where: {
            id: input.attachmentId,
            message: { dispute: { order: { buyerId: input.buyerId } } },
        },
        select: ATTACHMENT_FILE,
    });
}

export async function readDisputeAttachmentForVendor(
    prisma: PrismaClient,
    input: { attachmentId: string; vendorId: string },
) {
    return prisma.disputeAttachment.findFirst({
        where: {
            id: input.attachmentId,
            message: { dispute: { order: { vendorId: input.vendorId } } },
        },
        select: ATTACHMENT_FILE,
    });
}

export async function readDisputeAttachmentForAdministration(
    prisma: PrismaClient,
    attachmentId: string,
) {
    return prisma.disputeAttachment.findUnique({
        where: { id: attachmentId },
        select: ATTACHMENT_FILE,
    });
}
