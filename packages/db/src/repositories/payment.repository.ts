import type { PrismaClient } from "../../generated/prisma/client.js";

// Le dépôt des paiements : il déplace l'axe de l'argent d'une commande, indépendant de celui
// de l'expédition, et tient la trace de chaque tentative.

export const ERROR_PAYMENT_ORDER_NOT_FOUND = "PAYMENT_ORDER_NOT_FOUND";
export const ERROR_PAYMENT_ORDER_CANCELLED = "PAYMENT_ORDER_CANCELLED";
export const ERROR_PAYMENT_ALREADY_SETTLED = "PAYMENT_ALREADY_SETTLED";
export const ERROR_PAYMENT_NOT_OFFLINE = "PAYMENT_NOT_OFFLINE";
export const ERROR_PAYMENT_REF_UNKNOWN = "PAYMENT_REF_UNKNOWN";

// Le filtre par acheteur vit dans la SIGNATURE : `orderId` vient de l'URL, donc du client.
export async function readOrderToPay(
    prisma: PrismaClient,
    input: { buyerId: string; orderId: string },
): Promise<{
    id: string;
    reference: string;
    amount: number;
    currency: string;
    method: string;
}> {
    const order = await prisma.order.findFirst({
        where: { id: input.orderId, buyerId: input.buyerId },
        select: {
            id: true,
            reference: true,
            status: true,
            totalAmount: true,
            currency: true,
            paymentMethod: true,
            paymentStatus: true,
        },
    });
    if (!order) {
        throw new Error(ERROR_PAYMENT_ORDER_NOT_FOUND);
    }
    if (order.status === "CANCELLED") {
        throw new Error(ERROR_PAYMENT_ORDER_CANCELLED);
    }
    if (order.paymentStatus === "SETTLED") {
        throw new Error(ERROR_PAYMENT_ALREADY_SETTLED);
    }
    return {
        id: order.id,
        reference: order.reference,
        amount: order.totalAmount,
        currency: order.currency,
        method: order.paymentMethod,
    };
}

export async function recordAttempt(
    prisma: PrismaClient,
    input: {
        orderId: string;
        method: string;
        amount: number;
        currency: string;
        provider: string;
        providerRef: string;
    },
): Promise<string> {
    const attempt = await prisma.orderPayment.create({
        data: {
            orderId: input.orderId,
            method: input.method as never,
            amount: input.amount,
            currency: input.currency as never,
            provider: input.provider,
            providerRef: input.providerRef,
        },
        select: { id: true },
    });
    return attempt.id;
}

