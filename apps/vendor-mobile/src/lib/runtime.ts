import { createApolloClient } from "./apollo-client";
import { createMobileAuthClient } from "./auth-client";
import { readEnv } from "./env";

// Les deux clients de l'application, créés une fois, au chargement.
//
// Les variables sont lues par accès STATIQUE, `process.env.EXPO_PUBLIC_API_URL`, et non par
// `readEnv(process.env)` : Metro remplace ces expressions exactes par leur valeur au moment où
// il assemble l'application, et `process.env` n'est, à l'exécution, qu'un objet vide. Voir
// `docs/expo.md`.
const env = readEnv({
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_STOREFRONT_URL: process.env.EXPO_PUBLIC_STOREFRONT_URL,
});

export const authClient = createMobileAuthClient(env.storefrontUrl);

export const apolloClient = createApolloClient({
    apiUrl: env.apiUrl,
    getCookie: () => authClient.getCookie(),
});
