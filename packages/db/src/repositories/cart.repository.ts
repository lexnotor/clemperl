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

// Les raisons d'un refus sont des CLÉS de traduction : la base ne range pas du français,
// et c'est un acheteur qui les lira.
export const CART_REJECTION = {
    ineligible: "ineligible",
    currency: "currency",
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

// Une SEULE tentative. L'enveloppe au-dessous rejoue sur collision d'unicité.
async function addCartItemOnce(
    prisma: PrismaClient,
    input: { userId: string; variantId: string; quantity: number },
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const variant = await tx.productVariant.findFirst({
            where: eligibleVariantWhere(input.variantId),
            select: { id: true, product: { select: { vendor: { select: { currency: true } } } } },
        });
        if (!variant) {
            throw new Error(ERROR_CART_ITEM_INELIGIBLE);
        }
        const devise = variant.product.vendor.currency as string;

        const cart = await tx.cart.upsert({
            where: { userId: input.userId },
            create: { userId: input.userId, currency: devise as never },
            update: {},
            select: { id: true, currency: true },
        });
        if (cart.currency !== devise) {
            throw new Error(ERROR_CART_CURRENCY_MISMATCH);
        }

        // `upsert` plutôt que `create` : l'index unique garantit une ligne par article, et
        // le second ajout du même article incrémente au lieu d'échouer.
        await tx.cartItem.upsert({
            where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
            create: { cartId: cart.id, variantId: input.variantId, quantity: input.quantity },
            update: { quantity: { increment: input.quantity } },
        });
    });
}

export async function addCartItem(
    prisma: PrismaClient,
    input: { userId: string; variantId: string; quantity: number },
): Promise<void> {
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

export async function setCartItemQuantity(
    prisma: PrismaClient,
    input: { userId: string; variantId: string; quantity: number },
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const cart = await tx.cart.findUnique({
            where: { userId: input.userId },
            select: { id: true },
        });
        if (!cart) {
            return;
        }

        if (input.quantity <= 0) {
            await tx.cartItem.deleteMany({
                where: { cartId: cart.id, variantId: input.variantId },
            });
        } else {
            await tx.cartItem.updateMany({
                where: { cartId: cart.id, variantId: input.variantId },
                data: { quantity: input.quantity },
            });
        }

        // Le panier vide est SUPPRIMÉ, et c'est ce qui libère sa devise. Le garder avec
        // zéro ligne l'enfermerait dans la devise de son premier achat.
        const restants = await tx.cartItem.count({ where: { cartId: cart.id } });
        if (restants === 0) {
            await tx.cart.delete({ where: { id: cart.id } });
        }
    });
}

export async function mergeLocalCart(
    prisma: PrismaClient,
    input: { userId: string; items: readonly { variantId: string; quantity: number }[] },
): Promise<{ rejected: { variantId: string; reason: string }[] }> {
    const rejected: { variantId: string; reason: string }[] = [];
    if (input.items.length === 0) {
        return { rejected };
    }

    for (const item of input.items) {
        try {
            // La quantité du LOCAL gagne : c'est ce que l'acheteur vient de manipuler.
            await setCartItemQuantity(prisma, {
                userId: input.userId,
                variantId: item.variantId,
                quantity: 0,
            });
            await addCartItem(prisma, {
                userId: input.userId,
                variantId: item.variantId,
                quantity: item.quantity,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (message === ERROR_CART_CURRENCY_MISMATCH) {
                rejected.push({ variantId: item.variantId, reason: CART_REJECTION.currency });
            } else if (message === ERROR_CART_ITEM_INELIGIBLE) {
                rejected.push({ variantId: item.variantId, reason: CART_REJECTION.ineligible });
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
