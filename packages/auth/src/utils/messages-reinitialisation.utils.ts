import type { IEmailMessage } from "@clemperl/core";

// Ce message part aussi vers des gens qui n'ont rien demandé : quelqu'un peut saisir
// l'adresse d'un autre. Il dit donc explicitement quoi faire dans ce cas, et ne révèle
// rien sur l'existence du compte.
const TEXTES = {
    fr: {
        sujet: "Réinitialisation de votre mot de passe",
        corps: (lien: string): string =>
            `Une réinitialisation de mot de passe a été demandée pour cette adresse.\n\nPour choisir un nouveau mot de passe, ouvrez ce lien :\n${lien}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
    },
    en: {
        sujet: "Reset your password",
        corps: (lien: string): string =>
            `A password reset was requested for this address.\n\nTo choose a new password, open this link:\n${lien}\n\nIf you did not request this, ignore this message: your password stays unchanged.`,
    },
} as const;

export function construireMessageReinitialisation(
    lien: string,
    locale: string,
): IEmailMessage {
    const textes = locale === "en" ? TEXTES.en : TEXTES.fr;
    return { destinataire: "", sujet: textes.sujet, texte: textes.corps(lien) };
}
