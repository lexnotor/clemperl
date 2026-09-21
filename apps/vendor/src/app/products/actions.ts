"use server";

import {
    ERROR_CURRENCY_CHANGED,
    ERROR_PRODUCT_SLUG_TAKEN,
    createProduct,
    prisma,
} from "@clemperl/db";
import { parsePrice, productDetailsSchema, slugifyProductTitle } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { redirect } from "next/navigation";
import { requireVendorMembership } from "../../lib/session";
import type { IProductFormState } from "./types/product-form-state.interface";

export async function createProductAction(
    _previous: IProductFormState,
    form: FormData,
): Promise<IProductFormState> {
    // La garde est rappelée ICI : une action serveur est une route publique, et la page
    // qui l'a rendue ne la protège pas.
    const { vendor } = await requireVendorMembership();

    // On ne fixe pas un prix avant d'avoir dit en quoi. Le contrôle est dans l'action et
    // pas seulement dans la page : l'action est appelable directement.
    if (!vendor.currency) {
        return { message: [messages.errors.currencyMissing], saved: false };
    }

    const parsed = productDetailsSchema.safeParse({
        title: form.get("title"),
        description: form.get("description"),
    });
    if (!parsed.success) {
        return { message: [messages.errors.invalid], saved: false };
    }

    let priceAmount: number;
    try {
        priceAmount = parsePrice(String(form.get("price") ?? ""), vendor.currency);
    } catch {
        return { message: [messages.errors.priceInvalid], saved: false };
    }

    let created: { id: string };
    try {
        created = await createProduct(prisma, {
            vendorId: vendor.id,
            slug: slugifyProductTitle(parsed.data.title),
            title: parsed.data.title,
            description: parsed.data.description,
            priceAmount,
            // La devise sous laquelle `parsePrice` vient de convertir. Le dépôt la relit
            // après avoir pris son verrou et refuse si elle a changé entre-temps.
            expectedCurrency: vendor.currency,
        });
    } catch (error) {
        console.error("createProductAction", error);
        // Un titre déjà pris n'est pas une panne : « réessayez » enverrait le vendeur
        // reproduire exactement le même slug.
        const code = error instanceof Error ? error.message : "";
        const raison =
            code === ERROR_PRODUCT_SLUG_TAKEN
                ? messages.errors.slugTaken
                : code === ERROR_CURRENCY_CHANGED
                  ? messages.errors.currencyChanged
                  : messages.errors.failed;
        return { message: [raison], saved: false };
    }

    // `redirect` lève pour interrompre le rendu : il doit rester HORS du `try`, sinon le
    // `catch` l'avale et l'utilisateur lit « l'enregistrement a échoué » sur une
    // création réussie.
    redirect(`/products/${created.id}`);
}
