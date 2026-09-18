import { Module } from "@nestjs/common";
import { HealthController } from "./controllers";

// Pas de barrel à la racine de ce dossier, et son absence est délibérée : un barrel de
// racine réexporte tout le module, et deux modules qui se citent forment alors un cycle
// d'imports que NestJS résout en livrant `undefined` à l'exécution — sans erreur au
// démarrage, avec un provider vide au moment de s'en servir.
@Module({ controllers: [HealthController] })
export class HealthModule {}
