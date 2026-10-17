import type { IEmailMessage } from "@clemperl/core";

// Trois jours, en secondes. Un collègue ouvre son courriel le lendemain ou le lundi
// suivant : un lien mort à l'arrivée ferait de la demande d'aide son premier acte. La
// phrase des textes ci-dessous annonce cette durée, et le test relie les deux.
export const RESET_PASSWORD_TOKEN_EXPIRES_IN = 3 * 24 * 60 * 60;

// Ce message part vers quelqu'un qui vient d'être invité, pas vers quelqu'un qui a
// oublié son mot de passe. Il ne reprend donc surtout pas le conseil « ignorez ce
// message » du courriel de réinitialisation : ici, ignorer le lien, c'est ne jamais
// ouvrir son compte.
const TEXTS = {
    fr: {
        subject: "Votre compte d'administration ClemPerl est prêt",
        body: (link: string): string =>
            `Bonjour,\n\nUn compte d'administration ClemPerl vient d'être créé pour cette adresse.\n\nPour l'activer, choisissez votre mot de passe en ouvrant ce lien :\n${link}\n\nCe lien est valable trois jours et ne peut servir qu'une seule fois. Passé ce délai, demandez à la personne qui vous a invité de vous en envoyer un nouveau.\n\nBienvenue dans l'équipe.`,
    },
    en: {
        subject: "Your ClemPerl administration account is ready",
        body: (link: string): string =>
            `Hello,\n\nA ClemPerl administration account has just been created for this address.\n\nTo activate it, choose your password by opening this link:\n${link}\n\nThis link is valid for three days and can only be used once. After that, ask the person who invited you to send you a new one.\n\nWelcome to the team.`,
    },
} as const;

export function buildAdministratorInvitationMessage(
    link: string,
    locale: string,
): IEmailMessage {
    const texts = locale === "en" ? TEXTS.en : TEXTS.fr;
    return { recipient: "", subject: texts.subject, text: texts.body(link) };
}
