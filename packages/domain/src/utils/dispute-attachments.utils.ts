import { MAX_DISPUTE_ATTACHMENTS } from "../constants/dispute.constant.js";
import {
    ACCEPTED_MIME_TYPES,
    MAX_DOCUMENT_SIZE_BYTES,
} from "../constants/required-documents.constant.js";
import type { IDisputeViolation, ISubmittedAttachment } from "../interfaces/dispute.interface.js";

// La règle des pièces, écrite UNE fois pour le serveur et pour le navigateur. Le navigateur
// en a besoin : au-delà de 16 Mo, Next refuse le corps d'une action avant qu'elle tourne, et
// l'acheteur perdrait sa page et son récit sans jamais lire pourquoi.
//
// Imports DIRECTS, jamais par les barillets : ceux-ci tirent les erreurs du domaine, donc
// `@clemperl/core` et nodemailer, et le paquet du navigateur cesserait de s'assembler. Ce
// fichier est exporté par `browser.ts`.
export function attachmentViolations(
    attachments: readonly ISubmittedAttachment[],
): IDisputeViolation[] {
    const violations: IDisputeViolation[] = [];
    // Une faute se dit UNE fois, quel que soit le nombre de pièces qui la commettent : trois
    // fois la même phrase n'aide personne, et les écrans s'en servent comme clé de liste.
    const add = (violation: IDisputeViolation): void => {
        if (!violations.some((known) => known.i18nKey === violation.i18nKey)) {
            violations.push(violation);
        }
    };

    if (attachments.length > MAX_DISPUTE_ATTACHMENTS) {
        add({
            i18nKey: "errors.dispute.too_many_attachments",
            i18nArgs: { maximum: MAX_DISPUTE_ATTACHMENTS },
        });
    }
    for (const attachment of attachments) {
        // Les limites sont celles des justificatifs, jamais une copie : la taille est aussi
        // le plafond du stockage.
        if (attachment.sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
            add({
                i18nKey: "errors.dispute.attachment_too_large",
                i18nArgs: { maximum: MAX_DOCUMENT_SIZE_BYTES },
            });
        }
        if (!ACCEPTED_MIME_TYPES.includes(attachment.mimeType)) {
            add({
                i18nKey: "errors.dispute.unsupported_media_type",
                i18nArgs: { type: attachment.mimeType },
            });
        }
    }

    return violations;
}
