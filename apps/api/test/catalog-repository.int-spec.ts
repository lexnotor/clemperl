import {
    createProduct,
    listCatalogCurrencies,
    prisma,
    readPublishedProduct,
    readPublishedShop,
    searchPublishedProducts,
    setProductStatus,
} from "@clemperl/db";
import { CATALOG_PAGE_SIZE, catalogOffset, readCatalogFilters } from "@clemperl/domain";

// Préfixe propre au fichier : les suites partagent une base et un run, et deux suites qui
// nomment leurs boutiques pareil se marchent dessus. La panne se lit alors dans la suite
// VOISINE, ce qui coûte une demi-journée.
const PREFIX = "catalog";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
let counter = 0;

// Traduit les filtres du domaine en primitives, exactement comme le fera la page. Le dépôt
// ne reçoit jamais un type du domaine, qui dépend déjà de `@clemperl/db`.
function query(
    params: Record<string, string | string[] | undefined>,
    currency: string,
    shopSlug?: string,
) {
    const filters = readCatalogFilters(params);
    return {
        search: filters.search,
        category: filters.category,
        sort: filters.sort,
        currency,
        shopSlug,
        limit: CATALOG_PAGE_SIZE,
        offset: catalogOffset(filters.page),
    };
}

async function createShop(currency: string) {
    counter += 1;
    return prisma.vendor.create({
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
            currency: currency as never,
        },
    });
}

