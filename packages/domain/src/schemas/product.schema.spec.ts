import { describe, expect, it } from "vitest";
import { productDetailsSchema, productOptionsSchema } from "./product.schema.js";

const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";

describe("productDetailsSchema", () => {
    it("accepte un produit ordinaire", () => {
        expect(
            productDetailsSchema.safeParse({ title: "Sac cabas", description: DESCRIPTION, category: "LEATHER_GOODS" }).success,
        ).toBe(true);
    });

    // Sans deux caractères latins, le slug est vide et le deuxième produit du genre
    // casse sur l'unicité : avec un message de base que personne ne relie à sa saisie.
    it("refuse un titre dont aucun slug ne peut sortir", () => {
        expect(
            productDetailsSchema.safeParse({ title: "!!!", description: DESCRIPTION, category: "LEATHER_GOODS" }).success,
        ).toBe(false);
    });

    it("refuse une description trop courte pour dire quoi que ce soit", () => {
        expect(
            productDetailsSchema.safeParse({ title: "Sac cabas", description: "Joli", category: "LEATHER_GOODS" }).success,
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

describe("la catégorie du produit", () => {
    it("accepte les trois catégories connues", () => {
        for (const category of ["APPAREL", "JEWELLERY", "LEATHER_GOODS"]) {
            const resultat = productDetailsSchema.safeParse({
                title: "Sac cabas",
                description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
                category,
            });
            expect(resultat.success).toBe(true);
        }
    });

    // Un défaut silencieux rangerait toutes les bagues en vêtements. Le formulaire exige
    // un choix, et c'est ici que ce refus se vérifie.
    it("refuse une catégorie absente", () => {
        const resultat = productDetailsSchema.safeParse({
            title: "Sac cabas",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
        });
        expect(resultat.success).toBe(false);
    });

    it("refuse une catégorie inventée", () => {
        const resultat = productDetailsSchema.safeParse({
            title: "Sac cabas",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
            category: "FOOD",
        });
        expect(resultat.success).toBe(false);
    });
});

// Le `.refine` sur le titre est la SEULE chose qui empêche un produit de prendre l'URL
// réservée aux collections. Les deux briques étaient testées séparément, leur assemblage
// non : retirer le `.refine` laissait la suite verte et la couverture à 100 %, parce que
// la flèche s'exécute à chaque titre valide sans que son refus soit jamais observé.
describe("le titre réservé aux collections", () => {
    const valide = {
        description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
        category: "LEATHER_GOODS",
    };

    it("refuse un titre dont le slug entrerait en collision avec la route des collections", () => {
        for (const title of ["Collections", "collections", "COLLECTIONS", "Collections !!"]) {
            expect(productDetailsSchema.safeParse({ ...valide, title }).success).toBe(false);
        }
    });

    it("laisse passer un titre qui contient le mot sans s'y réduire", () => {
        for (const title of ["Les collections", "Collection", "Collections privées"]) {
            expect(productDetailsSchema.safeParse({ ...valide, title }).success).toBe(true);
        }
    });
});
