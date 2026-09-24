import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readMedia, uploadMedia } from "@clemperl/core";
import { createPendingImage, prisma } from "@clemperl/db";
import { buildOriginalPath, derivativePath } from "@clemperl/domain";
import { Test } from "@nestjs/testing";
import { ProductImageProcessor } from "../src/modules/media/processors/product-image.processor";
import { ImageDerivativesService } from "../src/modules/media/services/image-derivatives.service";

// LA couche qui compte pour cette tranche. sharp est un binaire natif et le stockage un
// service réseau : rien de ce qu'ils font ne se simule utilement, et c'est précisément
// ici que T2c peut casser sans que rien d'autre ne le voie.
const FIXTURES = join(__dirname, "fixtures");
const PREFIX = "image-worker";
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
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
        },
    });
    return { vendorId: vendor.id, productId: product.id };
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
}

describe("le worker, contre un vrai stockage", () => {
    let processor: ProductImageProcessor;

    beforeAll(async () => {
        // Le processeur est instancié SANS sa file : `process` est une méthode ordinaire,
        // et l'appeler directement éprouve le traitement sans dépendre de Redis ni de
        // l'ordonnancement de BullMQ.
        const module = await Test.createTestingModule({
            providers: [ImageDerivativesService, ProductImageProcessor],
        }).compile();
        processor = module.get(ProductImageProcessor);
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    async function depose(fixture: string, extension: string) {
        const { productId, vendorId } = await createShopWithProduct();
        const objectPath = buildOriginalPath(productId, `photo.${extension}`);
        const content = await readFile(join(FIXTURES, fixture));
        await uploadMedia(objectPath, toArrayBuffer(content), "application/octet-stream");

        const image = await createPendingImage(prisma, {
            productId,
            vendorId,
            objectPath,
            originalName: `photo.${extension}`,
        });
        return { imageId: image.id, objectPath, productId };
    }

    it("produit les trois déclinaisons et bascule en READY", async () => {
        const { imageId, objectPath } = await depose("photo.jpg", "jpg");

        await processor.process({ data: { imageId } } as never);

        const after = await prisma.productImage.findUnique({ where: { id: imageId } });
        expect(after?.status).toBe("READY");
        expect(after?.width).toBe(1200);
        expect(after?.height).toBe(800);
        expect(after?.failureReason).toBeNull();

        // Les trois existent RÉELLEMENT dans le bucket : `READY` ne doit jamais être une
        // promesse, c'est la garantie sur laquelle T2d s'appuiera sans rien vérifier.
        for (const width of [320, 800, 1600]) {
            const blob = await readMedia(derivativePath(objectPath, width));
            expect(blob.size).toBeGreaterThan(0);
        }
    });

    it("marque FAILED et supprime l'objet quand le fichier n'est pas une image", async () => {
        const { imageId, objectPath } = await depose("not-an-image.txt", "jpg");

        await processor.process({ data: { imageId } } as never);

        const after = await prisma.productImage.findUnique({ where: { id: imageId } });
        expect(after?.status).toBe("FAILED");
        expect(after?.failureReason).toBe("unreadable");

        // Un fichier dont on SAIT qu'il ne servira jamais n'a pas à occuper d'espace.
        await expect(readMedia(objectPath)).rejects.toThrow();
    });

    // 8000 × 8000 en 75 Ko : le fichier passe le plafond de taille du stockage, et c'est
    // la décompression qui coûterait des gigaoctets. Le worker partageant son conteneur
    // avec l'API, un OOM ici emporterait les deux.
    it("refuse une image démesurée sans tenter de la décoder", async () => {
        const { imageId, objectPath } = await depose("pixel-bomb.png", "png");

        await processor.process({ data: { imageId } } as never);

        const after = await prisma.productImage.findUnique({ where: { id: imageId } });
        expect(after?.status).toBe("FAILED");
        expect(after?.failureReason).toBe("too_large");
        await expect(readMedia(objectPath)).rejects.toThrow();
    });

    it("refuse une image trop petite pour la plus petite largeur", async () => {
        const { imageId } = await depose("tiny.png", "png");

        await processor.process({ data: { imageId } } as never);

        const after = await prisma.productImage.findUnique({ where: { id: imageId } });
        expect(after?.status).toBe("FAILED");
        expect(after?.failureReason).toBe("too_small");
    });

    // L'objet a disparu entre la confirmation et le traitement. Retenter ne le fera pas
    // revenir : on marque et on s'arrête.
    it("marque FAILED quand l'objet est absent du stockage", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await createPendingImage(prisma, {
            productId,
            vendorId,
            objectPath: buildOriginalPath(productId, "fantome.jpg"),
            originalName: "fantome.jpg",
        });

        await processor.process({ data: { imageId: image.id } } as never);

        const after = await prisma.productImage.findUnique({ where: { id: image.id } });
        expect(after?.status).toBe("FAILED");
        expect(after?.failureReason).toBe("object_missing");
    });

    // Le vendeur a supprimé le produit pendant que le job attendait dans la file. Il n'y
    // a rien à réparer : on s'arrête sans écrire et sans lever.
    it("ne touche à rien quand le produit a été supprimé", async () => {
        const { imageId, productId } = await depose("photo.jpg", "jpg");
        await prisma.product.update({
            where: { id: productId },
            data: { deletedAt: new Date() },
        });

        await processor.process({ data: { imageId } } as never);

        const after = await prisma.productImage.findUnique({ where: { id: imageId } });
        expect(after?.status).toBe("PENDING");
    });

    // Le traitement peut tomber sans que l'image y soit pour rien : stockage injoignable,
    // base coupée. BullMQ retente alors, puis abandonne — et sans ce relais, la ligne
    // resterait `PENDING` POUR TOUJOURS, avec l'écran du vendeur qui l'interroge toutes
    // les deux secondes jusqu'à ce qu'il ferme l'onglet.
    it("marque FAILED quand le job a épuisé ses tentatives", async () => {
        const { imageId } = await depose("photo.jpg", "jpg");

        await processor.onFailed(
            { data: { imageId }, attemptsMade: 3, opts: { attempts: 3 } } as never,
            new Error("stockage injoignable"),
        );

        const after = await prisma.productImage.findUnique({ where: { id: imageId } });
        expect(after?.status).toBe("FAILED");
        expect(after?.failureReason).toBe("processing_failed");
    });

    // Tant qu'il reste une tentative, la ligne ne bouge pas : la marquer en échec ferait
    // lire au vendeur un échec pendant que le worker travaille encore.
    it("laisse la ligne en attente tant qu'il reste une tentative", async () => {
        const { imageId } = await depose("photo.jpg", "jpg");

        await processor.onFailed(
            { data: { imageId }, attemptsMade: 1, opts: { attempts: 3 } } as never,
            new Error("stockage injoignable"),
        );

        const after = await prisma.productImage.findUnique({ where: { id: imageId } });
        expect(after?.status).toBe("PENDING");
    });

    // La ligne a été supprimée pendant que le job attendait. Même raisonnement.
    it("ne lève pas quand la ligne a disparu", async () => {
        const { imageId } = await depose("photo.jpg", "jpg");
        await prisma.productImage.delete({ where: { id: imageId } });

        await expect(processor.process({ data: { imageId } } as never)).resolves.toBeUndefined();
    });
});
