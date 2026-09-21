import {
    ERROR_PRODUCT_SLUG_TAKEN,
    countProductsForVendor,
    createProduct,
    listProductsForVendor,
    prisma,
    readProductForVendor,
    saveProduct,
    setProductStatus,
    setShopCurrency,
} from "@clemperl/db";

const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";

// Les suites partagent une seule base et un seul run. Un préfixe propre au fichier, et
// non un simple compteur : `Vendor.slug` est unique, et deux suites qui nomment leurs
// boutiques pareil se marchent dessus — la panne se lit alors dans la suite VOISINE.
const PREFIX = "repo-product";
let counter = 0;

async function createShop(): Promise<string> {
    counter += 1;
    const vendor = await prisma.vendor.create({
        data: {
            slug: `${PREFIX}-shop-${counter}`,
            shopName: "Atelier Lumière",
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: "contact@atelier.test",
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: "Atelier Lumière SRL",
            registrationNumber: "0123456789",
            country: "BE",
            currency: "EUR",
        },
    });
    return vendor.id;
}

async function createTeeShirt(vendorId: string): Promise<string> {
    counter += 1;
    const { id } = await createProduct(prisma, {
        vendorId,
        slug: `${PREFIX}-tee-${counter}`,
        title: "Tee-shirt",
        description: DESCRIPTION,
        priceAmount: 4900,
    });
    return id;
}

describe("createProduct", () => {
    it("crée un brouillon avec exactement une variante", async () => {
        const vendorId = await createShop();
        const productId = await createTeeShirt(vendorId);

        const product = await readProductForVendor(prisma, { productId, vendorId });
        expect(product?.status).toBe("DRAFT");
        expect(product?.variants).toHaveLength(1);
        expect(product?.variants[0]?.combinationKey).toBe("");
        expect(product?.variants[0]?.priceAmount).toBe(4900);
    });
});

// LE test de sécurité de la tranche. Le `productId` vient de l'URL : sans le filtre sur
// `vendorId`, un vendeur lit et corrige le catalogue d'un autre en changeant un chiffre.
describe("l'isolation entre boutiques", () => {
    it("ne lit pas le produit d'une autre boutique", async () => {
        const mine = await createShop();
        const theirs = await createShop();
        const productId = await createTeeShirt(theirs);

        expect(await readProductForVendor(prisma, { productId, vendorId: mine })).toBeNull();
    });

    it("ne publie pas le produit d'une autre boutique", async () => {
        const mine = await createShop();
        const theirs = await createShop();
        const productId = await createTeeShirt(theirs);

        await setProductStatus(prisma, { productId, vendorId: mine, publish: true });

        const after = await readProductForVendor(prisma, { productId, vendorId: theirs });
        expect(after?.status).toBe("DRAFT");
    });

    it("ne corrige pas le produit d'une autre boutique", async () => {
        const mine = await createShop();
        const theirs = await createShop();
        const productId = await createTeeShirt(theirs);

        await expect(
            saveProduct(prisma, {
                productId,
                vendorId: mine,
                title: "Détourné",
                slug: "detourne",
                description: DESCRIPTION,
                options: [],
                variants: [{ selections: {}, priceAmount: 1, position: 0 }],
            }),
        ).rejects.toThrow(/PRODUCT_NOT_FOUND/);

        const after = await readProductForVendor(prisma, { productId, vendorId: theirs });
        expect(after?.title).toBe("Tee-shirt");
    });
});

