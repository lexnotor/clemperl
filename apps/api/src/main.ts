import { parseBaseEnv } from "@clemperl/core";
import { createApp } from "./app.factory";
import { AppModule } from "./app.module";
import { API_PORT } from "./constants";
import { RedisIoAdapter } from "./modules/realtime/adapters";

// L'environnement de base est validé au démarrage : une variable manquante arrête le
// processus avec son nom, plutôt qu'au premier accès à la base.
//
// Ce n'est pas la PREMIÈRE validation qui tourne. L'import d'`AppModule`, plus haut, exécute
// le corps de ses modules : `redisConnection()` et la lecture de l'environnement du paiement
// réclament les leurs dès là. Si une variable manque de chaque côté, c'est le nom d'une
// variable de module qui s'affiche. Les deux refus nomment ce qui manque, c'est ce qui
// compte ; ne pas écrire de code qui dépende de cet ordre.
const env = parseBaseEnv(process.env);

async function demarrer(): Promise<void> {
    const app = await createApp(AppModule);
    // L'adaptateur Redis de Socket.IO s'installe ICI et non dans `createApp` : les suites
    // supertest construisent l'application par `createApp`, sans Redis. Il doit précéder
    // `listen`, qui monte la passerelle.
    const adapter = new RedisIoAdapter(app);
    await adapter.connect(env.REDIS_URL);
    app.useWebSocketAdapter(adapter);
    // 0.0.0.0 et non localhost : en conteneur, écouter sur localhost rend le service
    // injoignable depuis le proxy.
    await app.listen(API_PORT, "0.0.0.0");
}

void demarrer();
