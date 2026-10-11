import { parseBaseEnv } from "@clemperl/core";
import { createApp } from "./app.factory";
import { AppModule } from "./app.module";
import { API_PORT } from "./constants";

// L'environnement est validé AVANT de monter l'application : une variable manquante
// arrête le processus ici, avec son nom, plutôt qu'au premier accès à la base.
parseBaseEnv(process.env);

async function demarrer(): Promise<void> {
    const app = await createApp(AppModule);
    // 0.0.0.0 et non localhost : en conteneur, écouter sur localhost rend le service
    // injoignable depuis le proxy.
    await app.listen(API_PORT, "0.0.0.0");
}

void demarrer();
