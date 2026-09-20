import { describe, expect, it } from "vitest";
import { schemaDepotDossier } from "./depot-dossier.schema.js";

const VALIDE = {
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
        expect(schemaDepotDossier.safeParse(VALIDE).success).toBe(true);
    });

    it("met le pays en majuscules et coupe les espaces de bordure", () => {
        const analyse = schemaDepotDossier.parse({ ...VALIDE, shopName: "  Chez Clem  " });
        expect(analyse.country).toBe("BE");
        expect(analyse.shopName).toBe("Chez Clem");
    });

    // Sans cette règle, le nom passe la validation et ne produit aucun slug : la boutique
    // se retrouve sans identifiant public, et la deuxième du genre casse sur l'unicité.
    it("refuse un nom de boutique dont aucun slug ne peut sortir", () => {
        for (const shopName of ["日本橋工房", "!!!", "— —", "Ателье"]) {
            expect(schemaDepotDossier.safeParse({ ...VALIDE, shopName }).success).toBe(false);
        }
    });

    it("accepte les noms latins usuels, accents et apostrophes compris", () => {
        for (const shopName of ["Chez Clem", "Éclat", "L'Atelier", "A1"]) {
            expect(schemaDepotDossier.safeParse({ ...VALIDE, shopName }).success).toBe(true);
        }
    });

    it("exige au moins une catégorie", () => {
        expect(schemaDepotDossier.safeParse({ ...VALIDE, categories: [] }).success).toBe(false);
    });

    it("refuse une catégorie hors énumération", () => {
        expect(
            schemaDepotDossier.safeParse({ ...VALIDE, categories: ["MEUBLES"] }).success,
        ).toBe(false);
    });

    it("refuse une adresse de contact malformée", () => {
        expect(schemaDepotDossier.safeParse({ ...VALIDE, contactEmail: "clem" }).success).toBe(
            false,
        );
    });

    it("refuse une description trop courte pour dire quoi que ce soit", () => {
        expect(schemaDepotDossier.safeParse({ ...VALIDE, shopDescription: "Sacs." }).success).toBe(
            false,
        );
    });

    it("laisse le numéro de TVA facultatif", () => {
        const { taxNumber, ...sansTva } = { ...VALIDE, taxNumber: "BE0123456789" };
        expect(schemaDepotDossier.safeParse(sansTva).success).toBe(true);
        expect(schemaDepotDossier.parse({ ...VALIDE, taxNumber }).taxNumber).toBe(taxNumber);
    });
});
