import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

// Le schéma d'adresse de `app.json`, que le serveur compte parmi ses origines de confiance.
const SCHEME = "clemperl-vendor";

// Le client Better Auth du téléphone. Il parle au gestionnaire que la boutique monte déjà,
// garde le cookie de session dans le stockage sécurisé du téléphone, et annonce son origine
// dans l'en-tête `expo-origin`, que `mobileOriginPlugin` lit côté serveur.
//
// `fetch` n'est passé que par les tests ; l'application garde celui de React Native.
export function createMobileAuthClient(storefrontUrl: string, fetch?: typeof globalThis.fetch) {
    return createAuthClient({
        baseURL: storefrontUrl,
        plugins: [expoClient({ scheme: SCHEME, storagePrefix: SCHEME, storage: SecureStore })],
        ...(fetch === undefined ? {} : { fetchOptions: { customFetchImpl: fetch } }),
    });
}
