import messages from "@clemperl/i18n/messages/vendor/fr.json";
import type { JSX } from "react";
import { requireVendorMembership } from "../../../lib/session";
import { NewCollectionForm } from "./new-collection-form";

export const dynamic = "force-dynamic";

export default async function NewCollectionPage(): Promise<JSX.Element> {
    // Pas de contrôle de devise ici, contrairement aux produits : une collection ne porte
    // aucun prix, elle range des articles qui en ont déjà un.
    await requireVendorMembership();

    return (
        <main className="mx-auto max-w-2xl px-6 py-16">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">
                {messages.collections.createTitle}
            </h1>
            <NewCollectionForm />
        </main>
    );
}
