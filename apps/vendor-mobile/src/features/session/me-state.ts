import { CombinedGraphQLErrors } from "@apollo/client/errors";
import type { MeQuery } from "../../graphql/generated/graphql";

export type TMeState =
    | { kind: "loading" }
    | { kind: "signed-out" }
    | { kind: "unreachable" }
    | { kind: "no-shop"; email: string }
    | { kind: "ready"; email: string; shop: { name: string; suspended: boolean } };

interface IMeResult {
    loading: boolean;
    error?: unknown;
    data?: MeQuery;
}

// La réponse de `me`, rangée dans l'un des états que l'accueil sait afficher. Les écrans ne
// lisent jamais `error` eux-mêmes : la règle qui distingue une session refusée d'une panne vit
// ici, une fois.
export function meState(result: IMeResult): TMeState {
    if (result.loading) {
        return { kind: "loading" };
    }
    if (result.error !== undefined) {
        // Seul `UNAUTHENTICATED` renvoie à la connexion : toute autre erreur laisse la session
        // en place, et propose de réessayer.
        const refused =
            CombinedGraphQLErrors.is(result.error) &&
            result.error.errors.some((error) => error.extensions?.["code"] === "UNAUTHENTICATED");
        return refused ? { kind: "signed-out" } : { kind: "unreachable" };
    }
    const me = result.data?.me;
    if (me === undefined) {
        return { kind: "loading" };
    }
    if (me.shop === null) {
        return { kind: "no-shop", email: me.user.email };
    }
    return {
        kind: "ready",
        email: me.user.email,
        shop: { name: me.shop.name, suspended: me.shop.suspended },
    };
}