// L'idempotence est garantie pour un événement TERMINAL : une tentative tranchée ne se
// rouvre pas. Le rejeu d'un événement `PENDING`, lui, retrouve une tentative encore
// `PENDING` et la réécrit, donc `updatedAt` bouge et `rawPayload` est remplacé par un
// payload identique. Aucun statut ne bouge, et c'est pourquoi le cas est toléré : le
// fermer demanderait un identifiant d'ÉVÉNEMENT distinct de `providerRef`, que le port ne
// porte pas tant qu'aucun vrai fournisseur n'en a dicté la forme.
//
// Le retour sépare la tentative de sa commande. `changed` à `false` dit un REJEU, et non un
// échec : le fournisseur rejoue ses webhooks, et l'appelant doit lui répondre 200 pour qu'il
// cesse. `changed` à `true` dit que la TENTATIVE a bougé, pas forcément la commande.
// `orderStatusChanged` dit que l'écriture a atteint la COMMANDE, seule raison de prévenir
// quelqu'un : faux pour un rejeu, une course perdue, un événement en attente, et pour l'issue
// tardive d'une tentative dont la commande est déjà réglée. Un refus qui suit un refus
// compte, bien qu'il réécrive la même valeur : la page qui attendait ce fournisseur doit
// l'apprendre pour quitter son attente.
// `orderId` désigne la commande de la tentative, pour que l'appelant sache laquelle
// prévenir. Une référence inconnue lève avant tout retour, donc aucune tentative ne rend
// d'`orderId` nul aujourd'hui : le type le permet pour un appelant qui n'aurait aucune
// commande à désigner.
export async function applyProviderEvent(
    prisma: PrismaClient,
    input: {
        provider: string;
        providerRef: string;
        status: "PENDING" | "SETTLED" | "FAILED";
        rawPayload: Buffer;
    },
): Promise<{ changed: boolean; orderStatusChanged: boolean; orderId: string | null }> {
    return prisma.$transaction(async (tx) => {
        const attempt = await tx.orderPayment.findUnique({
            where: {
                provider_providerRef: {
                    provider: input.provider,
                    providerRef: input.providerRef,
                },
            },
            select: { id: true, status: true, orderId: true },
        });
        if (!attempt) {
            throw new Error(ERROR_PAYMENT_REF_UNKNOWN);
        }

        // Une tentative déjà tranchée ne se rouvre pas. C'est ce qui rend le rejeu sans
        // effet, et ce qui empêche un événement tardif d'annuler une issue plus récente.
        if (attempt.status !== "PENDING") {
            return { changed: false, orderStatusChanged: false, orderId: attempt.orderId };
        }

        // Le statut se REVÉRIFIE dans l'écriture : le lire plus haut ne suffit pas, car deux
        // livraisons du même événement le lisent `PENDING` avant que la première n'écrive,
        // et réécriraient toutes deux la tentative en répondant `changed: true`. La seconde
        // attend la première, relit une ligne tranchée et n'écrit rien.
        const { count } = await tx.orderPayment.updateMany({
            where: { id: attempt.id, status: "PENDING" },
            data: {
                status: input.status as never,
                // Prisma veut un `Uint8Array` adossé à un `ArrayBuffer`, qu'un `Buffer` ne
                // promet pas au niveau du type : la copie est le prix de ne pas forcer le
                // type, sur un payload de quelques centaines d'octets.
                rawPayload: new Uint8Array(input.rawPayload),
                settledAt: input.status === "SETTLED" ? new Date() : null,
            },
        });
        if (count === 0) {
            return { changed: false, orderStatusChanged: false, orderId: attempt.orderId };
        }

        // Un événement en attente dit où en est le FOURNISSEUR, pas où en est l'argent :
        // il se garde sans rien affirmer.
        if (input.status === "PENDING") {
            return { changed: true, orderStatusChanged: false, orderId: attempt.orderId };
        }

        // Une commande réglée ne se défait pas : deux onglets laissent deux tentatives
        // ouvertes, et l'échec tardif de celle qui n'a pas abouti reste dans sa trace sans
        // effet sur une commande que l'autre a payée. Le compte de lignes écrites est ce qui
        // le dit à l'appelant : une commande déjà réglée n'en donne aucune.
        const order = await tx.order.updateMany({
            where: { id: attempt.orderId, paymentStatus: { not: "SETTLED" } },
            data: { paymentStatus: input.status as never },
        });
        return { changed: true, orderStatusChanged: order.count > 0, orderId: attempt.orderId };
    });
}

// `offlineMethods` vient de l'appelant : ce paquet ne connaît pas le registre des adapters,
// qui vit dans l'API, et ne peut pas l'importer.
export async function settleOffline(
    prisma: PrismaClient,
    input: {
        vendorId: string;
        orderId: string;
        userId: string;
        offlineMethods: readonly string[];
    },
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
            where: { id: input.orderId, vendorId: input.vendorId },
            select: {
                id: true,
                status: true,
                totalAmount: true,
                currency: true,
                paymentMethod: true,
                paymentStatus: true,
            },
        });
        if (!order) {
            throw new Error(ERROR_PAYMENT_ORDER_NOT_FOUND);
        }
        // Le MÊME refus que `readOrderToPay` oppose à l'acheteur. Sans lui, le vendeur
        // pouvait faire ce que l'acheteur ne pouvait pas : pointer comme payée une commande
        // qu'il venait d'annuler. L'acheteur lisait alors « Annulée » et « Payé » côte à
        // côte, sans recours, et la trace affirmait un encaissement sur une commande qui
        // n'existe plus.
        if (order.status === "CANCELLED") {
            throw new Error(ERROR_PAYMENT_ORDER_CANCELLED);
        }
        if (!input.offlineMethods.includes(order.paymentMethod)) {
            throw new Error(ERROR_PAYMENT_NOT_OFFLINE);
        }
        if (order.paymentStatus === "SETTLED") {
            throw new Error(ERROR_PAYMENT_ALREADY_SETTLED);
        }

        // La commande s'écrit AVANT la tentative, et c'est cette écriture qui tranche : une
        // tentative hors ligne n'a ni fournisseur ni référence, aucune contrainte d'unicité
        // ne retient donc la seconde de deux requêtes simultanées. Celle-ci attend la
        // première, relit une commande réglée et refuse, avant d'avoir écrit une seconde
        // ligne `SETTLED`.
        const { count } = await tx.order.updateMany({
            where: { id: order.id, paymentStatus: { not: "SETTLED" } },
            data: { paymentStatus: "SETTLED" },
        });
        if (count === 0) {
            throw new Error(ERROR_PAYMENT_ALREADY_SETTLED);
        }
        await tx.orderPayment.create({
            data: {
                orderId: order.id,
                method: order.paymentMethod,
                status: "SETTLED",
                amount: order.totalAmount,
                currency: order.currency,
                settledById: input.userId,
                settledAt: new Date(),
            },
        });
    });
}
