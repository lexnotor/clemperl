import { describe, expect, it, vi } from "vitest";
import { creerSmtpSender } from "./smtp-sender.utils.js";

const envoiSimule = vi.fn();
vi.mock("nodemailer", () => ({
    default: { createTransport: () => ({ sendMail: envoiSimule }) },
}));

describe("creerSmtpSender", () => {
    it("transmet destinataire, sujet et corps au transport", async () => {
        envoiSimule.mockClear();
        const sender = creerSmtpSender("smtp://mailpit:1025", "ClemPerl <a@b.test>");

        await sender.envoyer({
            destinataire: "client@exemple.test",
            sujet: "Vérifiez votre adresse",
            texte: "Bonjour",
        });

        expect(envoiSimule).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "client@exemple.test",
                subject: "Vérifiez votre adresse",
                text: "Bonjour",
                from: "ClemPerl <a@b.test>",
            }),
        );
    });

    it("refuse une URL SMTP vide plutôt que d'échouer au premier envoi", () => {
        expect(() => creerSmtpSender("", "a@b.test")).toThrow("URL SMTP");
    });
});
