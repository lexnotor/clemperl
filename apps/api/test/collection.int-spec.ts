import {
    createCollection,
    createProduct,
    prisma,
    searchPublishedProducts,
    setCollectionItems,
    setProductStatus,
} from "@clemperl/db";

// Préfixe propre au fichier : les suites partagent une base et un run, et deux suites qui
// nomment leurs boutiques pareil se marchent dessus. La panne se lit alors dans la suite
// VOISINE, ce qui coûte une demi-journée.
const PREFIX = "collection";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
let counter = 0;

async function createShop() {
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
            currency: "EUR" as never,
        },
    });
}

// Un brouillon suffit à prouver les positions, qui ne regardent pas la publication.
async function createDraft(vendorId: string): Promise<string> {
    counter += 1;
    const { id } = await createProduct(prisma, {
        vendorId,
        slug: `${PREFIX}-p-${counter}`,
        title: `Sac cabas ${counter}`,
        description: DESCRIPTION,
        category: "LEATHER_GOODS",
        priceAmount: 18000,
        expectedCurrency: "EUR",
    });
    return id;
}

// Un produit PUBLIÉ complet : sa variante vient de `createProduct`, l'image prête d'ici.
// Sans elle, le dépôt refuse la publication, garantie solidifiée en T2c.
async function publish(vendorId: string, productId: string): Promise<void> {
    counter += 1;
    await prisma.productImage.create({
        data: {
            productId,
            objectPath: `${productId}/1111111${counter % 10}-2222-3333-4444-555555555555/original.jpg`,
            originalName: "photo.jpg",
            position: 0,
            status: "READY",
            width: 1200,
            height: 800,
        },
    });
    await setProductStatus(prisma, { productId, vendorId, publish: true });
}

async function newCollection(vendorId: string): Promise<string> {
    counter += 1;
    const { id } = await createCollection(prisma, {
        vendorId,
        slug: `${PREFIX}-ete-${counter}`,
        title: "Soldes d'été",
    });
    return id;
}

function positionsOf(collectionId: string) {
    return prisma.collectionItem.findMany({
        where: { collectionId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { productId: true, position: true },
    });
}

afterAll(async () => {
    await prisma.$disconnect();
});

describe("setCollectionItems", () => {
    it("réécrit les positions de zéro à n moins un", async () => {
        const shop = await createShop();
        const a = await createDraft(shop.id);
        const b = await createDraft(shop.id);
        const c = await createDraft(shop.id);
        const collectionId = await newCollection(shop.id);

        await setCollectionItems(prisma, { collectionId, productIds: [a, b, c] });
        await setCollectionItems(prisma, { collectionId, productIds: [c, b, a] });

        expect(await positionsOf(collectionId)).toEqual([
            { productId: c, position: 0 },
            { productId: b, position: 1 },
            { productId: a, position: 2 },
        ]);
    });

    // Un retrait ne doit pas laisser 0 et 2 : une position est un rang, pas une étiquette.
    it("referme le trou laissé par un retrait", async () => {
        const shop = await createShop();
        const a = await createDraft(shop.id);
        const b = await createDraft(shop.id);
        const c = await createDraft(shop.id);
        const collectionId = await newCollection(shop.id);

        await setCollectionItems(prisma, { collectionId, productIds: [a, b, c] });
        await setCollectionItems(prisma, { collectionId, productIds: [a, c] });

        expect(await positionsOf(collectionId)).toEqual([
            { productId: a, position: 0 },
            { productId: c, position: 1 },
        ]);
    });

    // LE point de la tâche. Une contrainte d'unicité sur `position` rendrait cet échange
    // impossible : PostgreSQL vérifie à chaque instruction, donc la première écriture la
    // violerait avant que la seconde ne la rétablisse.
    it("échange deux rangs sans rien violer", async () => {
        const shop = await createShop();
        const a = await createDraft(shop.id);
        const b = await createDraft(shop.id);
        const collectionId = await newCollection(shop.id);

        await setCollectionItems(prisma, { collectionId, productIds: [a, b] });
        await expect(
            setCollectionItems(prisma, { collectionId, productIds: [b, a] }),
        ).resolves.not.toThrow();

        expect(await positionsOf(collectionId)).toEqual([
            { productId: b, position: 0 },
            { productId: a, position: 1 },
        ]);
    });

    // Une collection qui pointerait vers un article supprimé afficherait un trou que
    // personne ne saurait expliquer.
    it("emporte ses lignes quand le produit est supprimé", async () => {
        const shop = await createShop();
        const a = await createDraft(shop.id);
        const b = await createDraft(shop.id);
        const collectionId = await newCollection(shop.id);
        await setCollectionItems(prisma, { collectionId, productIds: [a, b] });

        await prisma.product.delete({ where: { id: a } });

        expect(await positionsOf(collectionId)).toEqual([{ productId: b, position: 1 }]);
    });
});

describe("le filtre de collection sur le catalogue", () => {
    // La page publique n'a pas sa propre requête : elle ajoute un fragment aux conditions
    // du catalogue. Ce test est la garantie qu'elle HÉRITE de l'éligibilité au lieu de la
    // recopier. La revue de T2d a payé exactement cet écart.
    it("ne rend que les produits publiés de la collection", async () => {
        const shop = await createShop();
        const visible = await createDraft(shop.id);
        const brouillon = await createDraft(shop.id);
        await publish(shop.id, visible);

        const collectionId = await newCollection(shop.id);
        await setCollectionItems(prisma, { collectionId, productIds: [visible, brouillon] });

        const { rows, total } = await searchPublishedProducts(prisma, {
            search: null,
            category: null,
            sort: "collection",
            currency: "EUR",
            collectionId,
            limit: 24,
            offset: 0,
        });

        expect(total).toBe(1);
        expect(rows.map((row) => row.id)).toEqual([visible]);
    });

    // L'ordre du vendeur, bout en bout : la requête doit le rendre, pas le plus récent.
    it("rend les produits dans l'ordre choisi par le vendeur", async () => {
        const shop = await createShop();
        const premier = await createDraft(shop.id);
        const second = await createDraft(shop.id);
        await publish(shop.id, premier);
        await publish(shop.id, second);

        const collectionId = await newCollection(shop.id);
        await setCollectionItems(prisma, { collectionId, productIds: [second, premier] });

        const { rows } = await searchPublishedProducts(prisma, {
            search: null,
            category: null,
            sort: "collection",
            currency: "EUR",
            collectionId,
            limit: 24,
            offset: 0,
        });

        expect(rows.map((row) => row.id)).toEqual([second, premier]);
    });
});
