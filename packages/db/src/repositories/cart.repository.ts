import { isUniqueViolation } from "../prisma-errors.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

// Ce que ce dépôt ne fait PAS, et pourquoi. `setCartItemQuantity` ne vérifie aucune
// éligibilité : monter la quantité d'un article devenu indisponible est sans danger,
// puisque la validation le refuse, et la vérifier ici ferait échouer un simple retrait sur
// un article dépublié entretemps. `mergeLocalCart` retire puis ajoute article par article,
// chacun dans sa transaction : si l'ajout est refusé après le retrait, la quantité d'avant
// est perdue. Cela ne concerne qu'un article devenu inéligible, dont le retrait est
// précisément ce qu'il faut faire, et le refus est nommé à l'acheteur.

export const ERROR_CART_CURRENCY_MISMATCH = "CART_CURRENCY_MISMATCH";
export const ERROR_CART_ITEM_INELIGIBLE = "CART_ITEM_INELIGIBLE";
export const ERROR_CART_QUANTITY_INVALID = "CART_QUANTITY_INVALID";

// Les raisons d'un refus sont des CLÉS de traduction : la base ne range pas du français,
// et c'est un acheteur qui les lira.
export const CART_REJECTION = {
    ineligible: "ineligible",
    currency: "currency",
    quantity: "quantity",
} as const;

export interface ICartLine {
    variantId: string;
    quantity: number;
    unitAmount: number;
    productTitle: string;
    productSlug: string;
    imagePath: string;
    shopSlug: string;
    shopName: string;
    vendorId: string;
    optionValues: { optionName: string; valueLabel: string }[];
}

// L'ÉLIGIBILITÉ, écrite une fois. Les mêmes conditions que la liste du catalogue : le
// produit est publié et non supprimé, sa boutique est ouverte et a une devise, et il a au
// moins une image prête. Les recopier ailleurs créerait une seconde vérité, ce que la
// revue de T2d a déjà coûté une fois.
export function eligibleVariantWhere(variantId: string) {
    return {
        id: variantId,
        product: {
            status: "PUBLISHED" as const,
            deletedAt: null,
            vendor: { deletedAt: null, currency: { not: null } },
            images: { some: { status: "READY" as const } },
        },
    };
}

const VARIANT_SELECT = {
    id: true,
    priceAmount: true,
    product: {
        select: {
            title: true,
            slug: true,
            vendor: { select: { id: true, slug: true, shopName: true, currency: true } },
            images: {
                where: { status: "READY" as const },
                orderBy: { position: "asc" as const },
                take: 1,
                select: { objectPath: true },
            },
        },
    },
    values: {
        select: {
            option: { select: { name: true, position: true } },
            optionValue: { select: { label: true } },
        },
    },
};

export async function readCart(
    prisma: PrismaClient,
    userId: string,
): Promise<{ currency: string; lines: ICartLine[] } | null> {
    const cart = await prisma.cart.findUnique({
        where: { userId },
        select: {
            currency: true,
            items: {
                orderBy: { id: "asc" },
                select: { quantity: true, variant: { select: VARIANT_SELECT } },
            },
        },
    });
    if (!cart) {
        return null;
    }

    return {
        currency: cart.currency,
        lines: cart.items.map((item) => ({
            variantId: item.variant.id,
            quantity: item.quantity,
            unitAmount: item.variant.priceAmount,
            productTitle: item.variant.product.title,
            productSlug: item.variant.product.slug,
            imagePath: item.variant.product.images[0]?.objectPath ?? "",
            shopSlug: item.variant.product.vendor.slug,
            shopName: item.variant.product.vendor.shopName,
            vendorId: item.variant.product.vendor.id,
            optionValues: [...item.variant.values]
                .sort((a, b) => a.option.position - b.option.position)
                .map((v) => ({ optionName: v.option.name, valueLabel: v.optionValue.label })),
        })),
    };
}

