import { prisma, searchPublishedProducts } from "@clemperl/db";
import {
    CATALOG_PAGE_SIZE,
    catalogOffset,
    catalogPageHref,
    readCatalogFilters,
} from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { JSX } from "react";
import { readCurrencyCookie } from "../../../lib/currency-cookie";
import { CurrencySelector } from "../components/currency-selector";
import { CatalogFilters } from "./components/catalog-filters";
import { ProductCard } from "./components/product-card";
import { displayPrice } from "./components/product-price";

// La devise vient d'un cookie, donc la page est PERSONNELLE et ne se met pas en cache page
// entière. C'est la conséquence assumée du choix de ranger la devise là. Le poids réel est
// sur les images, qui gardent le cache d'un an de la route de relais.
export const dynamic = "force-dynamic";

export default async function CatalogPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
    const { locale } = await params;
    const t = await getTranslations("catalog");
    const recherche = await searchParams;
    const filters = readCatalogFilters(recherche);
    const { current, available } = await readCurrencyCookie();

    // La page TRADUIT les filtres du domaine en primitives. Le dépôt ne connaît pas le
    // domaine, qui dépend déjà de `@clemperl/db` : l'inverse fermerait un cycle.
    const { rows, total } = await searchPublishedProducts(prisma, {
        search: filters.search,
        category: filters.category,
        sort: filters.sort,
        currency: current,
        limit: CATALOG_PAGE_SIZE,
        offset: catalogOffset(filters.page),
    });
    const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));

    const libelles: Record<string, string> = {
        searchLabel: t("searchLabel"),
        searchPlaceholder: t("searchPlaceholder"),
        categoryLabel: t("categoryLabel"),
        categoryAll: t("categoryAll"),
        sortLabel: t("sortLabel"),
        sort_newest: t("sortNewest"),
        sort_price_asc: t("sortPriceAsc"),
        sort_price_desc: t("sortPriceDesc"),
    };
    const categories: Record<string, string> = {
        APPAREL: t("productCategory.APPAREL"),
        JEWELLERY: t("productCategory.JEWELLERY"),
        LEATHER_GOODS: t("productCategory.LEATHER_GOODS"),
    };

    return (
        <main className="mx-auto max-w-6xl px-6 py-16">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
                <h1 className="font-titre text-4xl tracking-tight">{t("title")}</h1>
                <CurrencySelector
                    current={current}
                    available={available.map((entree) => entree.currency)}
                    label={t("currencyLabel")}
                />
            </div>

            <div className="mt-10">
                <CatalogFilters labels={libelles} categoryLabels={categories} />
            </div>

            {rows.length === 0 ? (
                <p className="mt-16 text-sm text-muet">
                    {available.length === 0 ? t("emptyCurrency") : t("empty")}
                </p>
            ) : (
                <>
                    <p className="mt-10 text-xs text-muet">{t("resultCount", { count: total })}</p>
                    <ul className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-4">
                        {rows.map((row) => (
                            <li key={row.id}>
                                <ProductCard
                                    shopSlug={row.shopSlug}
                                    productSlug={row.slug}
                                    title={row.title}
                                    shopName={row.shopName}
                                    imagePath={row.imagePath}
                                    // Formaté ICI, côté serveur. `formatPrice` tire
                                    // `@clemperl/core`, donc nodemailer : un composant
                                    // client qui l'importerait casserait le paquet
                                    // navigateur.
                                    price={displayPrice(row, locale, t)}
                                />
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {/* HORS de la branche non vide : une page au-delà de la dernière laissait le
                visiteur sans aucun chemin de retour, pas même « page précédente ». Et les
                liens REPORTENT les filtres, qu'un `href` commençant par « ? » effaçait. */}
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
