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
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVerifiedSession } from "../../../lib/session";

export interface ICheckoutState {
    error?: string;
    /**
     * Ce que l'acheteur avait saisi. React 19 vide les champs non contrôlés d'un
     * formulaire dès qu'une action rend la main sans lever, et tous les refus d'ici en
     * rendent une : sans ces valeurs, l'adresse entière est à retaper après chaque
     * message d'erreur.
     */
    values?: Record<string, string>;
}

export async function submitCheckout(
    _state: ICheckoutState,
    form: FormData,
): Promise<ICheckoutState> {
    const { user } = await requireVerifiedSession("/checkout");

    // Relu une seule fois, et renvoyé avec chaque refus pour que le formulaire se
    // reconstitue.
    const submitted: Record<string, string> = {};
    for (const field of ["name", "phone", "line", "city", "country"]) {
        submitted[field] = String(form.get(field) ?? "");
    }
    for (const [key, value] of form.entries()) {
        if (key.startsWith("note:") && typeof value === "string") {
            submitted[key] = value;
        }
    }

    const parse = checkoutSchema.safeParse({
        name: submitted["name"],
        phone: submitted["phone"],
        line: submitted["line"],
        city: submitted["city"],
        country: submitted["country"],
    });
    if (!parse.success) {
        return { error: "invalid", values: submitted };
    }

    const cart = await readCart(prisma, user.id);
    if (!cart || cart.lines.length === 0) {
        return { error: "cartEmpty", values: submitted };
    }

    // Les libellés se construisent ICI, parce que `variantLabel` est pur et que le dépôt
    // ne peut pas importer le domaine, qui dépend déjà de `@clemperl/db`.
    const lines = cart.lines.map((line) => ({
        variantId: line.variantId,
        label: variantLabel(line.optionValues),
    }));

    // Un mot par boutique : les champs du formulaire s'appellent `note:<slug>`.
    const notes: Record<string, string> = {};
    for (const [key, value] of Object.entries(submitted)) {
        if (key.startsWith("note:") && value.trim() !== "") {
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

        // La page est REVALIDÉE avant de rendre le refus. `expectedTotal` est un champ
        // caché rendu par le composant serveur : sans revalidation il reste celui qui
        // vient d'être rejeté, chaque envoi suivant reçoit le même refus, et l'acheteur
        // n'en sort que par un rechargement manuel.
        revalidatePath("/[locale]/checkout", "page");

        if (message === ERROR_TOTAL_CHANGED) {
            return { error: "totalChanged", values: submitted };
        }
        if (message === ERROR_ITEM_INELIGIBLE) {
            return { error: "itemUnavailable", values: submitted };
        }
        if (message === ERROR_CART_EMPTY) {
            return { error: "cartEmpty", values: submitted };
        }
        throw error;
    }

    // HORS du `try`. `redirect` lève pour fonctionner : à l'intérieur, le `catch`
    // avalerait la redirection et l'acheteur lirait « échec » sur une commande réussie.
    redirect(`/orders/${references[0] ?? ""}`);
}
