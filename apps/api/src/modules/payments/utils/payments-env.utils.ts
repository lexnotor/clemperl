import type { IPaymentsEnv } from "../interfaces";
import { readPayloadKey } from "./payload-cipher.utils";

// Les trois fronts qui ont le droit d'appeler l'API depuis un navigateur.
const ORIGIN_VARIABLES = [
    "NEXT_PUBLIC_STOREFRONT_URL",
    "NEXT_PUBLIC_VENDOR_URL",
    "NEXT_PUBLIC_ADMIN_URL",
] as const;

// Une adresse d'origine est réduite à son ORIGINE : schéma, hôte, port non standard. C'est la
// forme qu'un navigateur envoie dans `Origin`, et celle dont les adresses de retour et de
// redirection sont préfixées. Une barre finale, un chemin ou un port par défaut ne
// s'accorderaient avec aucune des deux, et tout serait refusé sans dire pourquoi.
function toOrigin(name: string, value: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${name} n'est pas une URL : ${value}`);
    }
    // `new URL("localhost:3000")` réussit, avec `localhost:` pour schéma.
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`${name} doit commencer par http:// ou https:// : ${value}`);
    }
    return url.origin;
}

// Lu au DÉMARRAGE, comme `redisConnection()` de `app.module.ts` : une variable manquante
// arrête le processus avec son NOM, et non au premier webhook, des heures plus tard.
export function readPaymentsEnv(env: NodeJS.ProcessEnv): IPaymentsEnv {
    const simulator = env["PAYMENT_SIMULATOR"] === "1";
    // `.env.example` livre le simulateur allumé, avec un secret et une clé publics. Allumé en
    // production, `POST /payments/simulator/:ref` ne demande ni session, ni origine, ni
    // signature à l'appelant, et la référence est remise à l'acheteur dans sa propre URL de
    // redirection : il règlerait sa commande sans payer.
    if (simulator && env["NODE_ENV"] === "production") {
        throw new Error(
            "PAYMENT_SIMULATOR est allumé alors que NODE_ENV vaut production : le simulateur " +
                "règle une commande sans aucun paiement, et son secret par défaut est public. " +
                "Mettre PAYMENT_SIMULATOR=0.",
        );
    }

    const simulatorSecret = env["PAYMENT_SIMULATOR_SECRET"] ?? "";
    // Le registre accepte un secret vide : le refus est ICI, ou nulle part. Un simulateur
    // qui signe avec une clé vide accepterait le webhook de n'importe qui.
    if (simulator && simulatorSecret === "") {
        throw new Error(
            "PAYMENT_SIMULATOR_SECRET est absente : le simulateur ne peut pas signer.",
        );
    }

    const apiPublicUrl = env["NEXT_PUBLIC_API_URL"] ?? "";
    const storefrontUrl = env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "";
    if (apiPublicUrl === "" || storefrontUrl === "") {
        throw new Error(
            "NEXT_PUBLIC_API_URL et NEXT_PUBLIC_STOREFRONT_URL sont nécessaires : " +
                "l'une dit au navigateur où joindre l'API, l'autre où revenir après un paiement.",
        );
    }

    return {
        payloadKey: readPayloadKey(env["PAYMENT_PAYLOAD_KEY"]),
        simulator,
        simulatorSecret,
        apiPublicUrl: toOrigin("NEXT_PUBLIC_API_URL", apiPublicUrl),
        storefrontUrl: toOrigin("NEXT_PUBLIC_STOREFRONT_URL", storefrontUrl),
    };
}

// Les origines sont NOMMÉES : une seule définition, partagée par CORS et par le garde
// d'origine, pour qu'elles ne divergent pas.
export function allowedOrigins(env: NodeJS.ProcessEnv): string[] {
    return ORIGIN_VARIABLES.flatMap((name) => {
        const value = env[name] ?? "";
        return value === "" ? [] : [toOrigin(name, value)];
    });
}
