import { parseBaseEnv } from "@clemperl/core";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { allowedOrigins } from "./modules/payments/utils";

// L'environnement est validé AVANT de monter l'application : une variable manquante
// arrête le processus ici, avec son nom, plutôt qu'au premier accès à la base.
parseBaseEnv(process.env);

async function demarrer(): Promise<void> {
    // `rawBody` conserve les octets reçus à côté du corps analysé : la signature d'un webhook
    // porte sur eux. Sans lui, `request.rawBody` est indéfini et TOUTE signature échoue, avec
    // une erreur qui parle de signature et non de configuration.
    const app = await NestFactory.create(AppModule, { rawBody: true });
    // Les origines sont NOMMÉES. Le joker est incompatible avec l'envoi d'un cookie, et le
    // navigateur refuse alors sans rien expliquer.
    app.enableCors({ origin: allowedOrigins(process.env), credentials: true });
    // 0.0.0.0 et non localhost : en conteneur, écouter sur localhost rend le service
    // injoignable depuis le proxy.
    await app.listen(3003, "0.0.0.0");
}

void demarrer();
