import nodemailer from "nodemailer";
import type { IEmailMessage, IEmailSender } from "../interfaces/index.js";

// Adapter SMTP du port d'envoi. Il vaut pour Mailpit en développement comme pour un
// relais de production : seule l'URL change. L'échec est levé à la construction plutôt
// qu'au premier envoi, pour qu'une configuration absente arrête le démarrage au lieu de
// faire disparaître un courriel d'inscription.
export function createSmtpSender(url: string, from: string): IEmailSender {
    if (!url) {
        throw new Error("URL SMTP absente : aucun courriel ne pourrait partir.");
    }

    const transport = nodemailer.createTransport(url);

    return {
        async send(message: IEmailMessage): Promise<void> {
            await transport.sendMail({
                from,
                to: message.recipient,
                subject: message.subject,
                text: message.text,
                html: message.html,
            });
        },
    };
}
