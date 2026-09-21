import { describe, expect, it } from "vitest";
import { productDetailsSchema, productOptionsSchema } from "./product.schema.js";

const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";

describe("productDetailsSchema", () => {
    it("accepte un produit ordinaire", () => {
        expect(
            productDetailsSchema.safeParse({ title: "Sac cabas", description: DESCRIPTION }).success,
        ).toBe(true);
    });

    // Sans deux caractères latins, le slug est vide et le deuxième produit du genre
    // casse sur l'unicité — avec un message de base que personne ne relie à sa saisie.
    it("refuse un titre dont aucun slug ne peut sortir", () => {
        expect(
            productDetailsSchema.safeParse({ title: "!!!", description: DESCRIPTION }).success,
        ).toBe(false);
    });

    it("refuse une description trop courte pour dire quoi que ce soit", () => {
        expect(
            productDetailsSchema.safeParse({ title: "Sac cabas", description: "Joli" }).success,
        ).toBe(false);
    });
});

describe("productOptionsSchema", () => {
    it("accepte deux axes distincts", () => {
        expect(
            productOptionsSchema.safeParse([
                { name: "Taille", values: ["S", "M"] },
                { name: "Couleur", values: ["Noir"] },
            ]).success,
        ).toBe(true);
    });

    // Deux « Noir » produiraient deux variantes que l'index unique rejetterait, avec un
    // message de base de données que personne ne peut relier à sa saisie.
    it("refuse deux valeurs identiques dans un axe", () => {
        expect(
            productOptionsSchema.safeParse([{ name: "Couleur", values: ["Noir", "Noir"] }]).success,
        ).toBe(false);
    });

    it("refuse deux axes de même nom", () => {
        expect(
            productOptionsSchema.safeParse([
                { name: "Taille", values: ["S"] },
                { name: "Taille", values: ["M"] },
            ]).success,
        ).toBe(false);
    });

    // Au-delà de trois axes la grille dépasse la centaine de lignes, et l'écran cesse
    // d'être utilisable bien avant que la base ne s'en plaigne.
    it("refuse un quatrième axe", () => {
        expect(
            productOptionsSchema.safeParse([
                { name: "A", values: ["1"] },
                { name: "B", values: ["1"] },
                { name: "C", values: ["1"] },
                { name: "D", values: ["1"] },
            ]).success,
        ).toBe(false);
    });
});

describe("le plafond de déclinaisons", () => {
    // Borner les AXES ne borne pas la grille : trois axes de vingt valeurs font huit
    // mille variantes, toutes issues d'une saisie parfaitement valide.
    it("refuse un produit cartésien qui dépasse la centaine", () => {
        const vingt = Array.from({ length: 20 }, (_, index) => `v${index}`);
        expect(
            productOptionsSchema.safeParse([
                { name: "A", values: vingt },
                { name: "B", values: vingt },
            ]).success,
        ).toBe(false);
    });

    it("accepte une grille qui tient sous le plafond", () => {
        expect(
            productOptionsSchema.safeParse([
                { name: "Taille", values: ["S", "M", "L"] },
                { name: "Couleur", values: ["Noir", "Écru"] },
            ]).success,
        ).toBe(true);
    });
});
