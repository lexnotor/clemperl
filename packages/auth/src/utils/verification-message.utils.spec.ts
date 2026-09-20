import { describe, expect, it } from "vitest";
import { buildVerificationMessage } from "./verification-message.utils.js";

describe("buildVerificationMessage", () => {
    it("place le lien dans le corps du message", () => {
        const message = buildVerificationMessage(
            "https://clemperl.test/verify-email?token=abc",
            "fr",
        );
        expect(message.text).toContain("https://clemperl.test/verify-email?token=abc");
    });

    it("écrit en français pour la locale fr", () => {
        expect(buildVerificationMessage("https://x.test", "fr").subject).toContain("Vérifiez");
    });

    it("écrit en anglais pour la locale en", () => {
        expect(buildVerificationMessage("https://x.test", "en").subject).toContain("Verify");
    });

    it("retombe sur le français pour une locale inconnue", () => {
        expect(buildVerificationMessage("https://x.test", "de").subject).toContain("Vérifiez");
    });
});
