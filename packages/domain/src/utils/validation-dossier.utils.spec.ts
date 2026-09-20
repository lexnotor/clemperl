import { describe, expect, it } from "vitest";
import type { IPieceDeposee } from "../interfaces/index.js";
import type { TDepotDossier } from "../schemas/index.js";
import { validerDossier } from "./validation-dossier.utils.js";

const CHAMPS: TDepotDossier = {
    shopName: "Chez Clem",
    shopDescription: "Maroquinerie artisanale, pièces uniques cousues main.",
    contactEmail: "contact@chezclem.test",
    contactPhone: "+32470000000",
    categories: ["LEATHER_GOODS"],
    legalForm: "SRL",
    legalName: "Chez Clem SRL",
    registrationNumber: "0123456789",
    country: "BE",
    locale: "fr",
};

const PIECES: IPieceDeposee[] = [
    { kind: "REGISTRY", mimeType: "application/pdf", sizeBytes: 120_000 },
    { kind: "IDENTITY", mimeType: "image/jpeg", sizeBytes: 90_000 },
];

describe("recevabilité d'un dossier", () => {
    it("accepte un dossier complet, sans attestation fiscale", () => {
        expect(validerDossier(CHAMPS, PIECES)).toEqual([]);
    });

    it("exige le registre de commerce", () => {
        expect(validerDossier(CHAMPS, [PIECES[1]!])).toEqual([
            {
                i18nKey: "errors.vendor_application.missing_document",
                i18nArgs: { nature: "REGISTRY" },
            },
        ]);
    });

    it("refuse une pièce trop lourde", () => {
        const lourde: IPieceDeposee = {
            kind: "TAX",
            mimeType: "application/pdf",
            sizeBytes: 6 * 1024 * 1024,
        };
        expect(validerDossier(CHAMPS, [...PIECES, lourde])).toEqual([
            {
                i18nKey: "errors.vendor_application.document_too_large",
                i18nArgs: { nature: "TAX", maximum: 5 * 1024 * 1024 },
            },
        ]);
    });

    it("refuse un type de fichier non prévu", () => {
        const zip: IPieceDeposee = {
            kind: "REGISTRY",
            mimeType: "application/zip",
            sizeBytes: 1000,
        };
        expect(validerDossier(CHAMPS, [zip, PIECES[1]!])).toEqual([
            {
                i18nKey: "errors.vendor_application.unsupported_media_type",
                i18nArgs: { nature: "REGISTRY", type: "application/zip" },
            },
        ]);
    });

    it("refuse deux pièces de même nature", () => {
        expect(validerDossier(CHAMPS, [...PIECES, PIECES[0]!])).toEqual([
            {
                i18nKey: "errors.vendor_application.duplicate_document",
                i18nArgs: { nature: "REGISTRY" },
            },
        ]);
    });

    it("cumule les violations au lieu de s'arrêter à la première", () => {
        expect(validerDossier(CHAMPS, [])).toHaveLength(2);
    });
});
