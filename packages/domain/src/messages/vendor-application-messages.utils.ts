import type { IEmailMessage } from "@clemperl/core";

// Les textes vivent ici et non dans les catalogues next-intl : ces messages sont
// construits hors de tout contexte de requête Next, où `getTranslations` n'existe pas.
const TEXTS = {
    fr: {
        acknowledgement: (shop: string) => ({
            subject: `Votre demande pour « ${shop} » nous est bien parvenue`,
            text: `Nous avons reçu votre dossier de candidature pour « ${shop} ».\n\nNotre équipe l'examine et vous répondra par courriel. Vous pouvez suivre son état depuis votre espace client.`,
        }),
        approval: (shop: string) => ({
            subject: `« ${shop} » est validée`,
            text: `Bonne nouvelle : votre boutique « ${shop} » vient d'être validée.\n\nVous pouvez désormais accéder à votre espace vendeur.`,
        }),
        rejection: (shop: string, reason: string) => ({
            subject: `Votre demande pour « ${shop} » demande une correction`,
            text: `Votre dossier pour « ${shop} » n'a pas pu être validé en l'état.\n\nMotif :\n${reason}\n\nVous pouvez le corriger et le soumettre à nouveau depuis votre espace client.`,
        }),
    },
    en: {
        acknowledgement: (shop: string) => ({
            subject: `We have received your application for "${shop}"`,
            text: `We have received your vendor application for "${shop}".\n\nOur team is reviewing it and will reply by email. You can follow its status from your account.`,
        }),
        approval: (shop: string) => ({
            subject: `"${shop}" has been approved`,
            text: `Good news: your shop "${shop}" has just been approved.\n\nYou can now access your vendor area.`,
        }),
        rejection: (shop: string, reason: string) => ({
            subject: `Your application for "${shop}" needs a correction`,
            text: `Your application for "${shop}" could not be approved as it stands.\n\nReason:\n${reason}\n\nYou can correct it and submit it again from your account.`,
        }),
    },
} as const;

function texts(locale: string): (typeof TEXTS)["fr"] {
    return locale === "en" ? TEXTS.en : TEXTS.fr;
}

// Le destinataire est laissé vide : c'est l'appelant qui le connaît, et le lui faire
// passer ici obligerait à propager une donnée que la construction du texte n'utilise pas.
export function buildAcknowledgementMessage(shopName: string, locale: string): IEmailMessage {
    return { recipient: "", ...texts(locale).acknowledgement(shopName) };
}

export function buildApprovalMessage(shopName: string, locale: string): IEmailMessage {
    return { recipient: "", ...texts(locale).approval(shopName) };
}

export function buildRejectionMessage(
    shopName: string,
    reason: string,
    locale: string,
): IEmailMessage {
    return { recipient: "", ...texts(locale).rejection(shopName, reason) };
}
