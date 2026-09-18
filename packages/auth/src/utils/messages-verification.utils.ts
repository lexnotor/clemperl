import type { IEmailMessage } from "@clemperl/core";

// Les textes vivent ici et non dans les catalogues next-intl : ce message est construit
// côté serveur, hors de tout contexte de requête Next, où `getTranslations` n'est pas
// disponible. Les deux langues sont donc portées par ce fichier, qui reste le seul
// endroit à toucher pour les modifier.
const TEXTES = {
    fr: {
        sujet: "Vérifiez votre adresse e-mail",
        corps: (lien: string): string =>
            `Bienvenue sur ClemPerl.\n\nPour activer votre compte, ouvrez ce lien :\n${lien}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`,
    },
    en: {
        sujet: "Verify your email address",
        corps: (lien: string): string =>
            `Welcome to ClemPerl.\n\nTo activate your account, open this link:\n${lien}\n\nIf you did not sign up, ignore this message.`,
    },
} as const;

// Le destinataire est laissé vide : c'est l'appelant qui le connaît, et le lui faire
// passer ici obligerait à propager une donnée que la construction du texte n'utilise pas.
export function construireMessageVerification(
    lien: string,
    locale: string,
): IEmailMessage {
    const textes = locale === "en" ? TEXTES.en : TEXTES.fr;
    return { destinataire: "", sujet: textes.sujet, texte: textes.corps(lien) };
}