export interface IAddCartItem {
    userId: string;
    variantId: string;
    quantity: number;
    /**
     * Le PLAFOND de la quantité stockée, passé par l'appelant. `MAX_CART_QUANTITY` vit
     * dans `@clemperl/domain`, que ce paquet ne peut pas importer sans fermer un cycle :
     * il voyage donc en paramètre plutôt que d'être recopié ici, ce qui en ferait une
     * seconde vérité.
     */
    maxQuantity: number;
}

// Une SEULE tentative. L'enveloppe au-dessous rejoue sur collision d'unicité.
async function addCartItemOnce(prisma: PrismaClient, input: IAddCartItem): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const variant = await tx.productVariant.findFirst({
            where: eligibleVariantWhere(input.variantId),
            select: { id: true, product: { select: { vendor: { select: { currency: true } } } } },
        });
        if (!variant) {
            throw new Error(ERROR_CART_ITEM_INELIGIBLE);
        }
        const shopCurrency = variant.product.vendor.currency as string;

        const cart = await tx.cart.upsert({
            where: { userId: input.userId },
            create: { userId: input.userId, currency: shopCurrency as never },
            update: {},
            select: { id: true, currency: true },
        });
        if (cart.currency !== shopCurrency) {
            throw new Error(ERROR_CART_CURRENCY_MISMATCH);
        }

        // `upsert` plutôt que `create` : l'index unique garantit une ligne par article, et
        // le second ajout du même article incrémente au lieu d'échouer.
        await tx.cartItem.upsert({
            where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
            create: { cartId: cart.id, variantId: input.variantId, quantity: input.quantity },
            update: { quantity: { increment: input.quantity } },
        });

        // Le plafond s'applique APRÈS l'incrément, et sur la valeur stockée. `boundQuantity`
        // borne le DELTA que reçoit cette fonction, jamais le total qu'elle accumule : seule
        // une écriture qui relit la ligne peut tenir le plafond, et aucun appelant ne le
        // peut à sa place. Un `updateMany` conditionnel plutôt qu'un calcul en mémoire,
        // parce qu'il est idempotent : deux incréments concurrents qui dépassent sont tous
        // deux ramenés, quel que soit leur ordre d'arrivée.
        await tx.cartItem.updateMany({
            where: {
                cartId: cart.id,
                variantId: input.variantId,
                quantity: { gt: input.maxQuantity },
            },
            data: { quantity: input.maxQuantity },
        });
    });
}

export async function addCartItem(prisma: PrismaClient, input: IAddCartItem): Promise<void> {
    // Le PLANCHER est une invariante de la table, pas une politique : une quantité nulle ou
    // négative n'a aucun sens stocké. `mergeLocalCart` transmet ce qui vient d'un panier
    // local, que le commentaire en tête de ce fichier qualifie explicitement de non fiable.
    // Une quantité négative qui passerait ici traverserait `sumLines` sans bruit, et
    // `placeOrders` la comparerait à un `expectedTotal` tout aussi négatif.
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
        throw new Error(ERROR_CART_QUANTITY_INVALID);
    }
    if (!Number.isSafeInteger(input.maxQuantity) || input.maxQuantity <= 0) {
        throw new Error(ERROR_CART_QUANTITY_INVALID);
    }

    try {
        await addCartItemOnce(prisma, input);
    } catch (error) {
        // Deux ajouts simultanés sur un panier qui n'existe pas ENCORE : les deux `upsert`
        // tentent la création, et le perdant reçoit un P2002. Ce n'est pas un refus, c'est
        // une course, et la seconde tentative trouve le panier que l'autre vient de créer.
        // Un double-clic sur « Ajouter au panier » suffit à la produire, donc elle n'a rien
        // d'exotique.
        //
        // Une seule reprise, et non une boucle : la course ne peut se produire qu'à la
        // création du panier, et après la reprise ce panier existe.
        if (!isUniqueViolation(error)) {
            throw error;
        }
        await addCartItemOnce(prisma, input);
    }
}

export interface ISetCartItemQuantity {
    userId: string;
    variantId: string;
    /** Zéro ou moins retire la ligne. Au-delà, la quantité doit être un entier lisible. */
    quantity: number;
    /** Voir `IAddCartItem.maxQuantity` : le plafond vient de l'appelant. */
    maxQuantity: number;
}

