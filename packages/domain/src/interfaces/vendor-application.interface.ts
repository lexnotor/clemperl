import type {
    E_VENDOR_DECISION,
    E_VENDOR_DOCUMENT_KIND,
    E_VENDOR_REJECTION_REASON,
} from "@clemperl/db/enums";

export type TDocumentKind =
    (typeof E_VENDOR_DOCUMENT_KIND)[keyof typeof E_VENDOR_DOCUMENT_KIND];
export type TDecisionOutcome = (typeof E_VENDOR_DECISION)[keyof typeof E_VENDOR_DECISION];
export type TRejectionReason =
    (typeof E_VENDOR_REJECTION_REASON)[keyof typeof E_VENDOR_REJECTION_REASON];

// La forme minimale qu'une règle a besoin de connaître d'une pièce : ni le chemin de
// l'objet ni son nom d'origine n'entrent dans une décision.
export interface ISubmittedDocument {
    kind: TDocumentKind;
    mimeType: string;
    sizeBytes: number;
}

export interface ISubmittedDecision {
    deciderId: string;
    applicantId: string;
    outcome: TDecisionOutcome;
    reason?: TRejectionReason;
    comment?: string;
}
