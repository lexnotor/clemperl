import { REALTIME_EVENTS_QUEUE } from "@clemperl/core";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RealtimeGateway } from "./controllers";
import { RealtimeEventsProcessor } from "./processors";
import { RealtimeService } from "./services";

// Pas de barrel à la racine de ce dossier, pour la raison écrite dans `auth.module.ts`.
@Module({
    // `AuthModule` exporte le jeton de l'instance Better Auth, que la passerelle demande pour
    // lire la session de la poignée de main.
    imports: [AuthModule, BullModule.registerQueue({ name: REALTIME_EVENTS_QUEUE })],
    providers: [RealtimeGateway, RealtimeService, RealtimeEventsProcessor],
    // Ce que l'API écrit elle-même, un webhook de paiement ou une image traitée, est émis
    // directement par le service, sans repasser par la file.
    exports: [RealtimeService],
})
export class RealtimeModule {}
