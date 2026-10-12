import type { INestApplication, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { allowedOrigins } from "./modules/payments/utils";

// L'application telle que `main.ts` la lance, moins l'écoute : tout ce qui configure
// l'application vit ICI, pour qu'un test puisse la construire sur un module réduit et
// vérifier cette configuration, au lieu de la laisser dans un point d'entrée hors de portée.
export async function createApp(root: Type<unknown>): Promise<INestApplication> {
    // `rawBody` conserve les octets reçus à côté du corps analysé : la signature d'un webhook
    // porte sur eux. Il ne s'active qu'à la CRÉATION, jamais après. Sans lui,
    // `request.rawBody` est indéfini et TOUTE signature échoue, avec une erreur qui parle de
    // signature et non de configuration.
    const app = await NestFactory.create(root, { rawBody: true });
    // Les origines sont NOMMÉES. Le joker est incompatible avec l'envoi d'un cookie, et le
    // navigateur refuse alors sans rien expliquer.
    app.enableCors({ origin: allowedOrigins(process.env), credentials: true });
    return app;
}
