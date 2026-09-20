import { auth } from "@clemperl/auth";
import { Module } from "@nestjs/common";
import { MeController } from "./controllers";
import { AUTH_TOKEN, SessionGuard } from "./guards";

// Pas de barrel à la racine de ce dossier, et son absence est délibérée : un barrel de
// racine réexporte tout le module, et deux modules qui se citent forment alors un cycle
// d'imports que NestJS résout en livrant `undefined` à l'exécution.
@Module({
    controllers: [MeController],
    providers: [{ provide: AUTH_TOKEN, useValue: auth }, SessionGuard],
})
export class AuthModule {}
