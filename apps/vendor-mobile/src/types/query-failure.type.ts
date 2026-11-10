// Ce qu'une requête refusée dit à l'écran : la session n'existe plus, le compte n'a pas ou plus
// de boutique, ou l'API ne répond pas.
export type TQueryFailure = "signed-out" | "no-shop" | "unreachable";
