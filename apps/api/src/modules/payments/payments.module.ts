import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { buildRegistry } from "./adapters";
import { PAYMENTS_ENV, PAYMENT_REGISTRY } from "./constants";
import { PaymentsController, SimulatorController, WebhookController } from "./controllers";
import { ALLOWED_ORIGINS, OriginGuard } from "./guards";
import { PaymentsService } from "./services";
import { allowedOrigins, readPaymentsEnv } from "./utils";

// Lu à l'IMPORT du module, donc au démarrage, comme `redisConnection()` de `app.module.ts` :
// une clé ou un secret manquant arrête le processus avec son NOM, et non au premier
// webhook, des heures plus tard.
const env = readPaymentsEnv(process.env);

// Pas de barrel à la racine de ce dossier, pour la raison écrite dans `auth.module.ts`.
@Module({
    // `AuthModule` exporte `SessionGuard` et le jeton de l'instance Better Auth : sans cet
    // import, Nest construirait le garde ici et ne trouverait pas son jeton.
    imports: [AuthModule, RealtimeModule],
    controllers: [PaymentsController, WebhookController, SimulatorController],
    providers: [
        { provide: PAYMENTS_ENV, useValue: env },
        {
            provide: PAYMENT_REGISTRY,
            useValue: buildRegistry({
                simulator: env.simulator,
                secret: env.simulatorSecret,
                publicUrl: env.apiPublicUrl,
            }),
        },
        { provide: ALLOWED_ORIGINS, useValue: allowedOrigins(process.env) },
        OriginGuard,
        PaymentsService,
    ],
})
export class PaymentsModule {}
