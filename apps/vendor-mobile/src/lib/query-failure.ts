import { CombinedGraphQLErrors } from "@apollo/client/errors";
import type { TQueryFailure } from "../types/query-failure.type";

// La règle qui range une erreur de requête dans l'un des trois cas que les écrans savent
// traiter. Les écrans ne lisent jamais `error` eux-mêmes : elle vit ici, une fois.
export function queryFailure(error: unknown): TQueryFailure {
    if (CombinedGraphQLErrors.is(error)) {
        const codes = error.errors.map((item) => item.extensions?.["code"]);
        // Une session refusée renvoie à la connexion, un compte sans boutique à l'accueil.
        if (codes.includes("UNAUTHENTICATED")) {
            return "signed-out";
        }
        if (codes.includes("FORBIDDEN")) {
            return "no-shop";
        }
    }
    // Toute autre erreur laisse la session en place, et propose de réessayer.
    return "unreachable";
}
