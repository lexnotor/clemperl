import { prisma, readPublishedShop, searchPublishedProducts } from "@clemperl/db";
import {
    CATALOG_PAGE_SIZE,
    catalogOffset,
    formatPrice,
    readCatalogFilters,
} from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { ProductCard } from "../../catalog/components/product-card";

export const dynamic = "force-dynamic";

export default async function ShopPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string; shop: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
    const { locale, shop: shopSlug } = await params;
    const t = await getTranslations("catalog");

    const shop = await readPublishedShop(prisma, { shopSlug });
    if (!shop) {
        notFound();
    }

    // La vitrine ne respecte PAS le cookie de devise : un produit s'affiche toujours dans la
    // devise de sa boutique. Borner la vitrine ferait disparaître les produits de la
    // boutique qu'on est précisément venu voir.
    //
    // Le filtre par boutique part à la REQUÊTE, pas après coup : filtrer en mémoire la page
    // rendue tronquerait la vitrine d'une boutique de plus d'une page, en silence.
    const filters = readCatalogFilters(await searchParams);
    const { rows } = await searchPublishedProducts(prisma, {
        search: filters.search,
        category: filters.category,
        sort: filters.sort,
        currency: shop.currency,
        shopSlug,
        limit: CATALOG_PAGE_SIZE,
        offset: catalogOffset(filters.page),
    });

    return (
        <main className="mx-auto max-w-6xl px-6 py-16">
            <h1 className="font-titre text-4xl tracking-tight">{shop.shopName}</h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muet">
                {shop.shopDescription}
            </p>

            <h2 className="mt-16 text-sm text-muet">{t("shopProducts")}</h2>
            <ul className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-4">
                {rows.map((row) => (
                    <li key={row.id}>
                        <ProductCard
                            shopSlug={row.shopSlug}
                            productSlug={row.slug}
                            title={row.title}
                            shopName={row.shopName}
                            imagePath={row.imagePath}
                            price={formatPrice(row.minPriceAmount, row.currency as never, locale)}
                        />
                    </li>
                ))}
            </ul>
        </main>
    );
}
