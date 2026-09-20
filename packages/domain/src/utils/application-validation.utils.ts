import {
    ACCEPTED_MIME_TYPES,
    MAX_DOCUMENT_SIZE_BYTES,
    REQUIRED_DOCUMENTS,
} from "../constants/index.js";
import type { IApplicationViolation, ISubmittedDocument } from "../interfaces/index.js";
import type { TApplicationSubmission } from "../schemas/index.js";

// Les violations sont cumulées : un candidat qui corrige a besoin de la liste entière,
// sinon il repart pour un aller-retour par faute.
export function validateApplication(
    _fields: TApplicationSubmission,
    documents: readonly ISubmittedDocument[],
): IApplicationViolation[] {
    const violations: IApplicationViolation[] = [];

    for (const kind of REQUIRED_DOCUMENTS) {
        if (!documents.some((document) => document.kind === kind)) {
            violations.push({
                i18nKey: "errors.vendor_application.missing_document",
                i18nArgs: { kind },
            });
        }
    }

    const seen = new Set<string>();
    for (const document of documents) {
        if (seen.has(document.kind)) {
            violations.push({
                i18nKey: "errors.vendor_application.duplicate_document",
                i18nArgs: { kind: document.kind },
            });
        }
        seen.add(document.kind);

        if (!ACCEPTED_MIME_TYPES.includes(document.mimeType)) {
            violations.push({
                i18nKey: "errors.vendor_application.unsupported_media_type",
                i18nArgs: { kind: document.kind, type: document.mimeType },
            });
        }

        if (document.sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
            violations.push({
                i18nKey: "errors.vendor_application.document_too_large",
                i18nArgs: { kind: document.kind, maximum: MAX_DOCUMENT_SIZE_BYTES },
            });
        }
    }

    return violations;
}
