import type { IPaymentsEnv } from "../interfaces";
import { readPayloadKey } from "./payload-cipher.utils";

// Les trois fronts qui ont le droit d'appeler l'API depuis un navigateur.
const ORIGIN_VARIABLES = [
    "NEXT_PUBLIC_STOREFRONT_URL",
    "NEXT_PUBLIC_VENDOR_URL",
    "NEXT_PUBLIC_ADMIN_URL",
] as const;

// Lu au DÉMARRAGE, comme `redisConnection()` de `app.module.ts` : une variable manquante
// arrête le processus avec son NOM, et non au premier webhook, des heures plus tard.
export function readPaymentsEnv(env: NodeJS.ProcessEnv): IPaymentsEnv {
    const simulator = env["PAYMENT_SIMULATOR"] === "1";
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
        apiPublicUrl,
        storefrontUrl,
    };
}

// Les origines sont NOMMÉES : une seule définition, partagée par CORS et par le garde
// d'origine, pour qu'elles ne divergent pas.
export function allowedOrigins(env: NodeJS.ProcessEnv): string[] {
    return ORIGIN_VARIABLES.map((name) => env[name] ?? "").filter((origin) => origin !== "");
}
