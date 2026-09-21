"use server";

import { prisma, updateShopProfile } from "@clemperl/db";
import { shopProfileSchema } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { revalidatePath } from "next/cache";
import { requireVendorMembership } from "../../lib/session";
import type { IShopFormState } from "./types/shop-form-state.interface";

export async function saveShopProfile(
    _previous: IShopFormState,
    form: FormData,
): Promise<IShopFormState> {
    // La garde est rappelée ICI : une action serveur est une route publique, et la page
    // qui l'a rendue ne la protège pas. C'est aussi d'ici que vient le `vendorId` — le
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
