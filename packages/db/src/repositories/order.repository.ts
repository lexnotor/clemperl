import type { PrismaClient } from "../../generated/prisma/client.js";
import { eligibleVariantWhere } from "./cart.repository.js";

export const ERROR_CART_EMPTY = "CART_EMPTY";
export const ERROR_TOTAL_CHANGED = "TOTAL_CHANGED";
// Refus de la VALIDATION : distinct de `ERROR_CART_ITEM_INELIGIBLE`, qui refuse l'AJOUT.
// Deux moments, deux messages à l'écran, donc deux constantes.
export const ERROR_ITEM_INELIGIBLE = "ORDER_ITEM_INELIGIBLE";
export const ERROR_ORDER_NOT_FOUND = "ORDER_NOT_FOUND";
export const ERROR_ORDER_STATUS_STALE = "ORDER_STATUS_STALE";

// Le libellé de déclinaison vient de l'APPELANT, parce qu'il se calcule dans
// `packages/domain`, que ce package ne peut pas importer sans fermer un cycle. Un appelant
// qui oublie une ligne figerait donc une commande incapable de dire ce qui a été acheté,
// et le figeage étant définitif, cette information ne reviendrait jamais. Un oubli fait
// du bruit.
export const ERROR_LINE_MISSING = "ORDER_LINE_MISSING";

export interface IPlaceOrders {
    userId: string;
    expectedTotal: number;
    shipTo: {
        name: string;
        phone: string;
        line: string;
        city: string;
        country: string;
    };
    // Slug de boutique vers son mot.
    notes: Readonly<Record<string, string>>;
    // Libellés figés, calculés par l'appelant : ce paquet ne peut pas importer le domaine.
    lines: readonly { variantId: string; label: string }[];
}

// Un alphabet SANS caractères ambigus : ni O ni 0, ni I ni 1. Cette référence se dicte au
// téléphone, et un `cuid` est un bon identifiant mais une mauvaise chose à épeler.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newReference(): string {
    const draw = Array.from(
        { length: 6 },
        () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
    ).join("");
    return `CMD-${new Date().getFullYear()}-${draw}`;
}

// Lecture SÛRE d'un objet littéral indexé par une chaîne venue des données. Un accès par
// crochet traverse la chaîne de prototypes : une boutique nommée « Constructor » a pour
// slug `constructor`, et rendrait `Object.prototype.constructor`, une fonction que le
// `?? null` ne rattrape pas. Ne pas revenir à un accès direct. `catalog.repository.ts`
// emploie `Object.hasOwn` pour la même raison, sur sa table de tris.
function noteFor(notes: Readonly<Record<string, string>>, shopSlug: string): string | null {
    return Object.hasOwn(notes, shopSlug) ? (notes[shopSlug] ?? null) : null;
}

export async function placeOrders(
    prisma: PrismaClient,
    input: IPlaceOrders,
): Promise<{ references: string[] }> {
    return prisma.$transaction(async (tx) => {
        // Le VERROU d'abord. Sans lui, deux onglets lisent tous deux un panier plein et
        // écrivent chacun leur jeu de commandes : l'acheteur paie deux fois pour un seul
        // achat. Même mécanique que le verrou de devise de T2b et celui des collections.
        await tx.$executeRaw`SELECT id FROM carts WHERE user_id = ${input.userId} FOR UPDATE`;

        const cart = await tx.cart.findUnique({
            where: { userId: input.userId },
            select: {
                id: true,
                currency: true,
                items: { select: { variantId: true, quantity: true } },
            },
        });
        if (!cart || cart.items.length === 0) {
            throw new Error(ERROR_CART_EMPTY);
        }

        // Les prix sont RELUS ici, jamais repris du panier : un vendeur a pu les changer
        // pendant que l'acheteur remplissait son adresse.
        const lines = [];
        for (const item of cart.items) {
            const variant = await tx.productVariant.findFirst({
                where: eligibleVariantWhere(item.variantId),
                select: {
                    id: true,
                    priceAmount: true,
                    product: {
                        select: {
                            title: true,
                            vendorId: true,
                            vendor: { select: { slug: true } },
                            images: {
                                where: { status: "READY" as const },
                                orderBy: { position: "asc" as const },
                                take: 1,
                                select: { objectPath: true },
                            },
                        },
                    },
                },
            });
            // Un article devenu inéligible interrompt TOUT : une commande amputée en
            // silence est pire qu'un refus, l'acheteur croirait avoir ce qu'il n'a plus.
            if (!variant) {
                throw new Error(ERROR_ITEM_INELIGIBLE);
            }

            lines.push({
                variantId: variant.id,
                quantity: item.quantity,
                unitAmount: variant.priceAmount,
                productTitle: variant.product.title,
                imagePath: variant.product.images[0]?.objectPath ?? "",
                vendorId: variant.product.vendorId,
                shopSlug: variant.product.vendor.slug,
            });
        }

        // Le TOTAL d'abord, les libellés ensuite, et cet ordre compte. Une ligne sans
        // libellé fourni vient presque toujours d'un panier qui a grossi dans un autre
        // onglet pendant que l'acheteur remplissait son adresse, et ce panier a donc aussi
        // un autre total. Lui dire « le total a changé » est vrai et actionnable ; lui
        // parler d'un libellé manquant ne lui dirait rien.
        const total = lines.reduce((t, l) => t + l.unitAmount * l.quantity, 0);
        if (total !== input.expectedTotal) {
            throw new Error(ERROR_TOTAL_CHANGED);
        }

        // Le refus porte sur l'ABSENCE de l'entrée, et non sur un libellé vide : un produit
        // sans axe a une seule déclinaison, dont le libellé est légitimement vide.
        // Confondre les deux refuserait la moitié du catalogue.
        const labelled = lines.map((line) => {
            const supplied = input.lines.find((l) => l.variantId === line.variantId);
            if (supplied === undefined) {
                throw new Error(ERROR_LINE_MISSING);
            }
            return { ...line, label: supplied.label };
        });

        const byShop = new Map<string, typeof labelled>();
        for (const line of labelled) {
            const existing = byShop.get(line.vendorId);
            if (existing) {
                existing.push(line);
            } else {
                byShop.set(line.vendorId, [line]);
            }
        }

        const references: string[] = [];
        for (const [vendorId, group] of byShop) {
            const reference = newReference();
            await tx.order.create({
                data: {
                    reference,
                    buyerId: input.userId,
                    vendorId,
                    currency: cart.currency,
                    shipToName: input.shipTo.name,
                    shipToPhone: input.shipTo.phone,
                    shipToLine: input.shipTo.line,
                    shipToCity: input.shipTo.city,
                    shipToCountry: input.shipTo.country,
                    // Passe par `noteFor`, qui ferme l'accès à la chaîne de prototypes.
                    note: noteFor(input.notes, group[0]?.shopSlug ?? ""),
                    totalAmount: group.reduce(
                        (t, l) => t + l.unitAmount * l.quantity,
                        0,
                    ),
                    items: {
                        create: group.map((line) => ({
                            variantId: line.variantId,
                            productTitle: line.productTitle,
                            variantLabel: line.label,
                            imagePath: line.imagePath,
                            unitAmount: line.unitAmount,
                            quantity: line.quantity,
                        })),
                    },
                },
            });
            references.push(reference);
        }

        // Dans la MÊME transaction : il ne doit exister aucun instant où les commandes
        // sont écrites et le panier encore plein.
        await tx.cart.delete({ where: { id: cart.id } });

        return { references };
    });
}

