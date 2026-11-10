import type { MeQuery } from "../../graphql/generated/graphql";
import { queryFailure } from "../../lib/query-failure";

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
        // `FORBIDDEN` n'arrive pas de `me`, qui ne passe pas par la garde de boutique : s'il
        // venait, l'accueil le traiterait comme une panne, au lieu de renvoyer à lui-même.
        return queryFailure(result.error) === "signed-out"
            ? { kind: "signed-out" }
            : { kind: "unreachable" };
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