export async function setCartItemQuantity(
    prisma: PrismaClient,
    input: ISetCartItemQuantity,
): Promise<void> {
    // Les deux chemins d'écriture d'une quantité portent la MÊME garde. Une borne tenue
    // par un seul d'entre eux n'est pas une invariante de la table : c'est une politique
    // qu'un appelant contourne en changeant de fonction.
    if (!Number.isSafeInteger(input.quantity)) {
        throw new Error(ERROR_CART_QUANTITY_INVALID);
    }
    if (!Number.isSafeInteger(input.maxQuantity) || input.maxQuantity <= 0) {
        throw new Error(ERROR_CART_QUANTITY_INVALID);
    }
    const quantity = Math.min(input.quantity, input.maxQuantity);
    await prisma.$transaction(async (tx) => {
        const cart = await tx.cart.findUnique({
            where: { userId: input.userId },
            select: { id: true },
        });
        if (!cart) {
            return;
        }

        if (quantity <= 0) {
            await tx.cartItem.deleteMany({
                where: { cartId: cart.id, variantId: input.variantId },
            });
        } else {
            await tx.cartItem.updateMany({
                where: { cartId: cart.id, variantId: input.variantId },
                data: { quantity },
            });
        }

        // Le panier vide est SUPPRIMÉ, et c'est ce qui libère sa devise. Le garder avec
        // zéro ligne l'enfermerait dans la devise de son premier achat.
        const remaining = await tx.cartItem.count({ where: { cartId: cart.id } });
        if (remaining === 0) {
            await tx.cart.delete({ where: { id: cart.id } });
        }
    });
}

export async function mergeLocalCart(
    prisma: PrismaClient,
    input: {
        userId: string;
        items: readonly { variantId: string; quantity: number }[];
        /** Voir `IAddCartItem.maxQuantity` : le plafond vient de l'appelant. */
        maxQuantity: number;
    },
): Promise<{ rejected: { variantId: string; reason: string }[] }> {
    const rejected: { variantId: string; reason: string }[] = [];
    if (input.items.length === 0) {
        return { rejected };
    }

    for (const item of input.items) {
        // La quantité se valide AVANT le retrait. Le retrait est destructif et l'ajout qui
        // le suit peut être refusé : une quantité illisible dans le panier local ferait
        // alors disparaître une ligne que le panier serveur portait légitimement, et
        // l'acheteur ne lirait qu'un « refusé » sur cette ligne.
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
            rejected.push({ variantId: item.variantId, reason: CART_REJECTION.quantity });
            continue;
        }

        try {
            // La quantité du LOCAL gagne : c'est ce que l'acheteur vient de manipuler.
            await setCartItemQuantity(prisma, {
                userId: input.userId,
                variantId: item.variantId,
                quantity: 0,
                maxQuantity: input.maxQuantity,
            });
            await addCartItem(prisma, {
                userId: input.userId,
                variantId: item.variantId,
                quantity: item.quantity,
                maxQuantity: input.maxQuantity,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (message === ERROR_CART_CURRENCY_MISMATCH) {
                rejected.push({ variantId: item.variantId, reason: CART_REJECTION.currency });
            } else if (message === ERROR_CART_ITEM_INELIGIBLE) {
                rejected.push({ variantId: item.variantId, reason: CART_REJECTION.ineligible });
            } else if (message === ERROR_CART_QUANTITY_INVALID) {
                // Une quantité illisible vient d'un panier local bricolé, pas d'une panne.
                // La ligne est écartée et nommée, comme un article inéligible, plutôt que
                // de faire échouer toute la remontée.
                rejected.push({ variantId: item.variantId, reason: CART_REJECTION.quantity });
            } else {
                // Une panne n'est pas un refus. La dire « indisponible » mentirait à
                // l'acheteur sur une situation qui se répare toute seule, et lui ferait
                // croire définitif ce qui est passager. On laisse remonter : l'appelant
                // garde alors le panier local intact, et la remontée se retentera.
                throw error;
            }
        }
    }

    return { rejected };
}
