import {
    PIECES_OBLIGATOIRES,
    TAILLE_MAX_PIECE_OCTETS,
    TYPES_MIME_ACCEPTES,
} from "../constants/index.js";
import type { IPieceDeposee, IViolationDossier } from "../interfaces/index.js";
import type { TDepotDossier } from "../schemas/index.js";

// Les violations sont cumulées : un candidat qui corrige a besoin de la liste entière,
// sinon il repart pour un aller-retour par faute.
export function validerDossier(
    _champs: TDepotDossier,
    pieces: readonly IPieceDeposee[],
): IViolationDossier[] {
    const violations: IViolationDossier[] = [];

    for (const nature of PIECES_OBLIGATOIRES) {
        if (!pieces.some((piece) => piece.kind === nature)) {
            violations.push({
                i18nKey: "errors.vendor_application.missing_document",
                i18nArgs: { nature },
            });
        }
    }

    const vues = new Set<string>();
    for (const piece of pieces) {
        if (vues.has(piece.kind)) {
            violations.push({
                i18nKey: "errors.vendor_application.duplicate_document",
                i18nArgs: { nature: piece.kind },
            });
        }
        vues.add(piece.kind);

        if (!TYPES_MIME_ACCEPTES.includes(piece.mimeType)) {
            violations.push({
                i18nKey: "errors.vendor_application.unsupported_media_type",
                i18nArgs: { nature: piece.kind, type: piece.mimeType },
            });
        }

        if (piece.sizeBytes > TAILLE_MAX_PIECE_OCTETS) {
            violations.push({
                i18nKey: "errors.vendor_application.document_too_large",
                i18nArgs: { nature: piece.kind, maximum: TAILLE_MAX_PIECE_OCTETS },
            });
        }
    }

    return violations;
}
