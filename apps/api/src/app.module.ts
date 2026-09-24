import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { MediaModule } from "./modules/media/media.module";

// L'URL est lue ICI et non dans le module : une seule lecture, et le démarrage échoue
// avec le NOM de la variable plutôt qu'avec un refus de connexion sans contexte.
function redisConnection(): { host: string; port: number } {
    const url = process.env["REDIS_URL"];
    if (!url) {
        throw new Error("REDIS_URL est absente : la file des médias ne peut pas s'ouvrir.");
    }
    const parsed = new URL(url);
    return { host: parsed.hostname, port: Number(parsed.port || 6379) };
}

@Module({
    imports: [
        BullModule.forRoot({ connection: redisConnection() }),
        HealthModule,
        AuthModule,
        MediaModule,
    ],
})
export class AppModule {}
