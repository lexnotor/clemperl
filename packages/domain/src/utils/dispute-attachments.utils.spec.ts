import { describe, expect, it } from "vitest";
import { attachmentViolations } from "./dispute-attachments.utils.js";

const keys = (violations: readonly { i18nKey: string }[]) => violations.map((v) => v.i18nKey);

describe("contrôler des pièces, dans le navigateur comme sur le serveur", () => {
    it("accepte trois pièces dans les limites, et aucune", () => {
        expect(attachmentViolations([])).toEqual([]);
        expect(
            attachmentViolations([
                { mimeType: "image/jpeg", sizeBytes: 5 * 1024 * 1024 },
                { mimeType: "image/png", sizeBytes: 1 },
                { mimeType: "application/pdf", sizeBytes: 1 },
            ]),
        ).toEqual([]);
    });

    // Quatre photos de téléphone dépassent le plafond du corps d'une action : le serveur ne
    // les voit jamais, et seul le navigateur peut dire pourquoi.
    it("refuse une quatrième pièce, en disant la limite", () => {
        const violations = attachmentViolations(
            Array.from({ length: 4 }, () => ({ mimeType: "image/jpeg", sizeBytes: 4_500_000 })),
        );
        expect(violations).toEqual([
            { i18nKey: "errors.dispute.too_many_attachments", i18nArgs: { maximum: 3 } },
        ]);
    });

    // Une faute se dit une fois, quel que soit le nombre de pièces qui la commettent : trois
    // fois la même phrase n'aide personne, et l'écran s'en sert comme clé de liste.
    it("dit chaque faute une seule fois, même commise par plusieurs pièces", () => {
        const oversized = { mimeType: "image/jpeg", sizeBytes: 5 * 1024 * 1024 + 1 };
        const archive = { mimeType: "application/zip", sizeBytes: 1 };

        expect(keys(attachmentViolations([oversized, oversized, archive]))).toEqual([
            "errors.dispute.attachment_too_large",
            "errors.dispute.unsupported_media_type",
        ]);
    });

    it("refuse une pièce trop lourde et un type inconnu", () => {
        expect(
            keys(
                attachmentViolations([
                    { mimeType: "image/jpeg", sizeBytes: 5 * 1024 * 1024 + 1 },
                    { mimeType: "application/zip", sizeBytes: 1 },
                ]),
            ),
        ).toEqual(["errors.dispute.attachment_too_large", "errors.dispute.unsupported_media_type"]);
    });
});
