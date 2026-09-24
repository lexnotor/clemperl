import type { PrismaClient } from "../../generated/prisma/client.js";

export const ERROR_IMAGE_NOT_FOUND = "IMAGE_NOT_FOUND";
export const ERROR_POSITION_TAKEN = "IMAGE_POSITION_TAKEN";

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: unknown }).code === "P2002"
    );
}

// TOUTE fonction porte `vendorId` et filtre par la boutique du produit. `imageId` et
// `productId` viennent de l'URL ou du formulaire, donc du client : sans ce filtre, un
// vendeur manipule les images d'un autre en changeant un identifiant. La garantie est
// dans la SIGNATURE — une vérification à l'entrée s'oublie au prochain appelant.
export async function listImagesForProduct(
    prisma: PrismaClient,
    input: { productId: string; vendorId: string },
) {
    return prisma.productImage.findMany({
        where: { productId: input.productId, product: { vendorId: input.vendorId } },
        orderBy: { position: "asc" },
    });
}

// L'objet est déposé AVANT que la ligne soit écrite : c'est ce qui permet de savoir que
// le transfert a abouti. Mais `createPendingImage` ne vérifie l'appartenance qu'ensuite,
// donc un `productId` étranger glissé dans le formulaire faisait écrire des octets dans
// le bucket, effacés après coup par la compensation. Cette lecture refuse AVANT de payer
// le transfert.
export async function productIsOwnedBy(
    prisma: PrismaClient,
    input: { productId: string; vendorId: string },
): Promise<boolean> {
    const product = await prisma.product.findFirst({
        where: { id: input.productId, vendorId: input.vendorId, deletedAt: null },
        select: { id: true },
    });
    return product !== null;
}

export async function readImageForVendor(
    prisma: PrismaClient,
    input: { imageId: string; vendorId: string },
) {
    return prisma.productImage.findFirst({
        where: { id: input.imageId, product: { vendorId: input.vendorId } },
    });
}

// L'objet est déposé d'abord, cette ligne ensuite, et l'appelant supprime l'objet si
// l'écriture échoue. L'ordre tient parce que le fichier traverse le serveur : on SAIT si
// le transfert a abouti, ce qu'un dépôt direct depuis le navigateur ne permettait pas.
//
// L'appartenance est revérifiée ICI, dans la transaction, bien que l'appelant l'ait déjà
// lue avant de déposer : la sienne sert à ne pas payer un transfert pour rien, celle-ci
// est la garantie.
export async function createPendingImage(
    prisma: PrismaClient,
    input: { productId: string; vendorId: string; objectPath: string; originalName: string },
): Promise<{ id: string; position: number }> {
    return prisma.$transaction(async (tx) => {
        const product = await tx.product.findFirst({
            where: { id: input.productId, vendorId: input.vendorId, deletedAt: null },
            select: { id: true },
        });
        if (!product) {
            throw new Error(ERROR_IMAGE_NOT_FOUND);
        }

        const last = await tx.productImage.findFirst({
            where: { productId: input.productId },
            orderBy: { position: "desc" },
            select: { position: true },
        });

        try {
            return await tx.productImage.create({
                data: {
                    productId: input.productId,
                    objectPath: input.objectPath,
                    originalName: input.originalName,
                    position: (last?.position ?? -1) + 1,
                },
                select: { id: true, position: true },
            });
        } catch (error) {
            // Deux dépôts simultanés lisent la même dernière position et visent la même
            // suivante. Le second est refusé par la base ; le distinguer permet de dire
            // au vendeur de recommencer plutôt que de lui montrer une panne.
            if (isUniqueViolation(error)) {
                throw new Error(ERROR_POSITION_TAKEN, { cause: error });
            }
            throw error;
        }
    });
}

// Appelées par le WORKER, qui n'a pas de `vendorId` : il travaille sur un identifiant
// reçu de la file, pas d'un client. C'est la seule exception à la règle ci-dessus, et
// elle tient parce que rien d'autre que le worker n'empile sur cette file.
export async function markImageReady(
    prisma: PrismaClient,
    input: { imageId: string; width: number; height: number },
): Promise<void> {
    await prisma.productImage.update({
        where: { id: input.imageId },
        data: {
            status: "READY",
            width: input.width,
            height: input.height,
            // La raison d'un échec précédent est effacée : une relance réussie ne doit
            // pas laisser le vendeur devant un message qui ne vaut plus.
            failureReason: null,
        },
    });
}

export async function markImageFailed(
    prisma: PrismaClient,
    input: { imageId: string; reason: string },
): Promise<void> {
    await prisma.productImage.update({
        where: { id: input.imageId },
        data: { status: "FAILED", failureReason: input.reason },
    });
}

// Rend le chemin pour que l'appelant supprime les objets APRÈS le commit. Supprimer
// avant laisserait, si la transaction échouait, une ligne pointant vers le vide.
export async function deleteImage(
    prisma: PrismaClient,
    input: { imageId: string; vendorId: string },
): Promise<{ objectPath: string } | null> {
    return prisma.$transaction(async (tx) => {
        const image = await tx.productImage.findFirst({
            where: { id: input.imageId, product: { vendorId: input.vendorId } },
            select: { id: true, objectPath: true },
        });
        if (!image) {
            return null;
        }
        await tx.productImage.delete({ where: { id: image.id } });
        return { objectPath: image.objectPath };
    });
}

export async function setImageAltText(
    prisma: PrismaClient,
    input: { imageId: string; vendorId: string; altText: string | null },
): Promise<void> {
    await prisma.productImage.updateMany({
        where: { id: input.imageId, product: { vendorId: input.vendorId } },
        data: { altText: input.altText },
    });
}

// PostgreSQL vérifie l'unicité à CHAQUE instruction, pas en fin de transaction. Échanger
// deux positions par deux `UPDATE` successifs viole donc la contrainte au premier, alors
// que l'état final serait valide. D'où le décalage en deux temps : toutes les positions
// hors de la plage occupée, puis réécrites à leurs valeurs finales.
const REORDER_OFFSET = 1000;

export async function reorderImages(
    prisma: PrismaClient,
    input: { productId: string; vendorId: string; orderedIds: readonly string[] },
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const existing = await tx.productImage.findMany({
            where: { productId: input.productId, product: { vendorId: input.vendorId } },
            select: { id: true },
        });
        const known = new Set(existing.map((image) => image.id));

        // Un ordre partiel laisserait des images sans position, et un ordre contenant une
        // image étrangère la déplacerait hors de sa boutique. On exige la liste complète,
        // et rien d'autre dedans.
        if (
            input.orderedIds.length !== known.size ||
            input.orderedIds.some((id) => !known.has(id))
        ) {
            throw new Error(ERROR_IMAGE_NOT_FOUND);
        }

        for (const [index, id] of input.orderedIds.entries()) {
            await tx.productImage.update({
                where: { id },
                data: { position: index + REORDER_OFFSET },
            });
        }
        for (const [index, id] of input.orderedIds.entries()) {
            await tx.productImage.update({ where: { id }, data: { position: index } });
        }
    });
}
