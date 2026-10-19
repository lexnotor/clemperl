// Ce que la validation connaît d'une pièce : ce que le navigateur en a déclaré. Les octets
// eux-mêmes ne sont pas lus, comme pour les justificatifs de candidature.
export interface ISubmittedAttachment {
    mimeType: string;
    sizeBytes: number;
}

// Une violation est une clé et ses arguments, jamais une phrase : c'est l'appelant qui
// connaît la langue de celui qui la lira.
export interface IDisputeViolation {
    i18nKey: string;
    i18nArgs?: Record<string, unknown>;
}
