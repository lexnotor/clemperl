import { describe, expect, it } from "vitest";
import {
    CATALOG_PAGE_SIZE,
    catalogOffset,
    catalogPageHref,
    chooseCatalogCurrency,
    readCatalogFilters,
} from "./catalog-filters.utils.js";

describe("readCatalogFilters", () => {
    it("rend des valeurs sûres quand rien n'est fourni", () => {
        expect(readCatalogFilters({})).toEqual({
            search: null,
            category: null,
            sort: "newest",
            page: 1,
        });
    });

    it("lit une recherche, une catégorie et un tri valides", () => {
        expect(
            readCatalogFilters({ q: "cabas", category: "JEWELLERY", sort: "price_asc" }),
        ).toEqual({ search: "cabas", category: "JEWELLERY", sort: "price_asc", page: 1 });
    });

    // Rien de ce qui vient de l'URL n'est digne de confiance, et rien n'y lève : une page
    // publique ne rend pas une erreur parce qu'un paramètre a été bricolé.
    it("refuse une clé de tri inventée", () => {
        expect(readCatalogFilters({ sort: "price_asc; DROP TABLE products" }).sort).toBe("newest");
        expect(readCatalogFilters({ sort: "" }).sort).toBe("newest");
    });

    it("refuse une catégorie inconnue", () => {
        expect(readCatalogFilters({ category: "FOOD" }).category).toBeNull();
    });

    it("borne la page par le bas", () => {
        expect(readCatalogFilters({ page: "0" }).page).toBe(1);
        expect(readCatalogFilters({ page: "-5" }).page).toBe(1);
        expect(readCatalogFilters({ page: "abc" }).page).toBe(1);
        expect(readCatalogFilters({ page: "1e9" }).page).toBe(1);
    });

    it("borne la page par le haut", () => {
        expect(readCatalogFilters({ page: "100000" }).page).toBe(1000);
    });

    it("ignore un paramètre répété plutôt que d'en concaténer les valeurs", () => {
        expect(readCatalogFilters({ q: ["a", "b"] }).search).toBe("a");
    });

    it("traite une recherche vide ou blanche comme une absence", () => {
        expect(readCatalogFilters({ q: "   " }).search).toBeNull();
        expect(readCatalogFilters({ q: "" }).search).toBeNull();
    });

    it("borne la longueur du terme recherché", () => {
        expect(readCatalogFilters({ q: "a".repeat(500) }).search).toHaveLength(100);
    });
});

describe("chooseCatalogCurrency", () => {
    it("garde la devise demandée quand elle est disponible", () => {
        expect(chooseCatalogCurrency("XOF", ["EUR", "XOF"])).toBe("XOF");
    });

    // LE cas qui motive la fonction. Un cookie bricolé, ou une devise dont la dernière
    // boutique a fermé, ne doit pas rendre une liste vide : le visiteur croirait que le
    // catalogue n'a aucun produit.
    it("retombe sur la première disponible quand la demandée est inconnue", () => {
        expect(chooseCatalogCurrency("ZZZ", ["EUR", "XOF"])).toBe("EUR");
        expect(chooseCatalogCurrency(undefined, ["XOF", "EUR"])).toBe("XOF");
        expect(chooseCatalogCurrency("", ["EUR"])).toBe("EUR");
    });

    it("rend l'euro quand le catalogue est vide", () => {
        expect(chooseCatalogCurrency("XOF", [])).toBe("EUR");
        expect(chooseCatalogCurrency(undefined, [])).toBe("EUR");
    });
});

describe("catalogOffset", () => {
    it("rend zéro pour la première page", () => {
        expect(catalogOffset(1)).toBe(0);
    });

    it("avance d'une page entière", () => {
        expect(catalogOffset(3)).toBe(CATALOG_PAGE_SIZE * 2);
    });
});

describe("catalogPageHref", () => {
    // LE défaut que ce lien avait : un `href` qui commence par « ? » remplace TOUTE la
    // chaîne de requête. Cliquer « page suivante » sur une recherche filtrée faisait donc
    // sauter la recherche, la catégorie et le tri, et le visiteur recevait la page 2 du
    // catalogue entier sans que rien ne le lui dise.
    it("garde les filtres en changeant de page", () => {
        const href = catalogPageHref({ q: "cabas", category: "JEWELLERY", sort: "price_asc" }, 2);

        expect(href).toContain("q=cabas");
        expect(href).toContain("category=JEWELLERY");
        expect(href).toContain("sort=price_asc");
        expect(href).toContain("page=2");
    });

    it("remplace la page au lieu de l'ajouter", () => {
        const href = catalogPageHref({ q: "cabas", page: "3" }, 4);

        expect(href.match(/page=/g)).toHaveLength(1);
        expect(href).toContain("page=4");
    });

    it("n'écrit pas la page pour la première", () => {
        expect(catalogPageHref({ q: "cabas" }, 1)).toBe("?q=cabas");
    });

    it("rend un chemin propre quand il n'y a aucun filtre", () => {
        expect(catalogPageHref({}, 1)).toBe("?");
        expect(catalogPageHref({}, 2)).toBe("?page=2");
    });

    // Un paramètre répété, ou un paramètre que la liste ne connaît pas, ne doit pas se
    // retrouver recopié dans le lien : seul ce que `readCatalogFilters` sait lire voyage.
    it("ne recopie que les paramètres que la liste connaît", () => {
        const href = catalogPageHref({ q: ["a", "b"], inconnu: "x", sort: "newest" }, 2);

        expect(href).toContain("q=a");
        expect(href).not.toContain("inconnu");
        expect(href).toContain("sort=newest");
    });
});
