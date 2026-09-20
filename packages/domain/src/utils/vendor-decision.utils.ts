import { InvalidDecisionError } from "../errors/index.js";
import type { ISubmittedDecision } from "../interfaces/index.js";

export function validateDecision(decision: ISubmittedDecision): void {
    // Un administrateur qui tranche son propre dossier n'est plus un arbitre. La règle
    // tient au lien entre deux identités, pas au rôle de l'une d'elles : elle n'a donc
    // pas sa place dans une garde d'accès.
    if (decision.deciderId === decision.applicantId) {
        throw new InvalidDecisionError(
            "self_decision",
            "Un administrateur ne peut pas décider sur son propre dossier.",
        );
    }

    if (decision.outcome === "ACCEPTED") {
        if (decision.reason !== undefined) {
            throw new InvalidDecisionError(
                "reason_forbidden_on_accept",
                "Une acceptation ne porte pas de motif de refus.",
            );
        }
        return;
    }

    if (decision.reason === undefined) {
        throw new InvalidDecisionError("reason_required", "Un refus exige un motif codé.");
    }

    // `OTHER` ne dit rien au candidat : sans commentaire, la resoumission est un coup
    // de dés.
    if (decision.reason === "OTHER" && (decision.comment ?? "").trim() === "") {
        throw new InvalidDecisionError(
            "comment_required",
            "Le motif « autre » exige un commentaire en clair.",
        );
    }
}
