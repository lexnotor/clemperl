"use server";

import {
    ERROR_CURRENCY_LOCKED,
    prisma,
    setShopCurrency,
    setShopPaymentMethods,
    updateShopProfile,
} from "@clemperl/db";
import { shopCurrencySchema, shopPaymentMethodsSchema, shopProfileSchema } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { revalidatePath } from "next/cache";
import { requireVendorMembership } from "../../lib/session";
import type { IShopFormState } from "./types/shop-form-state.interface";

export async function saveShopProfile(
    _previous: IShopFormState,
    form: FormData,
): Promise<IShopFormState> {
    // La garde est rappelée ICI : une action serveur est une route publique, et la page
    // qui l'a rendue ne la protège pas. C'est aussi d'ici que vient le `vendorId` : le
    // formulaire ne le porte pas, pour qu'aucun champ caché ne puisse le désigner.
    const { vendor } = await requireVendorMembership();

    const parsed = shopProfileSchema.safeParse({
        shopName: form.get("shopName"),
        shopDescription: form.get("shopDescription"),
        contactEmail: form.get("contactEmail"),
        contactPhone: form.get("contactPhone"),
        categories: form.getAll("categories"),
    });

    if (!parsed.success) {
        return { message: [messages.errors.invalid], saved: false };
    }

    try {
        await updateShopProfile(prisma, { vendorId: vendor.id, ...parsed.data });
    } catch {
        return { message: [messages.errors.failed], saved: false };
    }

    // `/shop` est une route statique : le chemin littéral suffit. Ce ne serait pas le cas
    // d'un segment dynamique, qui exige le MOTIF et non l'URL rendue.
    revalidatePath("/shop");
    return { message: [], saved: true };
}

// La devise a sa PROPRE action, et non un champ de plus dans `saveShopProfile` : cette
// signature-là dit « ces champs se corrigent librement », et la devise cesse de l'être
// dès qu'un produit existe. Mêler les deux ferait d'une signature claire une signature
// à conditions.
export async function saveShopCurrency(
    _previous: IShopFormState,
    form: FormData,
): Promise<IShopFormState> {
    // La garde est rappelée ICI : une action serveur est une route publique, et la page
    // qui l'a rendue ne la protège pas.
    const { vendor } = await requireVendorMembership();

    const parsed = shopCurrencySchema.safeParse({ currency: form.get("currency") });
    if (!parsed.success) {
        return { message: [messages.errors.invalid], saved: false };
    }

    try {
        await setShopCurrency(prisma, { vendorId: vendor.id, currency: parsed.data.currency });
    } catch (error) {
        // Journaliser AVANT de rendre le message localisé : un `catch` nu laisse le
        // vendeur devant « l'enregistrement a échoué » et les journaux vides, ce qui ne
        // distingue pas une panne passagère d'un défaut qui ne réussira jamais.
        console.error("saveShopCurrency", error);
        const locked = error instanceof Error && error.message === ERROR_CURRENCY_LOCKED;
        return {
            message: [locked ? messages.errors.currencyLocked : messages.errors.failed],
            saved: false,
        };
    }

    revalidatePath("/shop");
    return { message: [], saved: true };
}

// Les méthodes de paiement ont leur PROPRE action, pour la même raison que la devise : chaque
// signature dit une règle. Les champs commerciaux se corrigent librement, la devise cesse de
// l'être dès qu'un produit existe, et les méthodes se corrigent librement, y compris après la
// première vente, parce qu'une commande porte sa propre méthode, figée à la validation.
export async function saveShopPaymentMethods(
    _previous: IShopFormState,
    form: FormData,
): Promise<IShopFormState> {
    // La garde est rappelée ICI : une action serveur est une route publique, et la page
    // qui l'a rendue ne la protège pas.
    const { vendor } = await requireVendorMembership();

    const parsed = shopPaymentMethodsSchema.safeParse({
        paymentMethods: form.getAll("paymentMethods"),
    });
    if (!parsed.success) {
        return { message: [messages.errors.noPaymentMethod], saved: false };
    }

    try {
        await setShopPaymentMethods(prisma, {
            vendorId: vendor.id,
            paymentMethods: parsed.data.paymentMethods,
        });
    } catch (error) {
        console.error("saveShopPaymentMethods", error);
        return { message: [messages.errors.failed], saved: false };
    }

    revalidatePath("/shop");
    return { message: [], saved: true };
}
