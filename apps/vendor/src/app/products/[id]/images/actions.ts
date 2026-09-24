"use server";

import { deleteMediaPrefix, redisConnectionOptions, uploadMedia } from "@clemperl/core";
import {
    ERROR_LAST_IMAGE_PUBLISHED,
    ERROR_POSITION_TAKEN,
    createPendingImage,
    deleteImage,
    markImageFailed,
    prisma,
    productIsOwnedBy,
    readImageForVendor,
    reorderImages,
    setImageAltText,
} from "@clemperl/db";
import {
    IMAGE_FAILURE,
    buildOriginalPath,
    isAcceptedImageType,
    isRetryableImageFailure,
    mediaPrefix,
} from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { Queue } from "bullmq";
import { revalidatePath } from "next/cache";
import { requireVendorMembership } from "../../../../lib/session";

// UNE file, ouverte une fois pour le processus. Un `new Queue` par appel ouvrirait une
// connexion Redis par requête, et Redis finirait par les refuser.
let queue: Queue | undefined;

function productImageQueue(): Queue {
    if (!queue) {
        const url = process.env["REDIS_URL"];
        if (!url) {
            throw new Error("REDIS_URL est absente : la file des médias est injoignable.");
        }
        // L'URL est lue ENTIÈREMENT — identifiants, index de base, TLS. N'en garder que
        // l'hôte et le port marche en développement, où Redis est nu, et échoue au
        // premier déploiement contre un Redis géré.
        queue = new Queue("product-images", { connection: redisConnectionOptions(url) });
    }
    return queue;
}

// Trois tentatives avec attente croissante : une panne de stockage passagère ne doit pas
// condamner une image, et un fichier illisible ne doit pas être retenté indéfiniment —
// c'est le worker qui tranche entre les deux, pas la file.
// `removeOn*` : sans elles, BullMQ garde CHAQUE job terminé dans Redis, indéfiniment.
// Une boutique active y laisserait des dizaines de milliers d'entrées qu'aucun code ne
// relit — Redis vit en mémoire, et c'est ainsi qu'il finit par la remplir.
//
// Mille échecs conservés : assez pour regarder ce qui s'est passé, borné pour ne pas
// croître sans fin.
const JOB_OPTIONS = {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: 1000,
} as const;

// Le fichier traverse ce serveur. C'est le coût assumé du retour à ce chemin : le
// stockage n'expose aucun en-tête CORS — sa source porte « kong should take care of
// cors », la ligne d'enregistrement est commentée — donc un dépôt direct depuis le
// navigateur est impossible sans placer un proxy devant lui.
//
// L'ordre est celui que T1b a éprouvé pour les justificatifs : l'objet d'abord, la ligne
// ensuite, et la suppression de l'objet en compensation si la ligne échoue. Ici on SAIT
// si le dépôt a abouti, ce que le dépôt direct ne permettait pas — la ligne `PENDING`
// sans objet n'a donc plus lieu d'être.
export async function uploadProductImage(
    productId: string,
    form: FormData,
): Promise<{ imageId: string } | { error: string }> {
    // La garde est rappelée ICI : une action serveur est une route publique, et la page
    // qui l'a rendue ne la protège pas.
    const { vendor } = await requireVendorMembership();

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
        return { error: messages.errors.imageUploadFailed };
    }

    // Une LISTE BLANCHE, et non « ça commence par image/ » : `image/svg+xml` satisfait le
    // préfixe, sharp le décline sans se plaindre, et un SVG est un document qui exécute
    // du script. Le type déclaré ne prouve rien — le worker redécode et tranche — mais ce
    // contrôle-ci écarte l'évidence avant de payer un transfert.
    if (!isAcceptedImageType(file.type)) {
        return { error: messages.errors.imageNotAnImage };
    }

    // L'appartenance se lit AVANT le dépôt. `createPendingImage` la revérifie, mais dans
    // la transaction — donc après que les octets sont écrits. Sans cette lecture, un
    // `productId` étranger glissé dans le formulaire faisait payer un transfert à la
    // boutique d'un autre, que la compensation effaçait ensuite.
    if (!(await productIsOwnedBy(prisma, { productId, vendorId: vendor.id }))) {
        return { error: messages.errors.imageUploadFailed };
    }

    const objectPath = buildOriginalPath(productId, file.name);

    try {
        await uploadMedia(objectPath, await file.arrayBuffer(), file.type);
    } catch (error) {
        console.error("uploadProductImage", error);
        return { error: messages.errors.imageUploadFailed };
    }

    let image: { id: string };
    try {
        image = await createPendingImage(prisma, {
            productId,
            vendorId: vendor.id,
            objectPath,
            originalName: file.name,
        });
    } catch (error) {
        console.error("createPendingImage", error);
        // Compensation : sans ligne, l'objet n'est réclamé par personne.
        await deleteMediaPrefix(mediaPrefix(objectPath));
        const taken = error instanceof Error && error.message === ERROR_POSITION_TAKEN;
        return {
            error: taken ? messages.errors.imagePositionTaken : messages.errors.imageUploadFailed,
        };
    }

    // La ligne est COMMITÉE avant cet appel. Si Redis est injoignable, `add` lève et
    // aucun job n'existe : le relais `failed` du worker ne tournera jamais, et la ligne
    // resterait `PENDING` pour toujours, interrogée toutes les deux secondes, sans raison
    // affichée et sans « Réessayer » — le vendeur n'aurait plus qu'à la supprimer.
    //
    // La marquer ici la rend relançable : l'original est en place, c'est la file qui a
    // manqué.
    try {
        await productImageQueue().add("process", { imageId: image.id }, JOB_OPTIONS);
    } catch (error) {
        console.error("productImageQueue.add", error);
        await markImageFailed(prisma, {
            imageId: image.id,
            reason: IMAGE_FAILURE.processingFailed,
        });
        revalidatePath(`/products/${productId}`);
        return { error: messages.errors.imageUploadFailed };
    }

    revalidatePath(`/products/${productId}`);
    return { imageId: image.id };
}

