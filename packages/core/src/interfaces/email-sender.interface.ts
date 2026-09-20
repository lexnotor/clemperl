import type { IEmailMessage } from "./email-message.interface.js";

// Le port d'envoi. Un seul point de bascule entre Mailpit en développement et un
// fournisseur en production : le code qui envoie ne connaît que cette interface.
export interface IEmailSender {
    send(message: IEmailMessage): Promise<void>;
}
