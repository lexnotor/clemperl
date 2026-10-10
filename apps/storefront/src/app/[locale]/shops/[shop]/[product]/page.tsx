import { auth } from "@clemperl/auth";
import { prisma, readPublishedProduct } from "@clemperl/db";
import { derivativePath, formatPrice } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { VariantSelector } from "./components/variant-selector";

export const dynamic = "force-dynamic";

export default async function ProductPage({
    params,
}: {
    params: Promise<{ locale: string; shop: string; product: string }>;
}): Promise<JSX.Element> {
    const { locale, shop, product: productSlug } = await params;
    const t = await getTranslations("catalog");
    const tCart = await getTranslations("cart");

    // L'ajout va au SERVEUR pour un acheteur connecté, au navigateur sinon. Deux sources
    // qui se croiraient toutes deux à jour est exactement ce qu'on évite : la session se
    // lit donc ici, et le bouton sait d'emblée où écrire.
    const session = await auth.api.getSession({ headers: await headers() });

    // Le filtre porte sur la BOUTIQUE autant que sur le produit : le slug produit n'est
    // unique que par boutique, donc `/shops/A/<produit-de-B>` doit rendre 404 et non le
    // produit de B sous l'identité de A.
    const product = await readPublishedProduct(prisma, { shopSlug: shop, productSlug });
    if (!product) {
        notFound();
    }

    // Formaté ICI, côté serveur, et UNE ENTRÉE PAR DÉCLINAISON. Une offre unique pour
    // toute la fiche annoncerait le prix plancher quelle que soit la sélection, et le
    // bouton ajouterait au panier un article que l'acheteur n'a pas choisi.
    //
    // Le composant client ne reçoit que des chaînes prêtes : il ne connaît ni devise ni
    // exposant. `formatPrice` tire `@clemperl/core`, donc nodemailer, donc `node:net`, que
    // Turbopack refuse d'assembler dans un paquet navigateur.
    const offers = Object.fromEntries(
        product.variants.map((variant) => [
            variant.combinationKey,
            {
                price: formatPrice(variant.priceAmount, product.currency as never, locale),
                variantId: variant.id,
            },
        ]),
    );

    return (
        <main className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid gap-12 md:grid-cols-2">
                <div className="flex flex-col gap-4">
                    {product.images.map((image) => (
                        <img
                            key={image.objectPath}
                            data-testid="vignette"
                            src={`/api/media/${derivativePath(image.objectPath, 800)}`}
                            alt={image.altText ?? ""}
                            className="w-full object-cover"
                        />
                    ))}
                </div>

                <div>
                    <h1 className="font-titre text-4xl tracking-tight">{product.title}</h1>
                    <Link
                        href={`/shops/${product.shopSlug}`}
                        className="mt-2 inline-block text-sm text-muet underline"
                    >
                        {product.shopName}
                    </Link>
                    <p className="mt-8 text-sm leading-relaxed">{product.description}</p>

                    <VariantSelector
                        options={product.options}
                        offers={offers}
                        currency={product.currency}
                        signedIn={session?.user !== undefined}
                        cartLabels={{
                            add: tCart("add"),
                            added: tCart("added"),
                            currencyRefused: tCart("currencyRefused"),
                            failed: tCart("failed"),
                        }}
                        emptyLabel={t("noVariantChosen")}
                    />
                </div>
            </div>
        </main>
    );
}
