"use server";

import { auth } from "@clemperl/auth";
import { ERROR_CART_CURRENCY_MISMATCH, addCartItem, prisma } from "@clemperl/db";
import { MAX_CART_QUANTITY } from "@clemperl/domain";
import { headers } from "next/headers";

// Une action serveur est une ROUTE PUBLIQUE : la session se relit ICI, la page qui a rendu
// le bouton ne la protège pas. C'est la règle écrite en T1a et redite à chaque tranche.
//
// On ne passe PAS par `requireVerifiedSession`, qui redirige : ici une redirection n'a pas
// de sens, le bouton doit rendre un refus que le composant affiche.
export async function addToServerCart(
    variantId: string,
): Promise<{ ok: boolean; reason?: "currency" }> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        return { ok: false };
    }

    try {
        await addCartItem(prisma, {
            userId: session.user.id,
            variantId,
            quantity: 1,
            // Le plafond vient de l'appelant : `packages/db` ne peut pas importer
            // `packages/domain`, qui dépend déjà de lui.
            maxQuantity: MAX_CART_QUANTITY,
        });
        return { ok: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "";
        // La devise est le SEUL refus qu'on explique : les autres viennent d'un article
        // bricolé, et nommer la raison renseignerait sur ce que la base contient.
        return message === ERROR_CART_CURRENCY_MISMATCH
            ? { ok: false, reason: "currency" }
            : { ok: false };
    }
}
