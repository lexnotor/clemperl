import type { BetterAuthPlugin } from "better-auth";

// Le côté serveur du module `@better-auth/expo` 1.7.5, réécrit ici, et c'est délibéré.
//
// Ce module déclare `expo-constants`, `expo-linking` et `expo-secure-store` en dépendances de
// pair facultatives, et pnpm résout une pair facultative dès que le paquet existe quelque part
// dans le workspace. L'application mobile les installant, `packages/auth` tirait Expo et React
// Native jusque dans l'image de l'API, production comprise. Le côté serveur n'en a pourtant
// besoin d'aucun : il ne fait que ce qui suit. Voir `docs/pieges.md`.
//
// Le client, lui, reste `@better-auth/expo/client`, dans `apps/vendor-mobile`. À chaque montée
// de version, relire le `src/index.ts` du module : l'en-tête `expo-origin` et les origines
// d'Expo Go sont le contrat entre les deux côtés.
export function mobileOriginPlugin(env: NodeJS.ProcessEnv = process.env) {
    return {
        id: "mobile-origin",
        // Expo Go annonce une origine `exp://<adresse>:<port>`, qui change avec le réseau : le
        // module officiel ne lui fait confiance qu'en développement, et ce plugin pareil.
        init: () => ({
            options: { trustedOrigins: env["NODE_ENV"] === "development" ? ["exp://"] : [] },
        }),
        // Le client mobile n'envoie pas d'`Origin` ; il annonce la sienne dans `expo-origin`.
        // Recopiée en `Origin`, elle passe par le contrôle des origines de confiance comme celle
        // d'un navigateur. Une requête qui porte déjà une origine n'est jamais touchée.
        async onRequest(request: Request) {
            const expoOrigin = request.headers.get("expo-origin");
            if (request.headers.get("origin") || !expoOrigin) {
                return;
            }
            try {
                request.headers.set("origin", expoOrigin);
                return { request };
            } catch {
                // Des en-têtes figés : une requête neuve, seule à porter l'origine recopiée.
                const headers = new Headers(request.headers);
                headers.set("origin", expoOrigin);
                return { request: new Request(request, { headers }) };
            }
        },
    } satisfies BetterAuthPlugin;
}
