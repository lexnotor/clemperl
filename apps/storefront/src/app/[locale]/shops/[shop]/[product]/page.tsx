import { prisma, readPublishedProduct } from "@clemperl/db";
import { derivativePath, formatPrice } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
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

    // Le filtre porte sur la BOUTIQUE autant que sur le produit : le slug produit n'est
    // unique que par boutique, donc `/shops/A/<produit-de-B>` doit rendre 404 et non le
    // produit de B sous l'identité de A.
    const product = await readPublishedProduct(prisma, { shopSlug: shop, productSlug });
    if (!product) {
        notFound();
    }

    // Formaté ICI, côté serveur, et UNE ENTRÉE PAR DÉCLINAISON. Le lien de contact était
    // calculé une seule fois, hors sélection : il annonçait le nom de l'axe au lieu de la
    // valeur choisie, et le prix plancher au lieu du prix de cette déclinaison. Un visiteur
    // qui choisissait la plus chère envoyait au vendeur un courriel annonçant la moins
    // chère, donc un prix faux dans un message qui part chez quelqu'un.
    //
    // Le composant client ne reçoit que des chaînes prêtes : il ne connaît ni devise, ni
    // exposant, ni gabarit de message.
    const libelleParValeur = new Map(
        product.options.flatMap((option) =>
            option.values.map((valeur) => [valeur.id, `${option.name} : ${valeur.label}`] as const),
        ),
    );

    // Les identifiants de valeur de chaque déclinaison, dans l'ordre où la clé les range,
    // pour que le libellé lu par le vendeur suive la combinaison et non l'ordre des axes.
    const valeursParCle = new Map(
        product.variants.map((variant) => [
            variant.combinationKey,
            variant.combinationKey === "" ? [] : variant.combinationKey.split("|"),
        ]),
    );

    const offers = Object.fromEntries(
        product.variants.map((variant) => {
            const prix = formatPrice(variant.priceAmount, product.currency as never, locale);
            const libelle = (valeursParCle.get(variant.combinationKey) ?? [])
                .map((id) => libelleParValeur.get(id) ?? id)
                .join(", ");
            const sujet = t("contactSubject", { title: product.title });
            const corps = t("contactBody", {
                title: product.title,
                variant: libelle === "" ? product.title : libelle,
                price: prix,
            });

            return [
                variant.combinationKey,
                {
                    price: prix,
                    href: `mailto:${product.shopContactEmail}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`,
                },
            ];
        }),
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
                        contactLabel={t("contactShop")}
                        emptyLabel={t("noVariantChosen")}
                    />
                </div>
            </div>
        </main>
    );
}
