import type { IEmailMessage } from "@clemperl/core";

// Les textes vivent ici et non dans les catalogues next-intl : ce message est construit
// côté serveur, hors de tout contexte de requête Next, où `getTranslations` n'est pas
// disponible. Les deux langues sont donc portées par ce fichier, qui reste le seul
// endroit à toucher pour les modifier.
const TEXTS = {
    fr: {
        subject: "Vérifiez votre adresse e-mail",
        body: (link: string): string =>
            `Bienvenue sur ClemPerl.\n\nPour activer votre compte, ouvrez ce lien :\n${link}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`,
    },
    en: {
        subject: "Verify your email address",
        body: (link: string): string =>
            `Welcome to ClemPerl.\n\nTo activate your account, open this link:\n${link}\n\nIf you did not sign up, ignore this message.`,
    },
} as const;

// Le destinataire est laissé vide : c'est l'appelant qui le connaît, et le lui faire
// passer ici obligerait à propager une donnée que la construction du texte n'utilise pas.
export function buildVerificationMessage(link: string, locale: string): IEmailMessage {
    const texts = locale === "en" ? TEXTS.en : TEXTS.fr;
    return { recipient: "", subject: texts.subject, text: texts.body(link) };
}