// Un produit PUBLIÉ complet : une variante et une image prête. Sans l'image, le dépôt
// refuse la publication, c'est la garantie solidifiée en T2c.
async function publishProduct(input: {
    vendorId: string;
    title: string;
    category: string;
    priceAmount: number;
    currency: string;
}) {
    counter += 1;
    const slug = `${PREFIX}-p-${counter}`;
    const { id } = await createProduct(prisma, {
        vendorId: input.vendorId,
        slug,
        title: input.title,
        description: DESCRIPTION,
        category: input.category,
        priceAmount: input.priceAmount,
        expectedCurrency: input.currency,
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
    await setProductStatus(prisma, { productId: id, vendorId: input.vendorId, publish: true });
    return { id, slug };
}

afterAll(async () => {
    await prisma.$disconnect();
});

describe("searchPublishedProducts", () => {
    it("rend un produit publié, avec sa boutique, son prix plancher et son image", async () => {
        const shop = await createShop("EUR");
        const { slug } = await publishProduct({
            vendorId: shop.id,
            title: "Sac cabas unique",
            category: "LEATHER_GOODS",
            priceAmount: 18000,
            currency: "EUR",
        });

        const { rows } = await searchPublishedProducts(
            prisma,
            query({ q: "Sac cabas unique" }, "EUR"),
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]?.slug).toBe(slug);
        expect(rows[0]?.shopSlug).toBe(shop.slug);
        expect(rows[0]?.currency).toBe("EUR");
        expect(rows[0]?.imagePath).toContain("/original.jpg");
    });

    // `node-postgres` rend certains types numériques en CHAÎNE. Un prix devenu chaîne
    // traverserait le formatage sans erreur, en affichant un montant faux.
    it("rend le prix plancher en nombre, pas en chaîne", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Bracelet type numerique",
            category: "JEWELLERY",
            priceAmount: 4500,
            currency: "EUR",
        });

        const { rows } = await searchPublishedProducts(
            prisma,
            query({ q: "Bracelet type numerique" }, "EUR"),
        );

        expect(typeof rows[0]?.minPriceAmount).toBe("number");
        expect(rows[0]?.minPriceAmount).toBe(4500);
        expect(typeof rows[0]?.variantCount).toBe("number");
        expect(rows[0]?.variantCount).toBe(1);
    });

    it("ne rend jamais un brouillon", async () => {
        const shop = await createShop("EUR");
        counter += 1;
        await createProduct(prisma, {
            vendorId: shop.id,
            slug: `${PREFIX}-draft-${counter}`,
            title: "Brouillon invisible",
            description: DESCRIPTION,
            category: "APPAREL",
            priceAmount: 1000,
            expectedCurrency: "EUR",
        });

        const { rows } = await searchPublishedProducts(
            prisma,
            query({ q: "Brouillon invisible" }, "EUR"),
        );

        expect(rows).toHaveLength(0);
    });

    it("ne rend pas le produit d'une boutique supprimée", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Produit de boutique fermee",
            category: "APPAREL",
            priceAmount: 2000,
            currency: "EUR",
        });
        await prisma.vendor.update({ where: { id: shop.id }, data: { deletedAt: new Date() } });

        const { rows } = await searchPublishedProducts(
            prisma,
            query({ q: "Produit de boutique fermee" }, "EUR"),
        );

        expect(rows).toHaveLength(0);
    });

    it("borne la liste à la devise demandée", async () => {
        const euro = await createShop("EUR");
        const cfa = await createShop("XOF");
        await publishProduct({
            vendorId: euro.id,
            title: "Ceinture bicolore devise",
            category: "LEATHER_GOODS",
            priceAmount: 5000,
            currency: "EUR",
        });
        await publishProduct({
            vendorId: cfa.id,
            title: "Ceinture bicolore devise",
            category: "LEATHER_GOODS",
            priceAmount: 30000,
            currency: "XOF",
        });

        const resultat = await searchPublishedProducts(
            prisma,
            query({ q: "Ceinture bicolore devise" }, "XOF"),
        );

        expect(resultat.rows).toHaveLength(1);
        expect(resultat.rows[0]?.currency).toBe("XOF");
    });

    it("filtre par catégorie", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Objet filtre categorie",
            category: "JEWELLERY",
            priceAmount: 1000,
            currency: "EUR",
        });

        const joaillerie = await searchPublishedProducts(
            prisma,
            query({ q: "Objet filtre categorie", category: "JEWELLERY" }, "EUR"),
        );
        const vetements = await searchPublishedProducts(
            prisma,
            query({ q: "Objet filtre categorie", category: "APPAREL" }, "EUR"),
        );

        expect(joaillerie.rows).toHaveLength(1);
        expect(vetements.rows).toHaveLength(0);
    });

    it("cherche sans tenir compte de la casse ni des accents", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Étole brodée singuliere",
            category: "APPAREL",
            priceAmount: 3000,
            currency: "EUR",
        });

        for (const terme of ["étole brodée singuliere", "ETOLE BRODEE SINGULIERE", "etole brodee"]) {
            const { rows } = await searchPublishedProducts(prisma, query({ q: terme }, "EUR"));
            expect(rows.map((row) => row.title)).toContain("Étole brodée singuliere");
        }
    });

    // `%` et `_` sont les jokers d'`ILIKE`. Cherchés tels quels, ils feraient tout remonter :
    // « 100% coton » rendrait le catalogue entier.
    it("traite les jokers d'ILIKE comme du texte", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Pull 100% laine",
            category: "APPAREL",
            priceAmount: 7000,
            currency: "EUR",
        });

        const exact = await searchPublishedProducts(prisma, query({ q: "100% laine" }, "EUR"));
        const joker = await searchPublishedProducts(prisma, query({ q: "100_ laine" }, "EUR"));

        expect(exact.rows).toHaveLength(1);
        expect(joker.rows).toHaveLength(0);
    });

    it("trie par prix croissant et décroissant", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Tri cher article",
            category: "APPAREL",
            priceAmount: 90000,
            currency: "EUR",
        });
        await publishProduct({
            vendorId: shop.id,
            title: "Tri bon marche article",
            category: "APPAREL",
            priceAmount: 1000,
            currency: "EUR",
        });

        const croissant = await searchPublishedProducts(
            prisma,
            query({ q: "Tri", sort: "price_asc" }, "EUR"),
        );
        const decroissant = await searchPublishedProducts(
            prisma,
            query({ q: "Tri", sort: "price_desc" }, "EUR"),
        );

        expect(croissant.rows[0]?.minPriceAmount).toBe(1000);
        expect(decroissant.rows[0]?.minPriceAmount).toBe(90000);
    });

    it("pagine sans sauter ni répéter une ligne", async () => {
        const shop = await createShop("EUR");
        for (let i = 0; i < 3; i += 1) {
            await publishProduct({
                vendorId: shop.id,
                title: `Pagination article ${i}`,
                category: "APPAREL",
                priceAmount: 1000 + i,
                currency: "EUR",
            });
        }

        const tout = await searchPublishedProducts(
            prisma,
            query({ q: "Pagination article", sort: "price_asc" }, "EUR"),
        );

        expect(tout.total).toBe(3);
        expect(new Set(tout.rows.map((row) => row.id)).size).toBe(3);
    });

    // Sans colonne unique pour clore l'ordre, `LIMIT ... OFFSET` n'est pas déterministe
    // entre deux exécutions dès que des lignes partagent la valeur triée. Une ligne se
    // répète alors d'une page à l'autre, et une autre est sautée : le visiteur ne voit
    // jamais ce produit, et rien ne le signale. Deux `published_at` identiques ne sont pas
    // une hypothèse d'école : un import en lot, ou deux publications dans la même
    // milliseconde, suffisent. Le tri par prix fait pire, les ex aequo y sont massifs.
    it("ne répète ni ne saute une ligne quand le critère de tri est à égalité", async () => {
        const shop = await createShop("EUR");
        const ids: string[] = [];
        for (let i = 0; i < 6; i += 1) {
            const { id } = await publishProduct({
                vendorId: shop.id,
                title: `Egalite stricte ${i}`,
                category: "APPAREL",
                priceAmount: 1000,
                currency: "EUR",
            });
            ids.push(id);
        }
        // Le même instant pour tous, et le même prix : seul le départage peut les ordonner.
        await prisma.product.updateMany({
            where: { id: { in: ids } },
            data: { publishedAt: new Date("2026-01-01T00:00:00.000Z") },
        });

        const commun = query({ q: "Egalite stricte", sort: "price_asc" }, "EUR");
        const premiere = await searchPublishedProducts(prisma, { ...commun, limit: 3, offset: 0 });
        const seconde = await searchPublishedProducts(prisma, { ...commun, limit: 3, offset: 3 });

        const vus = [...premiere.rows, ...seconde.rows].map((row) => row.id);
        expect(vus).toHaveLength(6);
        expect(new Set(vus).size).toBe(6);
    });

    // `unaccent` normalise les formes PLEINE CHASSE vers l'ASCII : `unaccent('\uFF05')` vaut
    // `%`. Échapper les jokers en JavaScript puis laisser le SQL unaccenter le motif les
    // recréait donc APRÈS l'échappement, et une recherche d'un seul caractère rendait tout
    // le catalogue en balayant la table deux fois.
    //
    // Ce qui se vérifie n'est pas « zéro résultat » : une fois échappée, la forme pleine
    // chasse cherche le caractère LITTÉRAL, exactement comme sa forme ASCII. Les deux
    // doivent donc rendre la même chose, et bien moins que la liste entière.
    it("traite les jokers en pleine chasse comme leur forme ASCII, littérale", async () => {
        const shop = await createShop("EUR");
        await publishProduct({
            vendorId: shop.id,
            title: "Drap 50% lin et 50% coton",
            category: "APPAREL",
            priceAmount: 2000,
            currency: "EUR",
        });
        await publishProduct({
            vendorId: shop.id,
            title: "Echarpe sans aucun joker",
            category: "APPAREL",
            priceAmount: 2100,
            currency: "EUR",
        });

        const tout = await searchPublishedProducts(prisma, query({}, "EUR"));
        const ascii = await searchPublishedProducts(prisma, query({ q: "%" }, "EUR"));
        const pleine = await searchPublishedProducts(prisma, query({ q: "\uFF05" }, "EUR"));

        // La forme pleine chasse se comporte comme l'ASCII, et aucune des deux ne rend tout.
        expect(pleine.total).toBe(ascii.total);
        expect(pleine.total).toBeLessThan(tout.total);
        expect(pleine.rows.map((row) => row.title)).toContain("Drap 50% lin et 50% coton");
        expect(pleine.rows.map((row) => row.title)).not.toContain("Echarpe sans aucun joker");

        // Même démonstration pour le souligné, qu'aucun titre ne porte.
        const souligne = await searchPublishedProducts(prisma, query({ q: "\uFF3F" }, "EUR"));
        expect(souligne.total).toBe(0);
    });

    it("rend une liste vide, et non une erreur, au-delà de la dernière page", async () => {
        const resultat = await searchPublishedProducts(
            prisma,
            query({ q: "rien ne porte ce titre improbable", page: "999" }, "EUR"),
        );

        expect(resultat.rows).toHaveLength(0);
        expect(resultat.total).toBe(0);
    });

    // La vitrine réutilise cette requête, bornée à une boutique. Filtrer en mémoire après
    // coup tronquerait la vitrine d'une boutique de plus d'une page.
    it("borne à une boutique quand on le lui demande", async () => {
        const premiere = await createShop("EUR");
        const seconde = await createShop("EUR");
        await publishProduct({
            vendorId: premiere.id,
            title: "Article de vitrine partagee",
            category: "APPAREL",
            priceAmount: 1000,
            currency: "EUR",
        });
        await publishProduct({
            vendorId: seconde.id,
            title: "Article de vitrine partagee",
            category: "APPAREL",
            priceAmount: 2000,
            currency: "EUR",
        });

        const toutes = await searchPublishedProducts(
            prisma,
            query({ q: "Article de vitrine partagee" }, "EUR"),
        );
        const une = await searchPublishedProducts(
            prisma,
            query({ q: "Article de vitrine partagee" }, "EUR", premiere.slug),
        );

        expect(toutes.rows).toHaveLength(2);
        expect(une.rows).toHaveLength(1);
        expect(une.rows[0]?.shopSlug).toBe(premiere.slug);
    });
});

