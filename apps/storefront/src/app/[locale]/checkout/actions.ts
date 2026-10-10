"use server";

import {
    ERROR_CART_EMPTY,
    ERROR_ITEM_INELIGIBLE,
    ERROR_TOTAL_CHANGED,
    placeOrders,
    prisma,
    readCart,
} from "@clemperl/db";
import { checkoutSchema, variantLabel } from "@clemperl/domain";
import { redirect } from "next/navigation";
import { requireVerifiedSession } from "../../../lib/session";

export interface ICheckoutState {
    error?: string;
}

export async function submitCheckout(
    _state: ICheckoutState,
    form: FormData,
): Promise<ICheckoutState> {
    const { user } = await requireVerifiedSession("/checkout");

    const parse = checkoutSchema.safeParse({
        name: form.get("name"),
        phone: form.get("phone"),
        line: form.get("line"),
        city: form.get("city"),
        country: form.get("country"),
    });
    if (!parse.success) {
        return { error: "invalid" };
    }

    const cart = await readCart(prisma, user.id);
    if (!cart || cart.lines.length === 0) {
        return { error: "cartEmpty" };
    }

    // Les libellés se construisent ICI, parce que `variantLabel` est pur et que le dépôt
    // ne peut pas importer le domaine, qui dépend déjà de `@clemperl/db`.
    const lines = cart.lines.map((line) => ({
        variantId: line.variantId,
        label: variantLabel(line.optionValues),
    }));

    // Un mot par boutique : les champs du formulaire s'appellent `note:<slug>`.
    const notes: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
        if (key.startsWith("note:") && typeof value === "string" && value.trim() !== "") {
            notes[key.slice("note:".length)] = value.trim().slice(0, 1000);
        }
    }

    // L'adresse est recomposée CHAMP PAR CHAMP. Elle dit ce qu'est une adresse de
    // livraison, là où une destructuration laisserait traîner le champ `note` du schéma,
    // qui n'en fait pas partie.
    const shipTo = {
        name: parse.data.name,
        phone: parse.data.phone,
        line: parse.data.line,
        city: parse.data.city,
        country: parse.data.country,
    };

    let references: string[];
    try {
        const result = await placeOrders(prisma, {
            userId: user.id,
            expectedTotal: Number(form.get("expectedTotal") ?? -1),
            shipTo,
            notes,
            lines,
        });
        references = result.references;
    } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === ERROR_TOTAL_CHANGED) {
            return { error: "totalChanged" };
        }
        if (message === ERROR_ITEM_INELIGIBLE) {
            return { error: "itemUnavailable" };
        }
        if (message === ERROR_CART_EMPTY) {
            return { error: "cartEmpty" };
        }
        throw error;
    }

    // HORS du `try`. `redirect` lève pour fonctionner : à l'intérieur, le `catch`
    // avalerait la redirection et l'acheteur lirait « échec » sur une commande réussie.
    redirect(`/orders/${references[0] ?? ""}`);
}
