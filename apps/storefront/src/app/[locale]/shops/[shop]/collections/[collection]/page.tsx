import { prisma, readPublishedCollection, readPublishedShop, searchPublishedProducts } from "@clemperl/db";
import { CATALOG_PAGE_SIZE, catalogOffset, catalogPageHref, readCatalogFilters } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { ProductCard } from "../../../../catalog/components/product-card";
import { displayPrice } from "../../../../catalog/components/product-price";

export const dynamic = "force-dynamic";

export default async function CollectionPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string; shop: string; collection: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
    const { locale, shop: shopSlug, collection: collectionSlug } = await params;
    const t = await getTranslations("catalog");

    const shop = await readPublishedShop(prisma, { shopSlug });
    if (!shop) {
        notFound();
    }

    // Une collection en brouillon n'existe pas pour un visiteur : `readPublishedCollection`
    // filtre sur le statut, donc un 404 et non une page vide qui laisserait croire que la
    // collection est là mais déserte.
    const collection = await readPublishedCollection(prisma, { shopSlug, slug: collectionSlug });
    if (!collection) {
        notFound();
    }

    // La requête du catalogue, avec un fragment de plus. Recopier ses conditions
    // d'éligibilité ici créerait une seconde vérité : la revue de T2d a trouvé un décompte
    // qui comptait des produits que la liste ne savait pas montrer.
    //
    // `sort: "collection"` trie par la position choisie par le vendeur. Aucun contrôle de
    // tri n'est offert au visiteur : le vendeur a rangé, lui proposer « du moins cher au
    // plus cher » annulerait son travail.
    //
    // La devise est celle de la BOUTIQUE et non celle du cookie, comme la vitrine, et pour
    // la même raison : borner au cookie ferait disparaître les articles qu'on vient voir.
    const recherche = await searchParams;
    const filters = readCatalogFilters(recherche);
    const { rows, total } = await searchPublishedProducts(prisma, {
        search: null,
        category: null,
        sort: "collection",
        currency: shop.currency,
        shopSlug,
        collectionId: collection.id,
        limit: CATALOG_PAGE_SIZE,
        offset: catalogOffset(filters.page),
    });
    const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));

    return (
        <main className="mx-auto max-w-6xl px-6 py-16">
            <p className="text-sm text-muet">
                <Link href={`/shops/${shopSlug}`} className="underline">
                    {shop.shopName}
                </Link>
            </p>
            <h1 className="mt-2 font-titre text-4xl tracking-tight">{collection.title}</h1>
            {collection.description !== null && (
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-muet">
                    {collection.description}
                </p>
            )}

            <ul className="mt-16 grid grid-cols-2 gap-6 md:grid-cols-4">
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

            {rows.length === 0 && (
                <p className="mt-8 text-sm text-muet">{t("collectionEmpty")}</p>
            )}

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
