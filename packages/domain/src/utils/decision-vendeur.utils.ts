import { ErreurDecisionInvalide } from "../errors/index.js";
import type { IDecisionSoumise } from "../interfaces/index.js";

export function validerDecision(entree: IDecisionSoumise): void {
    // Un administrateur qui tranche son propre dossier n'est plus un arbitre. La règle
    // tient au lien entre deux identités, pas au rôle de l'une d'elles : elle n'a donc
    // pas sa place dans une garde d'accès.
    if (entree.decideurId === entree.candidatId) {
        throw new ErreurDecisionInvalide(
            "self_decision",
            "Un administrateur ne peut pas décider sur son propre dossier.",
        );
    }

    if (entree.decision === "ACCEPTED") {
        if (entree.raison !== undefined) {
            throw new ErreurDecisionInvalide(
                "reason_forbidden_on_accept",
                "Une acceptation ne porte pas de motif de refus.",
            );
        }
        return;
    }

    if (entree.raison === undefined) {
        throw new ErreurDecisionInvalide("reason_required", "Un refus exige un motif codé.");
    }

    // `OTHER` ne dit rien au candidat : sans commentaire, la resoumission est un coup
    // de dés.
    if (entree.raison === "OTHER" && (entree.commentaire ?? "").trim() === "") {
        throw new ErreurDecisionInvalide(
            "comment_required",
            "Le motif « autre » exige un commentaire en clair.",
        );
    }
}
