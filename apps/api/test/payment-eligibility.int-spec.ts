import {
    createProduct,
    eligibleVariantWhere,
    listCatalogCurrencies,
    prisma,
    readPublishedProduct,
    readPublishedShop,
    searchPublishedProducts,
    setProductStatus,
    setShopPaymentMethods,
} from "@clemperl/db";
import type { Vendor } from "@clemperl/db";
import { CATALOG_PAGE_SIZE, catalogOffset, readCatalogFilters } from "@clemperl/domain";

// Préfixe propre au fichier : les suites partagent une base et un run, et deux suites qui
// nomment leurs boutiques pareil se marchent dessus.
const PREFIX = "payelig";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
const CURRENCY = "EUR";
let counter = 0;

// Une boutique ouverte, avec une devise, un produit publié, une variante et une image
// prête : tout ce que l'éligibilité exige SAUF ce que le test fait varier, les méthodes
// de paiement. Si une autre condition manquait, la boutique serait absente des lectures
// avant comme après, et le test ne prouverait rien.
async function createShopWithPublishedProduct(input: { methods: Vendor["paymentMethods"] }) {
    counter += 1;
    const vendor = await prisma.vendor.create({
        data: {
            slug: `${PREFIX}-shop-${counter}`,
            shopName: `Atelier ${counter}`,
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: `contact-${counter}@atelier.test`,
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: `Atelier ${counter} SRL`,
            registrationNumber: "0123456789",
            country: "BE",
            currency: CURRENCY,
            paymentMethods: input.methods,
        },
    });

    const productSlug = `${PREFIX}-p-${counter}`;
    const { id } = await createProduct(prisma, {
        vendorId: vendor.id,
        slug: productSlug,
        title: `Sac cabas ${counter}`,
        description: DESCRIPTION,
        category: "LEATHER_GOODS",
        priceAmount: 18000,
        expectedCurrency: CURRENCY,
    });
    await prisma.productImage.create({
        data: {
            productId: id,
            objectPath: `${id}/1111111${counter % 10}-2222-3333-4444-555555555555/original.jpg`,
            originalName: "photo.jpg",
            position: 0,
            status: "READY",
            width: 1200,
            height: 800,
        },
    });
    await setProductStatus(prisma, { productId: id, vendorId: vendor.id, publish: true });
    const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: id } });

    return {
        id: vendor.id,
        slug: vendor.slug,
        currency: CURRENCY,
        productSlug,
        variantId: variant.id,
    };
}

// La liste du catalogue bornée à la boutique : le total ne compte que ses produits, donc
// ne dépend pas de ce que les autres suites ont laissé dans la base.
function catalogQuery(shop: { slug: string; currency: string }) {
    const filters = readCatalogFilters({});
    return {
        search: filters.search,
        category: filters.category,
        sort: filters.sort,
        currency: shop.currency,
        shopSlug: shop.slug,
        limit: CATALOG_PAGE_SIZE,
        offset: catalogOffset(filters.page),
    };
}

function productCountOf(rows: { currency: string; productCount: number }[], currency: string) {
    return rows.find((row) => row.currency === currency)?.productCount ?? 0;
}

afterAll(async () => {
    await prisma.$disconnect();
});

describe("une boutique sans méthode de paiement", () => {
    // Quatre lectures partagent la règle d'éligibilité : la liste du catalogue, la fiche
    // produit, la vitrine et la validation du panier. Ce test échoue dès que l'une d'elles
    // perd la condition, et toute nouvelle lecture d'éligibilité se déclare ici aussi.
    it("quitte les quatre lectures à la fois", async () => {
        const shop = await createShopWithPublishedProduct({ methods: ["OFF_PLATFORM"] });

        await expect(
            searchPublishedProducts(prisma, catalogQuery(shop)),
        ).resolves.toMatchObject({ total: 1 });
        await expect(
            readPublishedProduct(prisma, { shopSlug: shop.slug, productSlug: shop.productSlug }),
        ).resolves.not.toBeNull();
        await expect(readPublishedShop(prisma, { shopSlug: shop.slug })).resolves.not.toBeNull();
        await expect(
            prisma.productVariant.findFirst({ where: eligibleVariantWhere(shop.variantId) }),
        ).resolves.not.toBeNull();

        await prisma.vendor.update({ where: { id: shop.id }, data: { paymentMethods: [] } });

        await expect(
            searchPublishedProducts(prisma, catalogQuery(shop)),
        ).resolves.toMatchObject({ total: 0 });
        await expect(
            readPublishedProduct(prisma, { shopSlug: shop.slug, productSlug: shop.productSlug }),
        ).resolves.toBeNull();
        await expect(readPublishedShop(prisma, { shopSlug: shop.slug })).resolves.toBeNull();
        await expect(
            prisma.productVariant.findFirst({ where: eligibleVariantWhere(shop.variantId) }),
        ).resolves.toBeNull();
    });

    // Le décompte des devises est la cinquième lecture, et la plus facile à oublier : sa
    // requête est écrite à part, donc une condition ajoutée à la liste ne l'atteint pas
    // d'elle-même, et il compterait des produits que la liste ne montre pas.
    it("ne compte plus dans le décompte des devises", async () => {
        const shop = await createShopWithPublishedProduct({ methods: ["OFF_PLATFORM"] });
        const before = productCountOf(await listCatalogCurrencies(prisma), shop.currency);

        await prisma.vendor.update({ where: { id: shop.id }, data: { paymentMethods: [] } });
        const after = productCountOf(await listCatalogCurrencies(prisma), shop.currency);

        expect(after).toBe(before - 1);
    });
});

describe("setShopPaymentMethods", () => {
    // Une boutique naît avec une liste vide : le premier enregistrement du vendeur est le
    // moment où elle devient visible. Toutes les autres conditions sont réunies, donc seule
    // l'écriture explique le passage.
    it("fait entrer au catalogue une boutique qui n'avait aucune méthode", async () => {
        const shop = await createShopWithPublishedProduct({ methods: [] });

        await expect(
            searchPublishedProducts(prisma, catalogQuery(shop)),
        ).resolves.toMatchObject({ total: 0 });
        await expect(readPublishedShop(prisma, { shopSlug: shop.slug })).resolves.toBeNull();

        await setShopPaymentMethods(prisma, { vendorId: shop.id, paymentMethods: ["CARD"] });

        await expect(
            searchPublishedProducts(prisma, catalogQuery(shop)),
        ).resolves.toMatchObject({ total: 1 });
        await expect(readPublishedShop(prisma, { shopSlug: shop.slug })).resolves.not.toBeNull();
    });

    // La liste REMPLACE. Une écriture qui s'y ajouterait garderait la méthode que le vendeur
    // vient de décocher, et l'acheteur pourrait encore la choisir à la validation.
    it("remplace la liste et ne s'y ajoute pas", async () => {
        const shop = await createShopWithPublishedProduct({ methods: [] });

        await setShopPaymentMethods(prisma, { vendorId: shop.id, paymentMethods: ["CARD"] });
        await setShopPaymentMethods(prisma, {
            vendorId: shop.id,
            paymentMethods: ["BANK_TRANSFER"],
        });

        const vendor = await prisma.vendor.findUniqueOrThrow({ where: { id: shop.id } });
        expect(vendor.paymentMethods).toEqual(["BANK_TRANSFER"]);
    });
});
