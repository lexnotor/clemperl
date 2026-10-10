"use server";

import { mergeLocalCart, prisma, setCartItemQuantity } from "@clemperl/db";
import { MAX_CART_QUANTITY, boundQuantity } from "@clemperl/domain";
import { revalidatePath } from "next/cache";
import { requireVerifiedSession } from "../../../lib/session";

// Chaque action rappelle la garde : une action serveur est une ROUTE PUBLIQUE, et la page
// qui a rendu le bouton ne la protège pas.
//
// `MAX_CART_QUANTITY` est passé au dépôt à chaque appel : `packages/db` ne peut pas
// importer `packages/domain`, qui dépend déjà de lui, donc le plafond voyage en paramètre
// plutôt que d'être recopié là-bas.

export async function pushLocalCart(
    items: readonly { variantId: string; quantity: number }[],
): Promise<{ rejected: { variantId: string; reason: string }[] }> {
    const { user } = await requireVerifiedSession("/cart");

    // Bornée ICI, et pas seulement dans le dépôt : la liste vient du navigateur, donc d'un
    // endroit où n'importe qui écrit ce qu'il veut. La borne du haut évite aussi qu'une
    // liste de deux cents entrées fasse deux cents transactions.
    const clean = items
        .slice(0, 100)
        .map((item) => ({ variantId: item.variantId, quantity: boundQuantity(item.quantity) }))
        .filter((item) => item.quantity > 0);

    const result = await mergeLocalCart(prisma, {
        userId: user.id,
        items: clean,
        maxQuantity: MAX_CART_QUANTITY,
    });
    revalidatePath("/cart");
    return result;
}

export async function changeQuantity(variantId: string, quantity: number): Promise<void> {
    const { user } = await requireVerifiedSession("/cart");
    await setCartItemQuantity(prisma, {
        userId: user.id,
        variantId,
        quantity: boundQuantity(quantity),
        maxQuantity: MAX_CART_QUANTITY,
    });
    revalidatePath("/cart");
}

// Retirer, c'est poser zéro : une seule écriture à relire, et le dépôt y supprime déjà le
// panier devenu vide, ce qui libère sa devise.
export async function removeLine(variantId: string): Promise<void> {
    const { user } = await requireVerifiedSession("/cart");
    await setCartItemQuantity(prisma, {
        userId: user.id,
        variantId,
        quantity: 0,
        maxQuantity: MAX_CART_QUANTITY,
    });
    revalidatePath("/cart");
}
