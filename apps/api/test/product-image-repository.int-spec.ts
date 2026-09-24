import {
    ERROR_IMAGE_NOT_FOUND,
    ERROR_NO_READY_IMAGE,
    ERROR_POSITION_TAKEN,
    createPendingImage,
    deleteImage,
    listImagesForProduct,
    markImageFailed,
    markImageReady,
    prisma,
    productIsOwnedBy,
    reorderImages,
    setImageAltText,
    setProductStatus,
} from "@clemperl/db";

const PREFIX = "image-repo";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
let counter = 0;

async function createShopWithProduct(): Promise<{ vendorId: string; productId: string }> {
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
    const product = await prisma.product.create({
        data: {
            vendorId: vendor.id,
            slug: `${PREFIX}-cabas-${counter}`,
            title: "Sac cabas",
            description: DESCRIPTION,
            variants: { create: { priceAmount: 12000, combinationKey: "", position: 0 } },
        },
    });
    return { vendorId: vendor.id, productId: product.id };
}

async function addImage(productId: string, vendorId: string, nth: number) {
    return createPendingImage(prisma, {
        productId,
        vendorId,
        objectPath: `${productId}/0000000${nth}-0000-0000-0000-00000000000${nth}/original.jpg`,
        originalName: `photo-${nth}.jpg`,
    });
}

describe("createPendingImage", () => {
    it("empile les positions dans l'ordre d'arrivée", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        expect((await addImage(productId, vendorId, 1)).position).toBe(0);
        expect((await addImage(productId, vendorId, 2)).position).toBe(1);
    });

    it("naît en attente", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);
        const stored = await prisma.productImage.findUnique({ where: { id: image.id } });
        expect(stored?.status).toBe("PENDING");
    });

    it("refuse un produit d'une autre boutique", async () => {
        const mine = await createShopWithProduct();
        const theirs = await createShopWithProduct();

        await expect(addImage(theirs.productId, mine.vendorId, 1)).rejects.toThrow(
            ERROR_IMAGE_NOT_FOUND,
        );
    });

    // Deux dépôts simultanés lisent la même dernière position et visent la même suivante ;
    // la base en refuse un. Ce qui se teste n'est pas QUI gagne — la course n'est pas
    // déterministe — mais que le perdant produise un refus NOMMÉ, jamais une erreur non
    // traitée qui remonterait au vendeur en 500.
    it("ne produit jamais d'erreur non traitée quand deux dépôts se croisent", async () => {
        const { productId, vendorId } = await createShopWithProduct();

        const issues = await Promise.allSettled(
            [1, 2, 3, 4].map((nth) => addImage(productId, vendorId, nth)),
        );

        for (const issue of issues) {
            if (issue.status === "rejected") {
                expect((issue.reason as Error).message).toBe(ERROR_POSITION_TAKEN);
            }
        }

        // Et celles qui passent ont des positions distinctes : c'est la propriété que la
        // contrainte d'unicité existe pour tenir.
        const images = await listImagesForProduct(prisma, { productId, vendorId });
        expect(new Set(images.map((image) => image.position)).size).toBe(images.length);
    });
});

describe("reorderImages", () => {
    // PostgreSQL vérifie l'unicité à CHAQUE instruction, pas en fin de transaction : sans
    // le décalage en deux temps, cet échange échoue alors que son état final est valide.
    it("échange deux positions sans violer l'unicité", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const first = await addImage(productId, vendorId, 1);
        const second = await addImage(productId, vendorId, 2);

        await reorderImages(prisma, { productId, vendorId, orderedIds: [second.id, first.id] });

        const images = await listImagesForProduct(prisma, { productId, vendorId });
        expect(images.map((image) => image.id)).toEqual([second.id, first.id]);
        expect(images.map((image) => image.position)).toEqual([0, 1]);
    });

    it("refuse un ordre incomplet", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const first = await addImage(productId, vendorId, 1);
        await addImage(productId, vendorId, 2);

        await expect(
            reorderImages(prisma, { productId, vendorId, orderedIds: [first.id] }),
        ).rejects.toThrow(ERROR_IMAGE_NOT_FOUND);
    });

    it("refuse un ordre contenant une image étrangère", async () => {
        const mine = await createShopWithProduct();
        const theirs = await createShopWithProduct();
        const first = await addImage(mine.productId, mine.vendorId, 1);
        const stranger = await addImage(theirs.productId, theirs.vendorId, 2);

        await expect(
            reorderImages(prisma, {
                productId: mine.productId,
                vendorId: mine.vendorId,
                orderedIds: [first.id, stranger.id],
            }),
        ).rejects.toThrow(ERROR_IMAGE_NOT_FOUND);
    });
});

