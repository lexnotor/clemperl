import { describe, expect, it } from "vitest";
import {
    CATALOG_PAGE_SIZE,
    catalogOffset,
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
