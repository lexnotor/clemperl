import type {
    E_VENDOR_DECISION,
    E_VENDOR_DOCUMENT_KIND,
    E_VENDOR_REJECTION_REASON,
} from "@clemperl/db/enums";

export type TNatureDocument =
    (typeof E_VENDOR_DOCUMENT_KIND)[keyof typeof E_VENDOR_DOCUMENT_KIND];
export type TSensDecision = (typeof E_VENDOR_DECISION)[keyof typeof E_VENDOR_DECISION];
export type TRaisonRefus =
    (typeof E_VENDOR_REJECTION_REASON)[keyof typeof E_VENDOR_REJECTION_REASON];

// La forme minimale qu'une règle a besoin de connaître d'une pièce : ni le chemin de
// l'objet ni son nom d'origine n'entrent dans une décision.
export interface IPieceDeposee {
    kind: TNatureDocument;
    mimeType: string;
    sizeBytes: number;
}

export interface IDecisionSoumise {
    decideurId: string;
    candidatId: string;
    decision: TSensDecision;
    raison?: TRaisonRefus;
    commentaire?: string;
}
