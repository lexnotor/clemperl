import { deleteMediaPrefix, readMedia, uploadMedia } from "@clemperl/core";
import { markImageFailed, markImageReady, prisma } from "@clemperl/db";
import { IMAGE_FAILURE, derivativePath, mediaPrefix } from "@clemperl/domain";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { PRODUCT_IMAGE_CONCURRENCY, PRODUCT_IMAGE_QUEUE } from "../media.constants";
import { ImageDerivativesService } from "../services/image-derivatives.service";

export interface IProductImageJob {
    imageId: string;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
}

@Processor(PRODUCT_IMAGE_QUEUE, { concurrency: PRODUCT_IMAGE_CONCURRENCY })
export class ProductImageProcessor extends WorkerHost {
    private readonly logger = new Logger(ProductImageProcessor.name);

    constructor(private readonly derivatives: ImageDerivativesService) {
        super();
    }

    async process(job: Job<IProductImageJob>): Promise<void> {
        // Le job ne porte QUE l'identifiant. Y mettre les données les figerait au moment
        // de l'empilage, et le worker les servirait périmées.
        const image = await prisma.productImage.findUnique({
            where: { id: job.data.imageId },
            select: { id: true, objectPath: true, product: { select: { deletedAt: true } } },
        });

        // La ligne peut avoir disparu — le vendeur l'a supprimée pendant que le job
        // attendait — ou son produit être supprimé. Dans les deux cas on s'arrête sans
        // écrire et sans lever : il n'y a rien à réparer, et lever déclencherait trois
        // tentatives inutiles.
        if (!image || image.product.deletedAt !== null) {
            this.logger.log(`Image ${job.data.imageId} sans objet vivant, job ignoré`);
            return;
        }

        let original: Buffer;
        try {
            original = Buffer.from(await (await readMedia(image.objectPath)).arrayBuffer());
        } catch (error) {
            // L'objet manque : le dépôt n'a pas abouti. Retenter ne le fera pas
            // apparaître, donc on marque et on s'arrête.
            this.logger.warn(`Objet absent pour ${image.id}`, error);
            await markImageFailed(prisma, {
                imageId: image.id,
                reason: IMAGE_FAILURE.objectMissing,
            });
            return;
        }

        let result: Awaited<ReturnType<ImageDerivativesService["derive"]>>;
        try {
            result = await this.derivatives.derive(original);
        } catch (error) {
            // Le service lève une CLÉ. On la reprend telle quelle quand on la reconnaît,
            // et on retombe sur « illisible » sinon : une clé inventée n'aurait pas de
            // traduction, et le vendeur lirait une chaîne technique.
            const connues: readonly string[] = Object.values(IMAGE_FAILURE);
            const message = error instanceof Error ? error.message : "";
            const reason = connues.includes(message) ? message : IMAGE_FAILURE.unreadable;

            this.logger.warn(`Image ${image.id} refusée : ${reason}`, error);
            await markImageFailed(prisma, { imageId: image.id, reason });
            // Un fichier dont on SAIT qu'il ne servira jamais n'a pas à occuper d'espace.
            await deleteMediaPrefix(mediaPrefix(image.objectPath));
            return;
        }

        // Toutes les déclinaisons AVANT de basculer en `READY` : ce statut signifie que
        // les trois existent, et T2d s'appuiera dessus sans rien vérifier.
        for (const derivative of result.derivatives) {
            await uploadMedia(
                derivativePath(image.objectPath, derivative.width),
                toArrayBuffer(derivative.content),
                "image/webp",
            );
        }

        await markImageReady(prisma, {
            imageId: image.id,
            width: result.width,
            height: result.height,
        });
    }

    // `process` lève quand le traitement tombe pour une raison qui n'est PAS l'image :
    // stockage injoignable, base coupée. BullMQ retente alors, ce qui est exactement ce
    // qu'on veut — mais quand la dernière tentative tombe aussi, il range le job dans sa
    // liste d'échecs et plus personne ne touche à la ligne.
    //
    // Sans ce relais, elle resterait `PENDING` POUR TOUJOURS : l'écran du vendeur
    // l'interroge toutes les deux secondes, n'affiche jamais ni photo ni raison, et rien
    // dans l'application ne dit que c'est fini. C'est le seul état dont on ne sort pas.
    @OnWorkerEvent("failed")
    async onFailed(job: Job<IProductImageJob>, error: Error): Promise<void> {
        // Tant qu'il reste une tentative, on ne marque rien : le vendeur lirait un échec
        // pendant que le worker travaille encore.
        if (job.attemptsMade < (job.opts.attempts ?? 1)) {
            return;
        }

        this.logger.error(`Image ${job.data.imageId} abandonnée après ${job.attemptsMade} tentatives`, error);

        // L'original n'est PAS supprimé : contrairement à une image refusée, celle-ci
        // n'a rien de fautif, et c'est ce qui rend « Réessayer » utile ici — et là
        // seulement.
        await markImageFailed(prisma, {
            imageId: job.data.imageId,
            reason: IMAGE_FAILURE.processingFailed,
        });
    }
}
