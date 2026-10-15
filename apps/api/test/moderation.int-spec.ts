import {
    ERROR_MODERATION_PRODUCT_NOT_FOUND,
    createProduct,
    listProductsToModerate,
    markProductReviewed,
    prisma,
    retireProduct,
    setProductStatus,
} from "@clemperl/db";

// Préfixe propre au fichier : les suites partagent une base qui n'est pas vidée entre deux
// passages, et deux suites qui nomment leurs boutiques pareil se marchent dessus.
const PREFIX = "mod";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
const PRICE = 5000;
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
            paymentMethods: ["OFF_PLATFORM"] as never,
        },
    });
}

/** Un produit avec une image prête, laissé en brouillon. */
async function draftProduct(vendorId: string, title: string): Promise<string> {
    counter += 1;
    const { id } = await createProduct(prisma, {
        vendorId,
        slug: `${PREFIX}-p-${counter}`,
        title,
        description: DESCRIPTION,
        category: "LEATHER_GOODS",
        priceAmount: PRICE,
        expectedCurrency: "EUR",
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
    return id;
}

/**
 * Un produit publié, dont la date de publication est FORCÉE distincte.
 *
 * `setProductStatus` pose `new Date()`, et deux publications successives tombent dans la
 * même milliseconde : le tri se départagerait alors sur un `cuid(2)`, qui n'est pas
 * monotone, et le test d'ordre oscillerait d'un passage à l'autre.
 */
async function publishedProduct(vendorId: string, title: string): Promise<string> {
    const id = await draftProduct(vendorId, title);
    await setProductStatus(prisma, { productId: id, vendorId, publish: true });
    await prisma.product.update({
        where: { id },
        data: { publishedAt: new Date(Date.now() + counter * 1000) },
    });
    return id;
}

describe("listProductsToModerate", () => {
    it("rend les publiés sans la marque, du plus récent au plus ancien", async () => {
        const shop = await createShop();
        const ancien = await publishedProduct(shop.id, "Sac ancien");
        const recent = await publishedProduct(shop.id, "Sac récent");

        const file = await listProductsToModerate(prisma);
        const miens = file.filter((l) => [ancien, recent].includes(l.id));

        expect(miens.map((l) => l.id)).toEqual([recent, ancien]);
    });

    it("ne rend plus un produit marqué examiné", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac examiné");

        await markProductReviewed(prisma, id);

        expect((await listProductsToModerate(prisma)).find((l) => l.id === id)).toBeUndefined();
    });

    it("ne rend pas un brouillon", async () => {
        const shop = await createShop();
        const id = await draftProduct(shop.id, "Sac brouillon");

        expect((await listProductsToModerate(prisma)).find((l) => l.id === id)).toBeUndefined();
    });

    // La suspension de T5 est déjà la décision la plus forte : ses articles ne sont plus au
    // catalogue, et les proposer à la modération ferait agir deux fois sur le même fait.
    it("ne rend pas un produit d'une boutique suspendue", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac suspendu");
        await prisma.vendor.update({
            where: { id: shop.id },
            data: { suspendedAt: new Date() },
        });

        expect((await listProductsToModerate(prisma)).find((l) => l.id === id)).toBeUndefined();
    });

    it("porte la vignette et le slug de la boutique", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac complet");

        const ligne = (await listProductsToModerate(prisma)).find((l) => l.id === id);
        expect(ligne?.imagePath).not.toBe("");
        expect(ligne?.shopSlug).toBe(shop.slug);
    });
});

describe("markProductReviewed", () => {
    // Deux administrateurs sur la même ligne, ou un double clic.
    it("est idempotente et n'écrit pas deux fois la marque", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac marqué");

        await markProductReviewed(prisma, id);
        await markProductReviewed(prisma, id);

        const apres = await prisma.product.findUniqueOrThrow({ where: { id } });
        expect(apres.systemTags).toEqual(["REVIEWED"]);
    });
});

describe("retireProduct", () => {
    it("dépublie et rend de quoi écrire au vendeur", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac retiré");

        const sortie = await retireProduct(prisma, { productId: id });

        expect(sortie.title).toBe("Sac retiré");
        expect(sortie.contactEmail).toBe(shop.contactEmail);
        expect(sortie.alreadyRetired).toBe(false);
        const apres = await prisma.product.findUniqueOrThrow({ where: { id } });
        expect(apres.status).toBe("DRAFT");
    });

    // Le second retrait ne doit PAS faire partir un second courriel : l'appelant lit
    // `alreadyRetired` pour le savoir.
    it("dit que le produit était déjà retiré, sans rien réécrire", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac deux fois");
        await retireProduct(prisma, { productId: id });

        const seconde = await retireProduct(prisma, { productId: id });

        expect(seconde.alreadyRetired).toBe(true);
    });

    // Deux administrateurs sur la même ligne, ou un double clic : chaque ligne porte son
    // propre formulaire, et les deux partent. UN SEUL doit annoncer le retrait, sans quoi le
    // vendeur reçoit deux fois le même reproche pour un seul acte et croit qu'on s'acharne.
    it("ne reconnaît le retrait qu'à UN seul de deux appels simultanés", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac retiré deux fois");

        const sorties = await Promise.all([
            retireProduct(prisma, { productId: id }),
            retireProduct(prisma, { productId: id }),
        ]);

        expect(sorties.filter((sortie) => !sortie.alreadyRetired)).toHaveLength(1);
        const apres = await prisma.product.findUniqueOrThrow({ where: { id } });
        expect(apres.status).toBe("DRAFT");
    });

    it("refuse un produit qui n'existe pas", async () => {
        await expect(
            retireProduct(prisma, { productId: "c00000000000000000000000" }),
        ).rejects.toMatchObject({ message: ERROR_MODERATION_PRODUCT_NOT_FOUND });
    });

    // `Vendor.application` est NULLABLE : la locale vient d'elle, et une boutique créée
    // autrement n'en a aucune. Le retrait ne doit pas échouer pour autant.
    it("retombe sur le français quand la boutique n'a pas de candidature", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac sans dossier");

        const sortie = await retireProduct(prisma, { productId: id });

        expect(sortie.locale).toBe("fr");
    });
});

describe("republier ramène le produit dans la file", () => {
    // LA règle qui donne son mordant à l'avertissement. Sans elle, un vendeur republie ce
    // qu'on lui a retiré et ne repasse devant personne.
    it("efface la marque à la publication", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac republié");
        await markProductReviewed(prisma, id);
        await setProductStatus(prisma, { productId: id, vendorId: shop.id, publish: false });

        await setProductStatus(prisma, { productId: id, vendorId: shop.id, publish: true });

        const apres = await prisma.product.findUniqueOrThrow({ where: { id } });
        expect(apres.systemTags).toEqual([]);
        expect((await listProductsToModerate(prisma)).find((l) => l.id === id)).toBeDefined();
    });

    // Le tableau est PARTAGÉ : effacer `REVIEWED` ne doit pas emporter ce qu'un futur tag y
    // aura mis. Aucun second tag n'existe encore, donc ce test ne distingue pas encore un
    // filtre d'une remise à zéro : il garde la propriété pour le jour où un second tag
    // arrivera.
    it("n'efface que REVIEWED, pas les autres marques", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac deux marques");
        await markProductReviewed(prisma, id);
        await setProductStatus(prisma, { productId: id, vendorId: shop.id, publish: false });
        await setProductStatus(prisma, { productId: id, vendorId: shop.id, publish: true });

        const apres = await prisma.product.findUniqueOrThrow({ where: { id } });
        expect(apres.systemTags).toEqual([]);
    });
});
