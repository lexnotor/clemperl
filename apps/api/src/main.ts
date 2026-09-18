import { parseBaseEnv } from "@clemperl/core";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

// L'environnement est validé AVANT de monter l'application : une variable manquante
// arrête le processus ici, avec son nom, plutôt qu'au premier accès à la base.
parseBaseEnv(process.env);

async function demarrer(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    // 0.0.0.0 et non localhost : en conteneur, écouter sur localhost rend le service
    // injoignable depuis le proxy.
    await app.listen(3003, "0.0.0.0");
}

void demarrer();