describe("saveProduct", () => {
    it("écrit une grille de trois variantes avec leurs valeurs", async () => {
        const vendorId = await createShop();
        const productId = await createTeeShirt(vendorId);

        await saveProduct(prisma, {
            productId,
            vendorId,
            title: "Tee-shirt",
            slug: `${PREFIX}-tee-grille`,
            description: DESCRIPTION,
            options: [{ name: "Taille", values: ["S", "M", "L"] }],
            variants: [
                { selections: { Taille: "S" }, priceAmount: 4900, position: 0 },
                { selections: { Taille: "M" }, priceAmount: 4900, position: 1 },
                { selections: { Taille: "L" }, priceAmount: 5500, position: 2 },
            ],
        });

        const product = await readProductForVendor(prisma, { productId, vendorId });
        expect(product?.variants).toHaveLength(3);
        expect(product?.variants.map((variant) => variant.priceAmount)).toEqual([4900, 4900, 5500]);
        expect(product?.variants[2]?.values[0]?.optionValue.label).toBe("L");
        // Chaque variante porte une clé distincte, dérivée d'identifiants réels.
        expect(new Set(product?.variants.map((variant) => variant.combinationKey)).size).toBe(3);
    });

    it("retirer une valeur supprime ses variantes, et jamais les autres", async () => {
        const vendorId = await createShop();
        const productId = await createTeeShirt(vendorId);
        const base = {
            productId,
            vendorId,
            title: "Tee-shirt",
            slug: `${PREFIX}-tee-slug`,
            description: DESCRIPTION,
        };

        await saveProduct(prisma, {
            ...base,
            options: [{ name: "Taille", values: ["S", "M"] }],
            variants: [
                { selections: { Taille: "S" }, priceAmount: 4900, position: 0 },
                { selections: { Taille: "M" }, priceAmount: 5100, position: 1 },
            ],
        });
        await saveProduct(prisma, {
            ...base,
            options: [{ name: "Taille", values: ["S"] }],
            variants: [{ selections: { Taille: "S" }, priceAmount: 4900, position: 0 }],
        });

        const product = await readProductForVendor(prisma, { productId, vendorId });
        expect(product?.variants).toHaveLength(1);
        expect(product?.variants[0]?.values[0]?.optionValue.label).toBe("S");
        expect(product?.variants[0]?.priceAmount).toBe(4900);
    });

    it("retomber à zéro axe ramène à une variante unique et sans valeur", async () => {
        const vendorId = await createShop();
        const productId = await createTeeShirt(vendorId);
        const base = {
            productId,
            vendorId,
            title: "Tee-shirt",
            slug: `${PREFIX}-tee-slug`,
            description: DESCRIPTION,
        };

        await saveProduct(prisma, {
            ...base,
            options: [{ name: "Taille", values: ["S", "M"] }],
            variants: [
                { selections: { Taille: "S" }, priceAmount: 4900, position: 0 },
                { selections: { Taille: "M" }, priceAmount: 5100, position: 1 },
            ],
        });
        await saveProduct(prisma, {
            ...base,
            options: [],
            variants: [{ selections: {}, priceAmount: 4900, position: 0 }],
        });

        const product = await readProductForVendor(prisma, { productId, vendorId });
        expect(product?.variants).toHaveLength(1);
        expect(product?.variants[0]?.combinationKey).toBe("");
        expect(product?.options).toHaveLength(0);
    });

    // Une écriture partielle laisserait un produit sans variante. La transaction doit
    // tout défaire, y compris la suppression déjà faite en son début.
    it("ne laisse aucun produit sans variante quand l'écriture échoue", async () => {
        const vendorId = await createShop();
        const productId = await createTeeShirt(vendorId);

        await expect(
            saveProduct(prisma, {
                productId,
                vendorId,
                title: "Tee-shirt",
                slug: `${PREFIX}-tee-rollback`,
                description: DESCRIPTION,
                options: [{ name: "Taille", values: ["S"] }],
                // Deux variantes de même combinaison : la base refuse la seconde, après
                // que la première a été écrite.
                variants: [
                    { selections: { Taille: "S" }, priceAmount: 4900, position: 0 },
                    { selections: { Taille: "S" }, priceAmount: 5100, position: 1 },
                ],
            }),
        ).rejects.toThrow();

        const product = await readProductForVendor(prisma, { productId, vendorId });
        expect(product?.variants).toHaveLength(1);
        expect(product?.variants[0]?.combinationKey).toBe("");
    });
});

