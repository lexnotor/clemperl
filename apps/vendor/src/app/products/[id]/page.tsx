import { prisma, readProductForVendor } from "@clemperl/db";
import { CURRENCY_EXPONENT } from "@clemperl/core";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";
import { requireVendorMembership } from "../../../lib/session";
import { toggleProductStatus } from "./actions";
import { ProductForm } from "./product-form";

export const dynamic = "force-dynamic";

const t = messages.products;

export default async function ProductPage({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();

    // La devise est copiée dans une constante : la restriction de type d'un accès à une
    // propriété ne survit pas à une fermeture, et elle est passée au composant.
    const currency = vendor.currency;
    if (!currency) {
        redirect("/shop");
    }

    const { id } = await params;
    const product = await readProductForVendor(prisma, { productId: id, vendorId: vendor.id });

    // `notFound()` et non une redirection : ne pas confirmer à un intrus que cet
    // identifiant existe ailleurs.
    if (!product) {
        notFound();
    }

    const options = product.options.map((option) => ({
        name: option.name,
        values: option.values.map((value) => value.label),
    }));
    const variants = product.variants.map((variant) => ({
        selections: Object.fromEntries(
            variant.values.map((value) => [value.option.name, value.optionValue.label]),
        ),
        priceAmount: variant.priceAmount,
    }));

    return (
        <main className="mx-auto max-w-2xl px-6 py-16">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">{product.title}</h1>
            <p className="mt-2 text-sm text-muet">{t[product.status]}</p>

            <ProductForm
                productId={product.id}
                title={product.title}
                description={product.description}
                exponent={CURRENCY_EXPONENT[currency]}
                options={options}
                variants={variants}
            />

            {/* Publier n'est pas « enregistrer » : c'est un geste distinct, donc un
                formulaire distinct — les imbriquer produirait un HTML invalide. */}
            <form action={toggleProductStatus} className="mt-12">
                <input type="hidden" name="productId" value={product.id} />
                <input
                    type="hidden"
                    name="publish"
                    value={product.status === "PUBLISHED" ? "0" : "1"}
                />
                <button type="submit" className="text-sm underline">
                    {product.status === "PUBLISHED" ? t.unpublish : t.publish}
                </button>
            </form>
        </main>
    );
}
