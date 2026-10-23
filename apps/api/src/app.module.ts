import { redisConnectionOptions, type IRedisConnection } from "@clemperl/core";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { ApiGraphqlModule } from "./modules/graphql/graphql.module";
import { HealthModule } from "./modules/health/health.module";
import { MediaModule } from "./modules/media/media.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";

// L'URL est lue ICI et non dans le module : une seule lecture, et le démarrage échoue
// avec le NOM de la variable plutôt qu'avec un refus de connexion sans contexte.
function redisConnection(): IRedisConnection {
    const url = process.env["REDIS_URL"];
    if (!url) {
        throw new Error(
            "REDIS_URL est absente : les files des médias et du temps réel ne peuvent pas s'ouvrir.",
        );
    }
    // L'URL est lue ENTIÈREMENT : identifiants, index de base, TLS. N'en garder que
    // l'hôte et le port marche en développement, où Redis est nu, et échoue au premier
    // déploiement contre un Redis géré.
    return redisConnectionOptions(url);
}

@Module({
    imports: [
        BullModule.forRoot({ connection: redisConnection() }),
        HealthModule,
        AuthModule,
        ApiGraphqlModule,
        MediaModule,
        PaymentsModule,
        RealtimeModule,
    ],
})
export class AppModule {}
