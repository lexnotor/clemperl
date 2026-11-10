import { auth } from "@clemperl/auth";
import { Module } from "@nestjs/common";
import { MeController } from "./controllers";
import { AUTH_TOKEN, SessionGuard, ShopGuard } from "./guards";
import { MeResolver } from "./resolvers";

// Pas de barrel à la racine de ce dossier, et son absence est délibérée : un barrel de
// racine réexporte tout le module, et deux modules qui se citent forment alors un cycle
// d'imports que NestJS résout en livrant `undefined` à l'exécution.
@Module({
    controllers: [MeController],
    providers: [{ provide: AUTH_TOKEN, useValue: auth }, SessionGuard, ShopGuard, MeResolver],
    // Un module qui pose `@UseGuards(SessionGuard)` a besoin du garde ET de son jeton : Nest
    // construit le garde dans le module de la route, et y cherche `AUTH_TOKEN`.
    exports: [AUTH_TOKEN, SessionGuard, ShopGuard],
})
export class AuthModule {}
