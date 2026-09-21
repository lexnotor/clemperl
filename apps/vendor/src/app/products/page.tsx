import { listProductsForVendor, prisma } from "@clemperl/db";
import { formatPrice } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { JSX } from "react";
import { requireVendorMembership } from "../../lib/session";

// Cette page lit la session : elle ne peut pas être pré-rendue au build.
export const dynamic = "force-dynamic";

const t = messages.products;

export default async function ProductsPage(): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();

    // Un prix sans devise n'est pas un prix. On renvoie là où la devise se choisit
    // plutôt que d'afficher une liste que le vendeur ne pourra pas alimenter.
    //
    // La devise est copiée dans une CONSTANTE locale : la restriction de type d'un accès
    // à une propriété est abandonnée dès qu'on entre dans une fermeture, et `formatPrice`
    // est appelée dans un `map`.
    const currency = vendor.currency;
    if (!currency) {
        redirect("/shop");
    }

    const products = await listProductsForVendor(prisma, vendor.id);

    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <div className="flex items-baseline justify-between gap-6">
                <h1 className="font-titre text-4xl leading-tight tracking-tight">{t.title}</h1>
                <Link href="/products/new" className="text-sm underline">
                    {t.create}
                </Link>
            </div>

            {products.length === 0 ? (
                <p className="mt-12 text-sm text-muet">{t.empty}</p>
            ) : (
                <ul className="mt-12 flex flex-col">
                    {products.map((product) => {
                        // Une fourchette plutôt qu'un prix : un produit à variantes en a
                        // plusieurs, et n'en montrer qu'un mentirait sur les autres.
                        const prices = product.variants.map((variant) => variant.priceAmount);
                        const low = Math.min(...prices);
                        const high = Math.max(...prices);
                        return (
                            <li key={product.id} className="border-t border-bordure py-4">
                                <Link
                                    href={`/products/${product.id}`}
                                    className="flex justify-between gap-6"
                                >
                                    <span>{product.title}</span>
                                    <span className="text-sm text-muet">
                                        {low === high
                                            ? formatPrice(low, currency)
                                            : `${formatPrice(low, currency)} – ${formatPrice(high, currency)}`}
                                    </span>
                                </Link>
                                <p className="mt-1 text-xs text-muet">
                                    {t[product.status]} ·{" "}
                                    {product.variants.length === 1
                                        ? t.singleVariant
                                        : t.variantCount.replace(
                                              "{count}",
                                              String(product.variants.length),
                                          )}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}
        </main>
    );
}
