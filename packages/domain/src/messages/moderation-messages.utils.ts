import type { IEmailMessage } from "@clemperl/core";

// Les textes vivent ici et non dans les catalogues next-intl : ces messages sont construits
// hors de tout contexte de requête Next, où `getTranslations` n'existe pas.
//
// Le message dit ce qui est arrivé et ce que le vendeur peut faire. Il ne menace pas : le
// retrait est un avertissement, et republier reste possible.
const TEXTS = {
    fr: {
        retirement: (title: string, reason: string) => ({
            subject: `« ${title} » a été retiré du catalogue`,
            text: `Votre article « ${title} » a été retiré du catalogue et repassé en brouillon.\n\nMotif :\n${reason}\n\nVous le retrouvez dans votre espace vendeur. Vous pouvez le corriger et le publier à nouveau.`,
        }),
    },
    en: {
        retirement: (title: string, reason: string) => ({
            subject: `"${title}" has been pulled from the catalogue`,
            text: `Your item "${title}" has been pulled from the catalogue and moved back to draft.\n\nReason:\n${reason}\n\nYou will find it in your vendor area. You can correct it and publish it again.`,
        }),
    },
} as const;

function texts(locale: string): (typeof TEXTS)["fr"] {
    return locale === "en" ? TEXTS.en : TEXTS.fr;
}

export function buildRetirementMessage(
    title: string,
    reason: string,
    locale: string,
): IEmailMessage {
    return { recipient: "", ...texts(locale).retirement(title, reason) };
}
