import { toOrigin } from "../../payments/utils";
import { graphqlPlaygroundEnabled } from "./graphql-playground.utils";

// Qui peut appeler `/graphql`. Le téléphone, d'abord, qui n'envoie aucune origine : `fetch`
// en React Native n'en pose pas. Ensuite le terrain de jeu, hors production, que l'API sert
// elle-même et dont les requêtes portent donc l'origine de l'API. Personne d'autre : les
// fronts web lisent la base directement.
//
// Accepter une requête sans origine n'ouvre pas la porte aux requêtes forgées : elles partent
// d'un navigateur, et un navigateur envoie toujours l'origine d'un `POST`. Une origine
// présente est donc un navigateur, et le seul admis est le terrain de jeu.
//
// La comparaison est une ÉGALITÉ sur l'origine entière, comme `OriginGuard` : une origine qui
// COMMENCE comme celle de l'API n'est pas celle de l'API.
export function graphqlOriginAllowed(origin: string | undefined, env: NodeJS.ProcessEnv): boolean {
    if (origin === undefined) {
        return true;
    }
    const api = env["NEXT_PUBLIC_API_URL"] ?? "";
    if (!graphqlPlaygroundEnabled(env) || api === "") {
        return false;
    }
    return origin === toOrigin("NEXT_PUBLIC_API_URL", api);
}
