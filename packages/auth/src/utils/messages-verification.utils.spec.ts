import { describe, expect, it } from "vitest";
import { construireMessageVerification } from "./messages-verification.utils.js";

describe("construireMessageVerification", () => {
    it("place le lien dans le corps du message", () => {
        const message = construireMessageVerification(
            "https://clemperl.test/verifier?token=abc",
            "fr",
        );
        expect(message.texte).toContain("https://clemperl.test/verifier?token=abc");
    });

    it("écrit en français pour la locale fr", () => {
        expect(construireMessageVerification("https://x.test", "fr").sujet).toContain("Vérifiez");
    });

    it("écrit en anglais pour la locale en", () => {
        expect(construireMessageVerification("https://x.test", "en").sujet).toContain("Verify");
    });

    it("retombe sur le français pour une locale inconnue", () => {
        expect(construireMessageVerification("https://x.test", "de").sujet).toContain("Vérifiez");
    });
});
