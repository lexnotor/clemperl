import { describe, expect, it } from "vitest";
import { applicationSubmissionSchema } from "./application-submission.schema.js";

const VALID = {
    shopName: "Chez Clem",
    shopDescription: "Maroquinerie artisanale, pièces uniques cousues main.",
    contactEmail: "contact@chezclem.test",
    contactPhone: "+32470000000",
    categories: ["LEATHER_GOODS"],
    legalForm: "SRL",
    legalName: "Chez Clem SRL",
    registrationNumber: "0123456789",
    country: "be",
    locale: "fr",
};

describe("schéma de dépôt d'un dossier", () => {
    it("accepte un dossier bien formé", () => {
        expect(applicationSubmissionSchema.safeParse(VALID).success).toBe(true);
    });

    it("met le pays en majuscules et coupe les espaces de bordure", () => {
        const parsed = applicationSubmissionSchema.parse({ ...VALID, shopName: "  Chez Clem  " });
        expect(parsed.country).toBe("BE");
        expect(parsed.shopName).toBe("Chez Clem");
    });

    // Sans cette règle, le nom passe la validation et ne produit aucun slug : la boutique
    // se retrouve sans identifiant public, et la deuxième du genre casse sur l'unicité.
    it("refuse un nom de boutique dont aucun slug ne peut sortir", () => {
        for (const shopName of ["日本橋工房", "!!!", "— —", "Ателье"]) {
            expect(applicationSubmissionSchema.safeParse({ ...VALID, shopName }).success).toBe(
                false,
            );
        }
    });

    it("accepte les noms latins usuels, accents et apostrophes compris", () => {
        for (const shopName of ["Chez Clem", "Éclat", "L'Atelier", "A1"]) {
            expect(applicationSubmissionSchema.safeParse({ ...VALID, shopName }).success).toBe(
                true,
            );
        }
    });

    it("exige au moins une catégorie", () => {
        expect(applicationSubmissionSchema.safeParse({ ...VALID, categories: [] }).success).toBe(false);
    });

    it("refuse une catégorie hors énumération", () => {
        expect(
            applicationSubmissionSchema.safeParse({ ...VALID, categories: ["MEUBLES"] }).success,
        ).toBe(false);
    });

    it("refuse une adresse de contact malformée", () => {
        expect(applicationSubmissionSchema.safeParse({ ...VALID, contactEmail: "clem" }).success).toBe(
            false,
        );
    });

    it("refuse une description trop courte pour dire quoi que ce soit", () => {
        expect(applicationSubmissionSchema.safeParse({ ...VALID, shopDescription: "Sacs." }).success).toBe(
            false,
        );
    });

    it("laisse le numéro de TVA facultatif", () => {
        const { taxNumber, ...withoutVat } = { ...VALID, taxNumber: "BE0123456789" };
        expect(applicationSubmissionSchema.safeParse(withoutVat).success).toBe(true);
        expect(applicationSubmissionSchema.parse({ ...VALID, taxNumber }).taxNumber).toBe(taxNumber);
    });
});