describe("la publication consulte les images", () => {
    it("refuse un produit sans aucune image", async () => {
        const { productId, vendorId } = await createShopWithProduct();

        await expect(
            setProductStatus(prisma, { productId, vendorId, publish: true }),
        ).rejects.toThrow(ERROR_NO_READY_IMAGE);
    });

    it("refuse tant qu'une image attend", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);
        await addImage(productId, vendorId, 2);
        await markImageReady(prisma, { imageId: image.id, width: 1200, height: 800 });

        await expect(
            setProductStatus(prisma, { productId, vendorId, publish: true }),
        ).rejects.toThrow(ERROR_NO_READY_IMAGE);
    });

    it("refuse quand une image a échoué", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);
        await markImageFailed(prisma, { imageId: image.id, reason: "unreadable" });

        await expect(
            setProductStatus(prisma, { productId, vendorId, publish: true }),
        ).rejects.toThrow(ERROR_NO_READY_IMAGE);
    });

    it("accepte quand toutes sont prêtes", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);
        await markImageReady(prisma, { imageId: image.id, width: 1200, height: 800 });

        await setProductStatus(prisma, { productId, vendorId, publish: true });

        const product = await prisma.product.findUnique({ where: { id: productId } });
        expect(product?.status).toBe("PUBLISHED");
    });

    // Dépublier ne regarde rien : on n'empêche personne de retirer sa fiche.
    it("laisse toujours dépublier", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);
        await markImageReady(prisma, { imageId: image.id, width: 1200, height: 800 });
        await setProductStatus(prisma, { productId, vendorId, publish: true });
        await markImageFailed(prisma, { imageId: image.id, reason: "unreadable" });

        await setProductStatus(prisma, { productId, vendorId, publish: false });

        const product = await prisma.product.findUnique({ where: { id: productId } });
        expect(product?.status).toBe("DRAFT");
    });
});

describe("markImageReady", () => {
    it("efface la raison d'un échec précédent", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);
        await markImageFailed(prisma, { imageId: image.id, reason: "unreadable" });

        await markImageReady(prisma, { imageId: image.id, width: 1200, height: 800 });

        const stored = await prisma.productImage.findUnique({ where: { id: image.id } });
        expect(stored?.status).toBe("READY");
        expect(stored?.failureReason).toBeNull();
    });
});

describe("deleteImage", () => {
    it("rend le chemin pour que l'appelant fasse le ménage", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);

        const removed = await deleteImage(prisma, { imageId: image.id, vendorId });
        expect(removed?.objectPath).toContain(productId);
        expect(await listImagesForProduct(prisma, { productId, vendorId })).toHaveLength(0);
    });

    it("ne supprime pas l'image d'une autre boutique", async () => {
        const mine = await createShopWithProduct();
        const theirs = await createShopWithProduct();
        const image = await addImage(theirs.productId, theirs.vendorId, 1);

        expect(await deleteImage(prisma, { imageId: image.id, vendorId: mine.vendorId })).toBeNull();
        expect(
            await listImagesForProduct(prisma, {
                productId: theirs.productId,
                vendorId: theirs.vendorId,
            }),
        ).toHaveLength(1);
    });
});

describe("setImageAltText", () => {
    it("range une chaîne vide comme absence, pas comme texte", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);

        await setImageAltText(prisma, { imageId: image.id, vendorId, altText: null });

        const stored = await prisma.productImage.findUnique({ where: { id: image.id } });
        expect(stored?.altText).toBeNull();
    });

    it("ne touche pas à l'image d'une autre boutique", async () => {
        const mine = await createShopWithProduct();
        const theirs = await createShopWithProduct();
        const image = await addImage(theirs.productId, theirs.vendorId, 1);

        await setImageAltText(prisma, {
            imageId: image.id,
            vendorId: mine.vendorId,
            altText: "détourné",
        });

        const stored = await prisma.productImage.findUnique({ where: { id: image.id } });
        expect(stored?.altText).toBeNull();
    });
});

// L'objet est déposé AVANT que la ligne soit écrite, et c'est `createPendingImage` qui
// vérifie l'appartenance — donc trop tard : un `productId` étranger glissé dans le
// formulaire faisait écrire des octets dans le bucket, que la compensation effaçait
// ensuite. Cette lecture-ci existe pour refuser avant de payer le transfert.
describe("productIsOwnedBy", () => {
    it("reconnaît un produit de la boutique", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        await expect(productIsOwnedBy(prisma, { productId, vendorId })).resolves.toBe(true);
    });

    it("refuse le produit d'une autre boutique", async () => {
        const { productId } = await createShopWithProduct();
        const autre = await createShopWithProduct();
        await expect(
            productIsOwnedBy(prisma, { productId, vendorId: autre.vendorId }),
        ).resolves.toBe(false);
    });

    it("refuse un produit supprimé", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        await prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date() } });
        await expect(productIsOwnedBy(prisma, { productId, vendorId })).resolves.toBe(false);
    });

    it("refuse un identifiant qui n'existe pas", async () => {
        const { vendorId } = await createShopWithProduct();
        await expect(
            productIsOwnedBy(prisma, { productId: "c0000000000000000000000", vendorId }),
        ).resolves.toBe(false);
    });
});
