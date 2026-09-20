import { describe, expect, it } from "vitest";
import {
    buildAcknowledgementMessage,
    buildApprovalMessage,
    buildRejectionMessage,
} from "./vendor-application-messages.utils.js";

describe("courriels du dossier vendeur", () => {
    it("accuse réception en français", () => {
        const message = buildAcknowledgementMessage("Chez Clem", "fr");
        expect(message.subject).toContain("Chez Clem");
        expect(message.recipient).toBe("");
    });

    it("accuse réception en anglais", () => {
        expect(buildAcknowledgementMessage("Chez Clem", "en").subject).toMatch(/received/i);
    });

    // Une locale inconnue ne doit jamais produire un message vide : le français est la
    // langue par défaut de la plateforme.
    it("retombe sur le français pour une locale inconnue", () => {
        expect(buildAcknowledgementMessage("Chez Clem", "de").subject).toBe(
            buildAcknowledgementMessage("Chez Clem", "fr").subject,
        );
    });

    it("annonce la boutique dans l'acceptation, dans les deux langues", () => {
        expect(buildApprovalMessage("Chez Clem", "fr").text).toContain("Chez Clem");
        expect(buildApprovalMessage("Chez Clem", "en").text).toContain("Chez Clem");
    });

    it("porte le motif dans le corps du refus, dans les deux langues", () => {
        expect(buildRejectionMessage("Chez Clem", "Registre illisible.", "fr").text).toContain(
            "Registre illisible.",
        );
        expect(buildRejectionMessage("Chez Clem", "Unreadable register.", "en").text).toContain(
            "Unreadable register.",
        );
    });
});