export async function listOrdersForBuyer(
    prisma: PrismaClient,
    buyerId: string,
) {
    return prisma.order.findMany({
        where: { buyerId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: {
            reference: true,
            status: true,
            currency: true,
            totalAmount: true,
            createdAt: true,
            vendor: { select: { shopName: true } },
        },
    });
}

export async function readOrderForBuyer(
    prisma: PrismaClient,
    input: { buyerId: string; reference: string },
) {
    return prisma.order.findFirst({
        where: { reference: input.reference, buyerId: input.buyerId },
        include: {
            items: { orderBy: { id: "asc" } },
            vendor: { select: { shopName: true, slug: true } },
        },
    });
}

export async function listOrdersForVendor(
    prisma: PrismaClient,
    vendorId: string,
) {
    return prisma.order.findMany({
        where: { vendorId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: {
            id: true,
            reference: true,
            status: true,
            currency: true,
            totalAmount: true,
            createdAt: true,
            shipToName: true,
        },
    });
}

export async function readOrderForVendor(
    prisma: PrismaClient,
    input: { vendorId: string; orderId: string },
) {
    return prisma.order.findFirst({
        where: { id: input.orderId, vendorId: input.vendorId },
        include: { items: { orderBy: { id: "asc" } } },
    });
}

// Le filtre par boutique vit dans la SIGNATURE, pas dans une vérification d'appelant :
// `orderId` vient de l'URL, donc du client. C'est la règle que T2c a écrite et que T2e a
// dû réapprendre.
//
// La transition elle-même est décidée par le domaine, qui ne peut pas être importé ici.
// L'appelant la calcule et passe l'état visé ; ce dépôt vérifie seulement l'appartenance.
export async function setOrderStatus(
    prisma: PrismaClient,
    input: { vendorId: string; orderId: string; from: string; status: string },
): Promise<void> {
    // `from` dans le `where`, et c'est le cœur de cette fonction. L'appelant a LU un état
    // puis calculé la transition : sans cette condition, l'écriture écrase une décision
    // plus récente. Ne pas la retirer.
    //
    // Une boutique a plusieurs membres, donc deux écrans peuvent regarder la même commande.
    // Un collègue qui accepte puis expédie pendant qu'une page reste ouverte sur « commande
    // passée » : le clic suivant sur « Accepter » ramènerait une commande EXPÉDIÉE à
    // « acceptée », et un `count === 0` sans condition de statut ne verrait rien.
    const change = await prisma.order.updateMany({
        where: { id: input.orderId, vendorId: input.vendorId, status: input.from as never },
        data: { status: input.status as never },
    });

    if (change.count === 0) {
        // On distingue les deux refus : une commande d'une autre boutique est introuvable,
        // une commande qui a bougé demande à l'écran de se recharger. Les confondre ferait
        // lire « commande introuvable » à un vendeur qui regarde la sienne.
        const exists = await prisma.order.findFirst({
            where: { id: input.orderId, vendorId: input.vendorId },
            select: { id: true },
        });
        throw new Error(exists ? ERROR_ORDER_STATUS_STALE : ERROR_ORDER_NOT_FOUND);
    }
}
