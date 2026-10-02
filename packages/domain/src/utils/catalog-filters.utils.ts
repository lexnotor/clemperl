import { PRODUCT_CATEGORIES } from "../schemas/product.schema.js";

// Les tris que le catalogue sait faire, et RIEN d'autre. La liste est fermée parce qu'elle
// désigne des fragments de SQL : une valeur venue de l'URL choisit une clé, elle ne devient
// jamais du SQL. Le dépôt porte la table qui associe chaque clé à son fragment.
export const CATALOG_SORTS = ["price_asc", "price_desc", "newest"] as const;

export type TCatalogSort = (typeof CATALOG_SORTS)[number];

// Vingt-quatre : trois rangées pleines sur une grille de huit, deux sur une de douze.
export const CATALOG_PAGE_SIZE = 24;

// Mille pages de vingt-quatre, soit vingt-quatre mille produits. Au-delà, personne ne
// pagine : la borne existe pour qu'un `OFFSET` démesuré ne fasse pas balayer la table.
const MAX_PAGE = 1000;

// Cent caractères. Un terme plus long ne décrit plus un produit, et la borne évite de
// faire travailler la comparaison sur une chaîne arbitraire.
const MAX_SEARCH_LENGTH = 100;

export interface ICatalogFilters {
    search: string | null;
    category: string | null;
    sort: TCatalogSort;
    page: number;
}

// Un paramètre d'URL peut être répété : `?q=a&q=b` rend un tableau. On garde la première
// valeur plutôt que de les joindre, ce qui produirait un terme que personne n'a tapé.
function premiere(valeur: string | string[] | undefined): string | undefined {
    return Array.isArray(valeur) ? valeur[0] : valeur;
}

// PURE, et c'est ce qui permet de l'éprouver exhaustivement. Rien de ce qui vient de l'URL
// n'est digne de confiance, et rien n'y lève : une page publique ne rend pas une erreur
// parce qu'un paramètre a été bricolé. Chaque entrée douteuse retombe sur une valeur sûre.
export function readCatalogFilters(
    params: Record<string, string | string[] | undefined>,
): ICatalogFilters {
    const brut = premiere(params["q"])?.trim() ?? "";
    const categorie = premiere(params["category"]) ?? "";
    const tri = premiere(params["sort"]) ?? "";

    // `Number.parseInt` et non `Number` : « 1e9 » vaut un milliard pour `Number`, et `NaN`
    // pour `parseInt`, qui retombe alors sur la première page.
    const page = Number.parseInt(premiere(params["page"]) ?? "", 10);

    return {
        search: brut.length === 0 ? null : brut.slice(0, MAX_SEARCH_LENGTH),
        category: (PRODUCT_CATEGORIES as readonly string[]).includes(categorie)
            ? categorie
            : null,
        sort: (CATALOG_SORTS as readonly string[]).includes(tri) ? (tri as TCatalogSort) : "newest",
        page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    };
}

export function catalogOffset(page: number): number {
    return (page - 1) * CATALOG_PAGE_SIZE;
}

// La liste est bornée à UNE devise, et le visiteur la choisit. Une valeur inconnue, ou une
// devise dont la dernière boutique a fermé, retombe sur la plus fournie : rendre une liste
// vide ferait croire à un catalogue sans produits, ce qui est le pire des deux mondes.
//
// `available` arrive trié par nombre de produits décroissant, donc sa tête est la plus
// représentée. L'euro n'est un repli que pour un catalogue entièrement vide, où aucun choix
// n'a de sens.
export function chooseCatalogCurrency(
    requested: string | undefined,
    available: readonly string[],
): string {
    if (requested !== undefined && available.includes(requested)) {
        return requested;
    }
    return available[0] ?? "EUR";
}
