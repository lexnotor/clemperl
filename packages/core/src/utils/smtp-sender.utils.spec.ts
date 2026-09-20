import { describe, expect, it, vi } from "vitest";
import { createSmtpSender } from "./smtp-sender.utils.js";

const sendMailMock = vi.fn();
vi.mock("nodemailer", () => ({
    default: { createTransport: () => ({ sendMail: sendMailMock }) },
}));

describe("createSmtpSender", () => {
    it("transmet destinataire, sujet et corps au transport", async () => {
        sendMailMock.mockClear();
        const sender = createSmtpSender("smtp://mailpit:1025", "ClemPerl <a@b.test>");

        await sender.send({
            recipient: "client@exemple.test",
            subject: "Vérifiez votre adresse",
            text: "Bonjour",
        });

        expect(sendMailMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "client@exemple.test",
                subject: "Vérifiez votre adresse",
                text: "Bonjour",
                from: "ClemPerl <a@b.test>",
            }),
        );
    });

    it("refuse une URL SMTP vide plutôt que d'échouer au premier envoi", () => {
        expect(() => createSmtpSender("", "a@b.test")).toThrow("URL SMTP");
    });
});
