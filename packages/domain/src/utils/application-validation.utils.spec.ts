import { describe, expect, it } from "vitest";
import type { ISubmittedDocument } from "../interfaces/index.js";
import type { TApplicationSubmission } from "../schemas/index.js";
import { validateApplication } from "./application-validation.utils.js";

const FIELDS: TApplicationSubmission = {
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

const DOCUMENTS: ISubmittedDocument[] = [
    { kind: "REGISTRY", mimeType: "application/pdf", sizeBytes: 120_000 },
    { kind: "IDENTITY", mimeType: "image/jpeg", sizeBytes: 90_000 },
];

describe("recevabilité d'un dossier", () => {
    it("accepte un dossier complet, sans attestation fiscale", () => {
        expect(validateApplication(FIELDS, DOCUMENTS)).toEqual([]);
    });

    it("exige le registre de commerce", () => {
        expect(validateApplication(FIELDS, [DOCUMENTS[1]!])).toEqual([
            {
                i18nKey: "errors.vendor_application.missing_document",
                i18nArgs: { kind: "REGISTRY" },
            },
        ]);
    });

    it("refuse une pièce trop lourde", () => {
        const large: ISubmittedDocument = {
            kind: "TAX",
            mimeType: "application/pdf",
            sizeBytes: 6 * 1024 * 1024,
        };
        expect(validateApplication(FIELDS, [...DOCUMENTS, large])).toEqual([
            {
                i18nKey: "errors.vendor_application.document_too_large",
                i18nArgs: { kind: "TAX", maximum: 5 * 1024 * 1024 },
            },
        ]);
    });

    it("refuse un type de fichier non prévu", () => {
        const zip: ISubmittedDocument = {
            kind: "REGISTRY",
            mimeType: "application/zip",
            sizeBytes: 1000,
        };
        expect(validateApplication(FIELDS, [zip, DOCUMENTS[1]!])).toEqual([
            {
                i18nKey: "errors.vendor_application.unsupported_media_type",
                i18nArgs: { kind: "REGISTRY", type: "application/zip" },
            },
        ]);
    });

    it("refuse deux pièces de même nature", () => {
        expect(validateApplication(FIELDS, [...DOCUMENTS, DOCUMENTS[0]!])).toEqual([
            {
                i18nKey: "errors.vendor_application.duplicate_document",
                i18nArgs: { kind: "REGISTRY" },
            },
        ]);
    });

    it("cumule les violations au lieu de s'arrêter à la première", () => {
        expect(validateApplication(FIELDS, [])).toHaveLength(2);
    });
});