describe("listCatalogCurrencies", () => {
    // Le décompte doit porter sur la MÊME population que la liste. Compter des produits que
    // la liste ne sait pas montrer fait choisir, à la première visite, une devise qui
    // affiche « aucun article ne correspond » sans qu'aucun filtre soit actif, et le repli
    // ne se déclenche pas puisque la devise est techniquement disponible.
    it("ne compte que les produits que la liste sait montrer", async () => {
        const shop = await createShop("XAF");
        counter += 1;
        // Publié de force, sans image prête : exactement ce que la liste écarte.
        const sansImage = await prisma.product.create({
            data: {
                vendorId: shop.id,
                slug: `${PREFIX}-sans-image-${counter}`,
                title: "Publie sans image",
                description: DESCRIPTION,
                category: "APPAREL",
                status: "PUBLISHED",
                publishedAt: new Date(),
                variants: { create: { priceAmount: 1000, combinationKey: "", position: 0 } },
            },
        });

        const devises = await listCatalogCurrencies(prisma);
        const xaf = devises.find((entree) => entree.currency === "XAF");
        const { total } = await searchPublishedProducts(prisma, query({}, "XAF"));

        expect(sansImage.status).toBe("PUBLISHED");
        expect(xaf?.productCount ?? 0).toBe(total);
    });

    it("rend les devises portant au moins un produit publié, la plus fournie en tête", async () => {
        const devises = await listCatalogCurrencies(prisma);

        expect(devises.length).toBeGreaterThan(0);
        expect(typeof devises[0]?.productCount).toBe("number");
        for (let i = 1; i < devises.length; i += 1) {
            expect(devises[i - 1]?.productCount).toBeGreaterThanOrEqual(
                devises[i]?.productCount ?? 0,
            );
        }
    });
});

