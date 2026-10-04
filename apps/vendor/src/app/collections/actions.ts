"use server";

import { createCollection, prisma } from "@clemperl/db";
import { collectionDetailsSchema, slugifyCollectionTitle } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { redirect } from "next/navigation";
import { requireVendorMembership } from "../../lib/session";
import type { ICollectionFormState } from "./types/collection-form-state.interface";

export async function createCollectionAction(
    _previous: ICollectionFormState,
    form: FormData,
): Promise<ICollectionFormState> {
    // La garde est rappelée ICI : une action serveur est une route publique, et la page
    // qui l'a rendue ne la protège pas.
    const { vendor } = await requireVendorMembership();

    const description = String(form.get("description") ?? "").trim();
    const parsed = collectionDetailsSchema.safeParse({
        title: form.get("title"),
        ...(description === "" ? {} : { description }),
    });
    if (!parsed.success) {
        return { message: [messages.errors.invalid], saved: false };
    }

    let created: { id: string };
    try {
        created = await createCollection(prisma, {
            vendorId: vendor.id,
            slug: slugifyCollectionTitle(parsed.data.title),
            title: parsed.data.title,
            ...(parsed.data.description === undefined
                ? {}
                : { description: parsed.data.description }),
        });
    } catch (error) {
        console.error("createCollectionAction", error);
        // Un titre déjà pris n'est pas une panne : « réessayez » enverrait le vendeur
        // reproduire exactement le même slug. L'unicité est portée par la base, sur
        // `(vendor_id, slug)`.
        const code = error instanceof Error ? error.message : "";
        const raison = code.includes("collections_vendor_id_slug_key")
            ? messages.errors.collectionSlugTaken
            : messages.errors.failed;
        return { message: [raison], saved: false };
    }

    // `redirect` lève pour interrompre le rendu : il reste HORS du `try`, sinon le
    // `catch` l'avale et le vendeur lit « l'enregistrement a échoué » sur une création
    // réussie.
    redirect(`/collections/${created.id}`);
}
