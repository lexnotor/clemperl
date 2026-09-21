import { describe, expect, it } from "vitest";
import { applicationSubmissionSchema } from "./application-submission.schema.js";
import { shopProfileSchema } from "./shop-profile.schema.js";

const VALID = {
    shopName: "Atelier Lumière",
    shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
    contactEmail: "contact@atelier.test",
    contactPhone: "+32470000000",
    categories: ["JEWELLERY" as const],
};

describe("shopProfileSchema", () => {
    it("accepte un profil commercial complet", () => {
        expect(shopProfileSchema.parse(VALID).shopName).toBe("Atelier Lumière");
    });

    // La règle est coûteuse et sa raison vit dans le schéma : sans deux caractères
    // latins, le nom ne produit aucun slug, et la deuxième boutique du genre casse sur
    // l'unicité.
    it("refuse un nom sans deux caractères latins", () => {
        expect(shopProfileSchema.safeParse({ ...VALID, shopName: "日本橋工房" }).success).toBe(
            false,
        );
        expect(shopProfileSchema.safeParse({ ...VALID, shopName: "!!!" }).success).toBe(false);
    });

    it("refuse une liste de catégories vide", () => {
        expect(shopProfileSchema.safeParse({ ...VALID, categories: [] }).success).toBe(false);
    });

    it("coupe les espaces autour du nom", () => {
        expect(shopProfileSchema.parse({ ...VALID, shopName: "  Atelier  " }).shopName).toBe(
            "Atelier",
        );
    });

    // Le point de l'extraction : les deux schémas ne peuvent plus diverger parce qu'il
    // n'y a qu'une définition. Ce test échoue le jour où quelqu'un recopie une règle.
    it("applique au dossier de candidature exactement les mêmes règles commerciales", () => {
        const withLegal = {
            ...VALID,
            shopName: "!!!",
            legalForm: "SRL",
            legalName: "Atelier Lumière SRL",
            registrationNumber: "0123456789",
            country: "BE",
            locale: "fr" as const,
        };
        expect(applicationSubmissionSchema.safeParse(withLegal).success).toBe(false);
    });
});
