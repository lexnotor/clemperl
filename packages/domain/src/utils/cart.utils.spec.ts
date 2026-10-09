import { describe, expect, it } from "vitest";
import {
    MAX_CART_QUANTITY,
    boundQuantity,
    groupByShop,
    sumLines,
    variantLabel,
} from "./cart.utils.js";

describe("boundQuantity", () => {
    it("garde une quantité ordinaire", () => {
        expect(boundQuantity(3)).toBe(3);
        expect(boundQuantity("3")).toBe(3);
    });

    // Rien de ce qui vient d'un formulaire ou d'un panier local n'est digne de confiance,
    // et rien n'y lève : une page publique ne rend pas une erreur parce qu'un champ a été
    // bricolé.
    it("rend zéro pour tout ce qui n'est pas un nombre utilisable", () => {
        for (const brut of [undefined, "abc", NaN, {}]) {
            expect(boundQuantity(brut)).toBe(0);
        }
    });

    // `null`, `""` et `[]` valent zéro pour `Number`, donc ils retirent la ligne. C'est le
    // comportement voulu, mais il arrive par une autre route que `NaN` : le test le dit
    // plutôt que de le mélanger au cas précédent.
    it("retire la ligne pour ce qui se lit comme zéro", () => {
        for (const brut of [null, "", []]) {
            expect(boundQuantity(brut)).toBe(0);
        }
    });

    it("rend zéro pour une quantité nulle ou négative", () => {
        expect(boundQuantity(0)).toBe(0);
        expect(boundQuantity(-5)).toBe(0);
    });

    // Ce qui protège n'est pas l'analyseur, c'est le PLAFOND. « 1e9 » se lit comme un
    // milliard, et c'est la borne qui le ramène à cent.
    it("borne par le haut", () => {
        expect(boundQuantity(1000)).toBe(MAX_CART_QUANTITY);
        expect(boundQuantity("1e9")).toBe(MAX_CART_QUANTITY);
    });

    it("tronque une quantité fractionnaire", () => {
        expect(boundQuantity(2.9)).toBe(2);
        // Tronquée à zéro, donc la ligne disparaît : une demi-unité n'est pas une
        // quantité qu'une boutique sait honorer.
        expect(boundQuantity(0.5)).toBe(0);
    });

    // L'infini n'est PAS plafonné à cent, il retire la ligne : `Number.isFinite` le
    // refuse avant que la borne ne le voie. Sûr, mais c'est l'exception à la règle que le
    // commentaire du module énonce, donc le test la fixe.
    it("retire la ligne pour un infini", () => {
        expect(boundQuantity(Infinity)).toBe(0);
        expect(boundQuantity("1e999")).toBe(0);
    });
});

describe("variantLabel", () => {
    it("joint les axes et leurs valeurs, dans l'ordre reçu", () => {
        expect(
            variantLabel([
                { optionName: "Taille", valueLabel: "L" },
                { optionName: "Couleur", valueLabel: "Noir" },
            ]),
        ).toBe("Taille : L, Couleur : Noir");
    });

    // Un produit sans axe a UNE variante, de clé vide. Son libellé est vide, et l'écran
    // n'affiche alors rien plutôt qu'un séparateur orphelin.
    it("rend une chaîne vide pour un produit sans axe", () => {
        expect(variantLabel([])).toBe("");
    });
});

describe("groupByShop", () => {
    it("regroupe en préservant l'ordre d'apparition des boutiques", () => {
        const lignes = [
            { shopSlug: "b", id: 1 },
            { shopSlug: "a", id: 2 },
            { shopSlug: "b", id: 3 },
        ];

        expect(groupByShop(lignes)).toEqual([
            { shopSlug: "b", lines: [{ shopSlug: "b", id: 1 }, { shopSlug: "b", id: 3 }] },
            { shopSlug: "a", lines: [{ shopSlug: "a", id: 2 }] },
        ]);
    });

    it("rend une liste vide pour un panier vide", () => {
        expect(groupByShop([])).toEqual([]);
    });
});

describe("sumLines", () => {
    it("somme le prix unitaire multiplié par la quantité", () => {
        expect(sumLines([{ unitAmount: 1850, quantity: 2 }, { unitAmount: 500, quantity: 1 }])).toBe(
            4200,
        );
    });

    it("rend zéro pour aucune ligne", () => {
        expect(sumLines([])).toBe(0);
    });
});
