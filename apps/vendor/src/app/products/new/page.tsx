import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { redirect } from "next/navigation";
import type { JSX } from "react";
import { requireVendorMembership } from "../../../lib/session";
import { NewProductForm } from "./new-product-form";

export const dynamic = "force-dynamic";

export default async function NewProductPage(): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();
    if (!vendor.currency) {
        redirect("/shop");
    }

    return (
        <main className="mx-auto max-w-2xl px-6 py-16">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">
                {messages.products.createTitle}
            </h1>
            <NewProductForm />
        </main>
    );
}
