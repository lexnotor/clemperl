import {
    ERROR_COLLECTION_FOREIGN_PRODUCT,
    createCollection,
    createProduct,
    listPublishedCollections,
    prisma,
    readPublishedCollection,
    searchPublishedProducts,
    setCollectionItems,
    setCollectionStatus,
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

        await setCollectionItems(prisma, { collectionId, vendorId: shop.id, productIds: [a, b, c] });
        await setCollectionItems(prisma, { collectionId, vendorId: shop.id, productIds: [c, b, a] });

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

        await setCollectionItems(prisma, { collectionId, vendorId: shop.id, productIds: [a, b, c] });
        await setCollectionItems(prisma, { collectionId, vendorId: shop.id, productIds: [a, c] });

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

        await setCollectionItems(prisma, { collectionId, vendorId: shop.id, productIds: [a, b] });
        await expect(
            setCollectionItems(prisma, { collectionId, vendorId: shop.id, productIds: [b, a] }),
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
        await setCollectionItems(prisma, { collectionId, vendorId: shop.id, productIds: [a, b] });

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
        await setCollectionItems(prisma, { collectionId, vendorId: shop.id, productIds: [visible, brouillon] });

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
        await setCollectionItems(prisma, { collectionId, vendorId: shop.id, productIds: [second, premier] });

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

// La règle que T2c a écrite en toutes lettres en tête de `product-image.repository.ts` :
// TOUTE fonction porte `vendorId` et filtre par la boutique, parce que les identifiants
// viennent du formulaire, donc du client. La garantie est dans la SIGNATURE, pas dans une
// vérification à l'entrée que le prochain appelant oubliera.
//
// Sans elle, un vendeur range le produit d'une autre boutique dans sa collection : il lui
// suffit de lire un identifiant de produit dans l'URL d'une vignette du catalogue public,
// où il est en clair. Rien ne fuit publiquement aujourd'hui, parce que la page publique
// passe aussi `shopSlug` à la requête du catalogue, mais la relation est écrite en base et
// l'écran vendeur affiche le titre et l'état de publication du produit d'autrui.
describe("setCollectionItems, face à un produit d'une autre boutique", () => {
    it("refuse la liste entière plutôt que d'en écrire une partie", async () => {
        const mienne = await createShop();
        const autre = await createShop();
        const collection = await createCollection(prisma, {
            vendorId: mienne.id,
            title: `Soldes ${counter}`,
            description: "",
            slug: `soldes-${counter}`,
        });
        const aMoi = await createDraft(mienne.id);
        const aAutrui = await createDraft(autre.id);

        await expect(
            setCollectionItems(prisma, {
                collectionId: collection.id,
                vendorId: mienne.id,
                productIds: [aMoi, aAutrui],
            }),
        ).rejects.toThrow(ERROR_COLLECTION_FOREIGN_PRODUCT);

        // RIEN n'est écrit : le refus porte sur la liste, pas sur la ligne fautive.
        expect(await prisma.collectionItem.count({ where: { collectionId: collection.id } })).toBe(
            0,
        );
    });

    it("refuse une collection qui n'est pas celle du vendeur", async () => {
        const mienne = await createShop();
        const autre = await createShop();
        const collection = await createCollection(prisma, {
            vendorId: autre.id,
            title: `Soldes ${counter}`,
            description: "",
            slug: `soldes-autrui-${counter}`,
        });
        const aMoi = await createDraft(mienne.id);

        await expect(
            setCollectionItems(prisma, {
                collectionId: collection.id,
                vendorId: mienne.id,
                productIds: [aMoi],
            }),
        ).rejects.toThrow();
    });

    it("accepte une liste dont tous les articles sont de la boutique", async () => {
        const mienne = await createShop();
        const collection = await createCollection(prisma, {
            vendorId: mienne.id,
            title: `Soldes ${counter}`,
            description: "",
            slug: `soldes-ok-${counter}`,
        });
        const premier = await createDraft(mienne.id);
        const second = await createDraft(mienne.id);

        await setCollectionItems(prisma, {
            collectionId: collection.id,
            vendorId: mienne.id,
            productIds: [premier, second],
        });

        expect(await prisma.collectionItem.count({ where: { collectionId: collection.id } })).toBe(
            2,
        );
    });
});

// Les deux fonctions qui décident ce qu'un VISITEUR voit n'avaient aucun test. Le plancher
// de couverture de `packages/db` exclut les dépôts au motif que la couche intégration les
// couvre : ce motif doit être vrai.
describe("les lectures publiques d'une collection", () => {
    async function publieeAvecSlug(vendorId: string, slug: string): Promise<string> {
        const collection = await createCollection(prisma, {
            vendorId,
            title: `Collection ${slug}`,
            description: "",
            slug,
        });
        await setCollectionStatus(prisma, { collectionId: collection.id, vendorId, publish: true });
        return slug;
    }

    it("rend null pour une collection en brouillon", async () => {
        const shop = await createShop();
        counter += 1;
        await createCollection(prisma, {
            vendorId: shop.id,
            title: "Brouillon",
            description: "",
            slug: `brouillon-${counter}`,
        });

        await expect(
            readPublishedCollection(prisma, { shopSlug: shop.slug, slug: `brouillon-${counter}` }),
        ).resolves.toBeNull();
    });

    // Le slug d'une collection n'est unique QUE par boutique, exactement comme celui d'un
    // produit. Demander celle de B sous l'identité de A doit rendre null, jamais celle de B.
    it("rend null quand la collection appartient à une autre boutique", async () => {
        const premiere = await createShop();
        const seconde = await createShop();
        counter += 1;
        const slug = `soldes-partage-${counter}`;
        await publieeAvecSlug(seconde.id, slug);

        await expect(
            readPublishedCollection(prisma, { shopSlug: premiere.slug, slug }),
        ).resolves.toBeNull();
    });

    it("rend null pour une boutique supprimée", async () => {
        const shop = await createShop();
        counter += 1;
        const slug = await publieeAvecSlug(shop.id, `fermee-${counter}`);
        await prisma.vendor.update({ where: { id: shop.id }, data: { deletedAt: new Date() } });

        await expect(
            readPublishedCollection(prisma, { shopSlug: shop.slug, slug }),
        ).resolves.toBeNull();
    });

    it("ne liste que les collections publiées de la boutique demandée", async () => {
        const shop = await createShop();
        const voisine = await createShop();
        counter += 1;
        const visible = await publieeAvecSlug(shop.id, `visible-${counter}`);
        counter += 1;
        await createCollection(prisma, {
            vendorId: shop.id,
            title: "Cachee",
            description: "",
            slug: `cachee-${counter}`,
        });
        counter += 1;
        await publieeAvecSlug(voisine.id, `voisine-${counter}`);

        const listees = await listPublishedCollections(prisma, shop.slug);

        expect(listees.map((c) => c.slug)).toEqual([visible]);
    });
});
