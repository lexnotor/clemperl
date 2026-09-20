import { describe, expect, it } from "vitest";
import {
    construireMessageAcceptation,
    construireMessageAccuseReception,
    construireMessageRefus,
} from "./messages-dossier.utils.js";

describe("courriels du dossier vendeur", () => {
    it("accuse réception en français", () => {
        const message = construireMessageAccuseReception("Chez Clem", "fr");
        expect(message.sujet).toContain("Chez Clem");
        expect(message.destinataire).toBe("");
    });

    it("accuse réception en anglais", () => {
        expect(construireMessageAccuseReception("Chez Clem", "en").sujet).toMatch(/received/i);
    });

    // Une locale inconnue ne doit jamais produire un message vide : le français est la
    // langue par défaut de la plateforme.
    it("retombe sur le français pour une locale inconnue", () => {
        expect(construireMessageAccuseReception("Chez Clem", "de").sujet).toBe(
            construireMessageAccuseReception("Chez Clem", "fr").sujet,
        );
    });

    it("annonce la boutique dans l'acceptation, dans les deux langues", () => {
        expect(construireMessageAcceptation("Chez Clem", "fr").texte).toContain("Chez Clem");
        expect(construireMessageAcceptation("Chez Clem", "en").texte).toContain("Chez Clem");
    });

    it("porte le motif dans le corps du refus, dans les deux langues", () => {
        expect(construireMessageRefus("Chez Clem", "Registre illisible.", "fr").texte).toContain(
            "Registre illisible.",
        );
        expect(construireMessageRefus("Chez Clem", "Unreadable register.", "en").texte).toContain(
            "Unreadable register.",
        );
    });
});