export async function retryImage(imageId: string): Promise<void> {
    const { vendor } = await requireVendorMembership();
    const image = await readImageForVendor(prisma, { imageId, vendorId: vendor.id });
    if (!image) {
        return;
    }

    // Relancer n'a de sens que si l'original est encore là. Le worker le supprime dès
    // qu'il REFUSE une image, donc la relancer la remettrait en attente pour la voir
    // échouer autrement — « objet absent » au lieu de « illisible ». L'écran ne propose
    // déjà plus le bouton dans ces cas ; ici on refuse aussi l'appel direct, parce qu'une
    // action serveur est une route publique.
    if (!isRetryableImageFailure(image.failureReason)) {
        return;
    }

    // Remise en attente AVANT d'empiler : sinon l'écran montrerait encore l'échec
    // pendant que le worker travaille, et le vendeur relancerait une seconde fois.
    await prisma.productImage.update({
        where: { id: imageId },
        data: { status: "PENDING", failureReason: null },
    });

    // Même raison qu'au dépôt : la ligne vient de repasser en attente, et un `add` qui
    // lève la laisserait dans cet état sans job pour l'en sortir.
    try {
        await productImageQueue().add("process", { imageId }, JOB_OPTIONS);
    } catch (error) {
        console.error("productImageQueue.add", error);
        await markImageFailed(prisma, { imageId, reason: IMAGE_FAILURE.processingFailed });
    }

    revalidatePath(`/products/${image.productId}`);
}

// Rend une erreur au lieu de `void` : le dépôt refuse de retirer la dernière photo d'une
// fiche en ligne, et un bouton qui ne fait rien sans dire pourquoi est indiscernable
// d'une panne.
export async function removeImage(
    imageId: string,
    productId: string,
): Promise<{ error: string } | null> {
    const { vendor } = await requireVendorMembership();

    let removed: { objectPath: string } | null;
    try {
        removed = await deleteImage(prisma, { imageId, vendorId: vendor.id });
    } catch (error) {
        console.error("removeImage", error);
        const derniere = error instanceof Error && error.message === ERROR_LAST_IMAGE_PUBLISHED;
        return { error: derniere ? messages.errors.imageLastPublished : messages.errors.failed };
    }

    if (removed) {
        // APRÈS le commit : supprimer avant laisserait, si la transaction échouait, une
        // ligne pointant vers le vide.
        await deleteMediaPrefix(mediaPrefix(removed.objectPath));
    }
    revalidatePath(`/products/${productId}`);
    return null;
}

export async function reorderProductImages(
    productId: string,
    orderedIds: string[],
): Promise<void> {
    const { vendor } = await requireVendorMembership();
    try {
        await reorderImages(prisma, { productId, vendorId: vendor.id, orderedIds });
    } catch (error) {
        // Un ordre refusé ne casse rien : la page se re-rend avec l'ordre réel, et c'est
        // ce que le vendeur verra.
        console.error("reorderProductImages", error);
    }
    revalidatePath(`/products/${productId}`);
}

export async function saveImageAltText(
    imageId: string,
    productId: string,
    altText: string,
): Promise<void> {
    const { vendor } = await requireVendorMembership();

    // Une chaîne vide est une ABSENCE, pas un texte : `alt=""` et `alt` manquant ne
    // disent pas la même chose à un lecteur d'écran.
    await setImageAltText(prisma, {
        imageId,
        vendorId: vendor.id,
        altText: altText.trim() === "" ? null : altText.trim(),
    });
    revalidatePath(`/products/${productId}`);
}
