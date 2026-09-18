import { auth } from "@clemperl/auth";
import { Module } from "@nestjs/common";
import { MoiController } from "./controllers";
import { JETON_AUTH, SessionGuard } from "./guards";

// Pas de barrel à la racine de ce dossier, et son absence est délibérée : un barrel de
// racine réexporte tout le module, et deux modules qui se citent forment alors un cycle
// d'imports que NestJS résout en livrant `undefined` à l'exécution.
@Module({
    controllers: [MoiController],
    providers: [{ provide: JETON_AUTH, useValue: auth }, SessionGuard],
})
export class AuthModule {}