describe("setShopCurrency", () => {
    it("enregistre la devise tant qu'aucun produit n'existe", async () => {
        const vendorId = await createShop();
        await setShopCurrency(prisma, { vendorId, currency: "XOF" });

        const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
        expect(vendor?.currency).toBe("XOF");
    });

    // Sans ce refus, `10000` passerait de dix mille francs CFA à cent euros sur tout le
    // catalogue, sans erreur et sans trace.
    it("refuse dès qu'un produit existe", async () => {
        const vendorId = await createShop();
        await createTeeShirt(vendorId);

        await expect(setShopCurrency(prisma, { vendorId, currency: "XOF" })).rejects.toThrow(
            /CURRENCY_LOCKED/,
        );

        const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
        expect(vendor?.currency).toBe("EUR");
        expect(await countProductsForVendor(prisma, vendorId)).toBe(1);
    });
});

describe("listProductsForVendor", () => {
    it("ne rend que les produits de la boutique", async () => {
        const mine = await createShop();
        const theirs = await createShop();
        await createTeeShirt(mine);
        await createTeeShirt(theirs);

        const list = await listProductsForVendor(prisma, mine);
        expect(list).toHaveLength(1);
        expect(list[0]?.vendorId).toBe(mine);
    });

    it("ignore un produit supprimé", async () => {
        const vendorId = await createShop();
        const productId = await createTeeShirt(vendorId);
        await prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date() } });

        expect(await listProductsForVendor(prisma, vendorId)).toHaveLength(0);
        expect(await readProductForVendor(prisma, { productId, vendorId })).toBeNull();
    });
});

describe("le slug d'un produit", () => {
    it("suit le titre tant que le produit n'a jamais été publié", async () => {
        const vendorId = await createShop();
        const productId = await createTeeShirt(vendorId);

        await saveProduct(prisma, {
            productId,
            vendorId,
            title: "Tee-shirt en lin",
            slug: `${PREFIX}-tee-shirt-en-lin`,
            description: DESCRIPTION,
            options: [],
            variants: [{ selections: {}, priceAmount: 4900, position: 0 }],
        });

        const product = await readProductForVendor(prisma, { productId, vendorId });
        expect(product?.slug).toBe(`${PREFIX}-tee-shirt-en-lin`);
    });

    // Le slug est parti dans une URL publique : une URL qui bouge est une URL cassée.
    it("ne bouge plus après la première publication", async () => {
        const vendorId = await createShop();
        const productId = await createTeeShirt(vendorId);
        const avant = (await readProductForVendor(prisma, { productId, vendorId }))?.slug;

        await setProductStatus(prisma, { productId, vendorId, publish: true });
        await setProductStatus(prisma, { productId, vendorId, publish: false });

        await saveProduct(prisma, {
            productId,
            vendorId,
            title: "Un tout autre titre",
            slug: `${PREFIX}-un-tout-autre-titre`,
            description: DESCRIPTION,
            options: [],
            variants: [{ selections: {}, priceAmount: 4900, position: 0 }],
        });

        const product = await readProductForVendor(prisma, { productId, vendorId });
        expect(product?.slug).toBe(avant);
    });

    // « Réessayez » enverrait le vendeur reproduire exactement le même slug.
    it("signale un titre déjà pris plutôt qu'une panne", async () => {
        const vendorId = await createShop();
        const slug = `${PREFIX}-doublon`;
        const commun = { vendorId, slug, description: DESCRIPTION, priceAmount: 4900 };

        await createProduct(prisma, { ...commun, title: "Sac cabas" });

        await expect(createProduct(prisma, { ...commun, title: "Sac cabas" })).rejects.toThrow(
            ERROR_PRODUCT_SLUG_TAKEN,
        );
    });
});