describe("readPublishedProduct", () => {
    it("rend le produit, ses images prêtes et ses déclinaisons", async () => {
        const shop = await createShop("EUR");
        const { slug } = await publishProduct({
            vendorId: shop.id,
            title: "Fiche produit lisible",
            category: "APPAREL",
            priceAmount: 12000,
            currency: "EUR",
        });

        const product = await readPublishedProduct(prisma, {
            shopSlug: shop.slug,
            productSlug: slug,
        });

        expect(product?.title).toBe("Fiche produit lisible");
        expect(product?.currency).toBe("EUR");
        expect(product?.images).toHaveLength(1);
        expect(product?.variants).toHaveLength(1);
        expect(product?.shopContactEmail).toBe(shop.contactEmail);
    });

    it("ne rend pas une image qui n'est pas prête", async () => {
        const shop = await createShop("EUR");
        const { id, slug } = await publishProduct({
            vendorId: shop.id,
            title: "Fiche avec image en cours",
            category: "APPAREL",
            priceAmount: 1000,
            currency: "EUR",
        });
        await prisma.productImage.create({
            data: {
                productId: id,
                objectPath: `${id}/99999999-2222-3333-4444-555555555555/original.jpg`,
                originalName: "deuxieme.jpg",
                position: 1,
                status: "PENDING",
            },
        });

        const product = await readPublishedProduct(prisma, {
            shopSlug: shop.slug,
            productSlug: slug,
        });

        expect(product?.images).toHaveLength(1);
    });

    it("rend null pour un brouillon", async () => {
        const shop = await createShop("EUR");
        counter += 1;
        const slug = `${PREFIX}-draft-fiche-${counter}`;
        await createProduct(prisma, {
            vendorId: shop.id,
            slug,
            title: "Brouillon de fiche",
            description: DESCRIPTION,
            category: "APPAREL",
            priceAmount: 1000,
            expectedCurrency: "EUR",
        });

        await expect(
            readPublishedProduct(prisma, { shopSlug: shop.slug, productSlug: slug }),
        ).resolves.toBeNull();
    });

    // Le slug produit n'est unique QUE par boutique. Demander le produit de B sous
    // l'identité de A doit rendre null, jamais le produit de B.
    it("rend null quand le produit appartient à une autre boutique", async () => {
        const premiere = await createShop("EUR");
        const seconde = await createShop("EUR");
        const { slug } = await publishProduct({
            vendorId: seconde.id,
            title: "Produit de la seconde boutique",
            category: "APPAREL",
            priceAmount: 1000,
            currency: "EUR",
        });

        await expect(
            readPublishedProduct(prisma, { shopSlug: premiere.slug, productSlug: slug }),
        ).resolves.toBeNull();
    });
});

