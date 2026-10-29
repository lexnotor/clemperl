export interface IMobileEnv {
    apiUrl: string;
    storefrontUrl: string;
}

const VARIABLES = {
    apiUrl: "EXPO_PUBLIC_API_URL",
    storefrontUrl: "EXPO_PUBLIC_STOREFRONT_URL",
} as const;

// Les deux adresses que le téléphone utilise pour joindre la pile : l'API, pour GraphQL, et la
// boutique, qui monte le gestionnaire de Better Auth. Une variable absente arrête l'application
// avec son NOM : sans ce refus, la requête partirait vers `undefined/graphql`, et l'écran
// accuserait le réseau d'un réglage oublié.
export function readEnv(env: Record<string, string | undefined>): IMobileEnv {
    const read = (name: string): string => {
        const value = env[name] ?? "";
        if (value === "") {
            throw new Error(
                `${name} est absente : copier apps/vendor-mobile/.env.example en .env et y mettre l'adresse du poste.`,
            );
        }
        return value.replace(/\/+$/, "");
    };
    return { apiUrl: read(VARIABLES.apiUrl), storefrontUrl: read(VARIABLES.storefrontUrl) };
}
