import type { IEmailMessage } from "@clemperl/core";

// Ce message part aussi vers des gens qui n'ont rien demandé : quelqu'un peut saisir
// l'adresse d'un autre. Il dit donc explicitement quoi faire dans ce cas, et ne révèle
// rien sur l'existence du compte.
const TEXTS = {
    fr: {
        subject: "Réinitialisation de votre mot de passe",
        body: (link: string): string =>
            `Une réinitialisation de mot de passe a été demandée pour cette adresse.\n\nPour choisir un nouveau mot de passe, ouvrez ce lien :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
    },
    en: {
        subject: "Reset your password",
        body: (link: string): string =>
            `A password reset was requested for this address.\n\nTo choose a new password, open this link:\n${link}\n\nIf you did not request this, ignore this message: your password stays unchanged.`,
    },
} as const;

export function buildPasswordResetMessage(link: string, locale: string): IEmailMessage {
    const texts = locale === "en" ? TEXTS.en : TEXTS.fr;
    return { recipient: "", subject: texts.subject, text: texts.body(link) };
}