describe("readPublishedShop", () => {
    it("rend une boutique qui a une devise", async () => {
        const shop = await createShop("EUR");

        const lue = await readPublishedShop(prisma, { shopSlug: shop.slug });

        expect(lue?.shopName).toBe(shop.shopName);
        expect(lue?.currency).toBe("EUR");
    });

    // Une boutique sans devise n'a aucun produit publiable, donc aucune vitrine à montrer.
    it("rend null pour une boutique sans devise", async () => {
        counter += 1;
        const shop = await prisma.vendor.create({
            data: {
                slug: `${PREFIX}-sans-devise-${counter}`,
                shopName: "Sans devise",
                shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
                contactEmail: `sans-devise-${counter}@atelier.test`,
                contactPhone: "+32470000000",
                categories: ["JEWELLERY"],
                legalForm: "SRL",
                legalName: "Sans devise SRL",
                registrationNumber: "0123456789",
                country: "BE",
            },
        });

        await expect(readPublishedShop(prisma, { shopSlug: shop.slug })).resolves.toBeNull();
    });

    it("rend null pour une boutique supprimée", async () => {
        const shop = await createShop("EUR");
        await prisma.vendor.update({ where: { id: shop.id }, data: { deletedAt: new Date() } });

        await expect(readPublishedShop(prisma, { shopSlug: shop.slug })).resolves.toBeNull();
    });
});
