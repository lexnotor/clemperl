"use server";

import { publishRealtimeEvent } from "@clemperl/core";
import {
    ERROR_CART_EMPTY,
    ERROR_ITEM_INELIGIBLE,
    ERROR_METHOD_UNAVAILABLE,
    ERROR_TOTAL_CHANGED,
    placeOrders,
    prisma,
    readCart,
} from "@clemperl/db";
import { checkoutSchema, paymentMethodSchema, variantLabel } from "@clemperl/domain";
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
        if ((key.startsWith("note:") || key.startsWith("method:")) && typeof value === "string") {
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

    // Une méthode par boutique, validée contre l'enum ici et contre ce que la boutique
    // accepte dans `placeOrders`. Une valeur hors enum est écartée : la boutique se
    // retrouve alors sans méthode, et `placeOrders` refuse avec sa raison.
    const methods: Record<string, string> = {};
    for (const [key, value] of Object.entries(submitted)) {
        if (!key.startsWith("method:")) {
            continue;
        }
        const parsed = paymentMethodSchema.safeParse(value);
        if (parsed.success) {
            methods[key.slice("method:".length)] = parsed.data;
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
    let orderIds: string[];
    try {
        const result = await placeOrders(prisma, {
            userId: user.id,
            expectedTotal: Number(form.get("expectedTotal") ?? -1),
            shipTo,
            notes,
            methods,
            lines,
        });
        references = result.references;
        orderIds = result.orderIds;
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
        if (message === ERROR_METHOD_UNAVAILABLE) {
            return { error: "methodUnavailable", values: submitted };
        }
        if (message === ERROR_CART_EMPTY) {
            return { error: "cartEmpty", values: submitted };
        }
        throw error;
    }

    // Une commande par boutique, donc un dépôt par commande : chaque boutique est alertée de
    // la sienne. Le dépôt vient APRÈS l'écriture et AVANT `redirect`, qui lève et
    // interromprait l'action avant lui. Les dépôts partent ensemble : Redis en panne, chacun
    // attend sa borne, et l'un après l'autre ils feraient attendre l'acheteur autant de fois
    // qu'il a de boutiques dans son panier.
    await Promise.all(
        orderIds.map((orderId) => publishRealtimeEvent({ kind: "order.placed", orderId })),
    );

    // HORS du `try`. `redirect` lève pour fonctionner : à l'intérieur, le `catch`
    // avalerait la redirection et l'acheteur lirait « échec » sur une commande réussie.
    //
    // Une seule commande mène à sa page. Plusieurs mènent à la liste : montrer la première
    // et taire la seconde cacherait un paiement à faire.
    redirect(references.length === 1 ? `/orders/${references[0]}` : "/orders");
}
