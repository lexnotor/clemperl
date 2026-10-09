import {
    listPublishedCollections,
    prisma,
    readPublishedShop,
    searchPublishedProducts,
} from "@clemperl/db";
import {
    CATALOG_PAGE_SIZE,
    catalogOffset,
    catalogPageHref,
    readCatalogFilters,
} from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { ProductCard } from "../../catalog/components/product-card";
import { displayPrice } from "../../catalog/components/product-price";

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
    const recherche = await searchParams;
    const filters = readCatalogFilters(recherche);
    const { rows, total } = await searchPublishedProducts(prisma, {
        search: filters.search,
        category: filters.category,
        sort: filters.sort,
        currency: shop.currency,
        shopSlug,
        limit: CATALOG_PAGE_SIZE,
        offset: catalogOffset(filters.page),
    });
    const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));

    // Les collections PUBLIÉES seulement. Il n'y a pas de page d'index : la vitrine est
    // déjà l'endroit où l'on arrive, et `/shops/<shop>/collections` répond 404, ce qui est
    // correct. C'est la même mécanique de routage qui oblige à réserver ce mot dans le
    // slug d'un produit.
    const collections = await listPublishedCollections(prisma, shopSlug);

    const categories: Record<string, string> = {
        APPAREL: t("productCategory.APPAREL"),
        JEWELLERY: t("productCategory.JEWELLERY"),
        LEATHER_GOODS: t("productCategory.LEATHER_GOODS"),
    };

    return (
        <main className="mx-auto max-w-6xl px-6 py-16">
            <h1 className="font-titre text-4xl tracking-tight">{shop.shopName}</h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muet">
                {shop.shopDescription}
            </p>
            <p className="mt-4 text-xs text-muet">
                {shop.categories.map((code) => categories[code] ?? code).join(", ")}
            </p>

            {collections.length > 0 && (
                <>
                    <h2 className="mt-16 text-sm text-muet">{t("shopCollections")}</h2>
                    <ul className="mt-4 flex flex-wrap gap-4">
                        {collections.map((collection) => (
                            <li key={collection.id}>
                                <Link
                                    href={`/shops/${shopSlug}/collections/${collection.slug}`}
                                    className="border-b border-bordure pb-1 text-sm hover:border-texte"
                                >
                                    {collection.title}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </>
            )}

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
                            price={displayPrice(row, locale, t)}
                        />
                    </li>
                ))}
            </ul>

            {rows.length === 0 && <p className="mt-8 text-sm text-muet">{t("empty")}</p>}

            {/* La vitrine pagine comme la liste. Sans ces liens, une boutique de plus de
                vingt-quatre articles n'en montrait que vingt-quatre, et les autres
                n'étaient atteignables que par une URL forgée à la main. */}
            <nav className="mt-12 flex items-center gap-6 text-sm">
                {filters.page > 1 && (
                    <Link href={catalogPageHref(recherche, filters.page - 1)} className="underline">
                        {t("previous")}
                    </Link>
                )}
                <span className="text-muet">{t("pageStatus", { page: filters.page, pages })}</span>
                {filters.page < pages && (
                    <Link href={catalogPageHref(recherche, filters.page + 1)} className="underline">
                        {t("next")}
                    </Link>
                )}
            </nav>
        </main>
    );
}
