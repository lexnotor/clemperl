import type { IEmailMessage } from "@clemperl/core";

// Les textes vivent ici et non dans les catalogues next-intl : ces messages sont
// construits hors de tout contexte de requête Next, où `getTranslations` n'existe pas.
const TEXTES = {
    fr: {
        accuse: (boutique: string) => ({
            sujet: `Votre demande pour « ${boutique} » nous est bien parvenue`,
            texte: `Nous avons reçu votre dossier de candidature pour « ${boutique} ».\n\nNotre équipe l'examine et vous répondra par courriel. Vous pouvez suivre son état depuis votre espace client.`,
        }),
        acceptation: (boutique: string) => ({
            sujet: `« ${boutique} » est validée`,
            texte: `Bonne nouvelle : votre boutique « ${boutique} » vient d'être validée.\n\nVous pouvez désormais accéder à votre espace vendeur.`,
        }),
        refus: (boutique: string, motif: string) => ({
            sujet: `Votre demande pour « ${boutique} » demande une correction`,
            texte: `Votre dossier pour « ${boutique} » n'a pas pu être validé en l'état.\n\nMotif :\n${motif}\n\nVous pouvez le corriger et le soumettre à nouveau depuis votre espace client.`,
        }),
    },
    en: {
        accuse: (boutique: string) => ({
            sujet: `We have received your application for "${boutique}"`,
            texte: `We have received your vendor application for "${boutique}".\n\nOur team is reviewing it and will reply by email. You can follow its status from your account.`,
        }),
        acceptation: (boutique: string) => ({
            sujet: `"${boutique}" has been approved`,
            texte: `Good news: your shop "${boutique}" has just been approved.\n\nYou can now access your vendor area.`,
        }),
        refus: (boutique: string, motif: string) => ({
            sujet: `Your application for "${boutique}" needs a correction`,
            texte: `Your application for "${boutique}" could not be approved as it stands.\n\nReason:\n${motif}\n\nYou can correct it and submit it again from your account.`,
        }),
    },
} as const;

function textes(locale: string): (typeof TEXTES)["fr"] {
    return locale === "en" ? TEXTES.en : TEXTES.fr;
}

// Le destinataire est laissé vide : c'est l'appelant qui le connaît, et le lui faire
// passer ici obligerait à propager une donnée que la construction du texte n'utilise pas.
export function construireMessageAccuseReception(
    nomBoutique: string,
    locale: string,
): IEmailMessage {
    return { destinataire: "", ...textes(locale).accuse(nomBoutique) };
}

export function construireMessageAcceptation(
    nomBoutique: string,
    locale: string,
): IEmailMessage {
    return { destinataire: "", ...textes(locale).acceptation(nomBoutique) };
}

export function construireMessageRefus(
    nomBoutique: string,
    motif: string,
    locale: string,
): IEmailMessage {
    return { destinataire: "", ...textes(locale).refus(nomBoutique, motif) };
}
