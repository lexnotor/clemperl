import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { PRODUCT_IMAGE_QUEUE } from "./media.constants";
import { ProductImageProcessor } from "./processors/product-image.processor";
import { ImageDerivativesService } from "./services/image-derivatives.service";

// Pas de barrel à la racine de ce dossier, et son absence est délibérée : un barrel de
// racine réexporte tout le module, et deux modules qui se citent forment alors un cycle
// d'imports que NestJS résout en livrant `undefined` à l'exécution — sans erreur au
// démarrage, avec un provider vide au moment de s'en servir.
@Module({
    imports: [BullModule.registerQueue({ name: PRODUCT_IMAGE_QUEUE })],
    providers: [ImageDerivativesService, ProductImageProcessor],
    exports: [BullModule],
})
export class MediaModule {}
