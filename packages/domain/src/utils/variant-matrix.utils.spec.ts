import { describe, expect, it } from "vitest";
import { buildVariantMatrix, selectionKey } from "./variant-matrix.utils.js";

describe("selectionKey", () => {
    // Sans le tri, la même combinaison produirait deux clés différentes et l'unicité de
    // la base ne verrait aucun doublon.
    it("ne dépend pas de l'ordre des axes", () => {
        expect(selectionKey({ Taille: "M", Couleur: "Noir" })).toBe(
            selectionKey({ Couleur: "Noir", Taille: "M" }),
        );
    });

    it("distingue deux combinaisons différentes", () => {
        expect(selectionKey({ Taille: "M" })).not.toBe(selectionKey({ Taille: "L" }));
    });

    it("rend une chaîne vide quand il n'y a aucun axe", () => {
        expect(selectionKey({})).toBe("");
    });
});

describe("buildVariantMatrix", () => {
    it("rend exactement une variante quand il n'y a aucun axe", () => {
        const grid = buildVariantMatrix([], [], 12000);
        expect(grid).toHaveLength(1);
        expect(grid[0]?.selections).toEqual({});
        expect(grid[0]?.priceAmount).toBe(12000);
    });

    it("rend le produit cartésien de deux axes", () => {
        const grid = buildVariantMatrix(
            [
                { name: "Taille", values: ["S", "M"] },
                { name: "Couleur", values: ["Noir", "Écru"] },
            ],
            [],
            9900,
        );
        expect(grid).toHaveLength(4);
        expect(grid.map((variant) => variant.position)).toEqual([0, 1, 2, 3]);
    });

    // Un vendeur qui déclare « Taille : L » après avoir fixé un prix ne repart pas de
    // zéro.
    it("conserve le prix d'une combinaison déjà connue", () => {
        const grid = buildVariantMatrix(
            [{ name: "Taille", values: ["S", "M"] }],
            [{ selections: { Taille: "M" }, priceAmount: 15000 }],
            9900,
        );
        expect(grid.find((variant) => variant.selections["Taille"] === "M")?.priceAmount).toBe(
            15000,
        );
    });

    it("donne le prix hérité à une combinaison nouvelle", () => {
        const grid = buildVariantMatrix(
            [{ name: "Taille", values: ["S", "M"] }],
            [{ selections: { Taille: "M" }, priceAmount: 15000 }],
            9900,
        );
        expect(grid.find((variant) => variant.selections["Taille"] === "S")?.priceAmount).toBe(
            15000,
        );
    });

    it("prend le prix de repli quand aucune variante n'existe encore", () => {
        const grid = buildVariantMatrix([{ name: "Taille", values: ["S"] }], [], 9900);
        expect(grid[0]?.priceAmount).toBe(9900);
    });

    it("supprime les variantes d'une valeur retirée, et jamais les autres", () => {
        const grid = buildVariantMatrix(
            [{ name: "Taille", values: ["S"] }],
            [
                { selections: { Taille: "S" }, priceAmount: 15000 },
                { selections: { Taille: "M" }, priceAmount: 16000 },
            ],
            9900,
        );
        expect(grid).toHaveLength(1);
        expect(grid[0]?.priceAmount).toBe(15000);
    });

    it("retomber à zéro axe ramène à une variante unique", () => {
        const grid = buildVariantMatrix(
            [],
            [
                { selections: { Taille: "S" }, priceAmount: 15000 },
                { selections: { Taille: "M" }, priceAmount: 16000 },
            ],
            9900,
        );
        expect(grid).toHaveLength(1);
        expect(grid[0]?.selections).toEqual({});
        expect(grid[0]?.priceAmount).toBe(15000);
    });

    // L'ordre que rend la base n'est pas garanti. Si le prix hérité en dépendait, il
    // changerait d'une exécution à l'autre sans que rien ne le signale : l'appelant
    // passe une liste ordonnée par `position`, et on prend sa tête.
    it("hérite du prix de la variante de tête, pas d'une au hasard", () => {
        const grid = buildVariantMatrix(
            [],
            [
                { selections: { Taille: "S" }, priceAmount: 11100 },
                { selections: { Taille: "M" }, priceAmount: 22200 },
            ],
            9900,
        );
        expect(grid[0]?.priceAmount).toBe(11100);
    });

    it("ignore un axe sans aucune valeur", () => {
        const grid = buildVariantMatrix(
            [
                { name: "Taille", values: ["S", "M"] },
                { name: "Couleur", values: [] },
            ],
            [],
            9900,
        );
        expect(grid).toHaveLength(2);
        expect(grid[0]?.selections).toEqual({ Taille: "S" });
    });

    it("rend une grille de six pour trois tailles et deux couleurs", () => {
        const grid = buildVariantMatrix(
            [
                { name: "Taille", values: ["S", "M", "L"] },
                { name: "Couleur", values: ["Noir", "Écru"] },
            ],
            [],
            9900,
        );
        expect(grid).toHaveLength(6);
        expect(new Set(grid.map((variant) => selectionKey(variant.selections))).size).toBe(6);
    });
});
