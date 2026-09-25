"use server";

import {
    ERROR_NO_READY_IMAGE,
    ERROR_PRODUCT_SLUG_TAKEN,
    prisma,
    saveProduct,
    setProductStatus,
} from "@clemperl/db";
import {
    buildVariantMatrix,
    parsePrice,
    productDetailsSchema,
    productOptionsSchema,
    slugifyProductTitle,
} from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { revalidatePath } from "next/cache";
import { requireVendorMembership } from "../../../lib/session";
import {
    INITIAL_PUBLISH_STATE,
    type IProductFormState,
    type IPublishState,
} from "../types/product-form-state.interface";

// Les axes arrivent en deux champs parallèles répétés, `optionName` et `optionValues` :
// un formulaire HTML n'envoie pas de structure, il envoie des paires. C'est ici qu'elles
// redeviennent une liste.
function readOptions(form: FormData): { name: string; values: string[] }[] {
    const names = form.getAll("optionName").map(String);
    const raw = form.getAll("optionValues").map(String);

    return names
        .map((name, index) => ({
            name: name.trim(),
            values: (raw[index] ?? "")
                .split(",")
                .map((value) => value.trim())
                .filter((value) => value.length > 0),
        }))
        // Une ligne entièrement vide n'est pas une saisie : elle disparaît, sinon le
        // vendeur ne pourrait plus enregistrer après avoir cliqué « Ajouter un axe ».
        //
        // Un axe sans NOM mais avec des valeurs est une saisie INCOMPLÈTE : il passe à
        // la validation, qui le refuse. Le jeter ici ferait une grille serveur plus
        // courte que celle affichée, et les prix indexés par position se décaleraient —
        // sans erreur, et sans que rien ne le montre.
        .filter((option) => option.name.length > 0 || option.values.length > 0);
}

export async function saveProductAction(
    _previous: IProductFormState,
    form: FormData,
): Promise<IProductFormState> {
    const { vendor } = await requireVendorMembership();
    if (!vendor.currency) {
        return { message: [messages.errors.currencyMissing], saved: false };
    }

    const productId = String(form.get("productId") ?? "");
    const details = productDetailsSchema.safeParse({
        title: form.get("title"),
        description: form.get("description"),
    });
    const options = productOptionsSchema.safeParse(readOptions(form));
    if (!details.success || !options.success) {
        return { message: [messages.errors.invalid], saved: false };
    }

    // Les prix arrivent sous `price:<position>`. La position et non la combinaison : une
    // clé de combinaison porte des caractères de contrôle, qu'un nom de champ multipart
    // ne peut pas transporter.
    const prices: Record<number, number> = {};
    try {
        for (const [field, value] of form.entries()) {
            if (!field.startsWith("price:")) continue;
            const position = Number(field.slice("price:".length));
            if (!Number.isInteger(position)) continue;
            prices[position] = parsePrice(String(value), vendor.currency);
        }
    } catch {
        return { message: [messages.errors.priceInvalid], saved: false };
    }

    // La grille est recalculée SERVEUR à partir des axes soumis : ce que le navigateur a
    // affiché n'engage personne. La fonction étant pure et déterministe, les positions
    // qu'elle attribue ici sont celles que le formulaire a rendues.
    const shape = buildVariantMatrix(options.data, [], 0);

    // CHAQUE position doit porter son prix. Sans cette exigence, une requête à laquelle
    // il manque un champ voit sa variante chiffrée à zéro sans que rien ne le signale —
    // et une action serveur est une route publique, appelable sans le formulaire.
    if (shape.some((variant) => prices[variant.position] === undefined)) {
        return { message: [messages.errors.priceMissing], saved: false };
    }

    const grid = shape.map((variant) => ({
        selections: variant.selections,
        priceAmount: prices[variant.position] as number,
        position: variant.position,
    }));

    try {
        // `productId` vient du CLIENT. Le dépôt filtre sur `(id, vendorId)` : sans cela,
        // un vendeur corrige le produit d'un autre en changeant un chiffre dans l'URL.
        await saveProduct(prisma, {
            productId,
            vendorId: vendor.id,
            title: details.data.title,
            // Le slug suit le titre tant que le produit n'a jamais été publié. Le dépôt
            // l'ignore après la première publication — c'est lui qui connaît cette date.
            slug: slugifyProductTitle(details.data.title),
            description: details.data.description,
            options: options.data,
            variants: grid,
        });
    } catch (error) {
        console.error("saveProductAction", error);
        const taken = error instanceof Error && error.message === ERROR_PRODUCT_SLUG_TAKEN;
        return {
            message: [taken ? messages.errors.slugTaken : messages.errors.failed],
            saved: false,
        };
    }

    revalidatePath(`/products/${productId}`);
    return { message: [], saved: true };
}

// Rend un ÉTAT, et non `void`. Le dépôt refuse de publier sans photo prête — c'est la
// garantie sur laquelle T2d s'appuiera pour ne jamais rencontrer de fiche sans image —
// mais une action qui ne rend rien ne peut pas le dire : le vendeur cliquait « Publier »,
// la page se re-rendait à l'identique, et RIEN n'apparaissait. Un bouton qui ne fait rien
// sans expliquer pourquoi est indiscernable d'une panne.
export async function toggleProductStatus(
    _state: IPublishState,
    form: FormData,
): Promise<IPublishState> {
    const { vendor } = await requireVendorMembership();
    const productId = String(form.get("productId") ?? "");

    try {
        await setProductStatus(prisma, {
            productId,
            vendorId: vendor.id,
            publish: form.get("publish") === "1",
        });
    } catch (error) {
        console.error("toggleProductStatus", error);
        const sansPhoto = error instanceof Error && error.message === ERROR_NO_READY_IMAGE;
        revalidatePath(`/products/${productId}`);
        return {
            error: sansPhoto ? messages.errors.publishNeedsImages : messages.errors.failed,
        };
    }

    revalidatePath(`/products/${productId}`);
    return INITIAL_PUBLISH_STATE;
}
