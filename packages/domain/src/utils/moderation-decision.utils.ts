import { MODERATION_REASONS } from "../constants/moderation-reasons.constant.js";
import { InvalidDecisionError } from "../errors/index.js";

export interface IModerationDecision {
    reason: string;
    comment?: string | undefined;
}

// La MÊME règle que le refus d'une candidature en T1b, et volontairement pas le même code :
// les deux vocabulaires n'ont rien à voir, et les fusionner ferait accepter
// « INCOMPLETE_FILE » sur un produit.
//
// `InvalidDecisionError` est réutilisée telle quelle : elle porte une clé de traduction et
// un message de repli, ce qui est exactement ce qu'il faut.
export function validateModerationDecision(decision: IModerationDecision): void {
    if (!MODERATION_REASONS.includes(decision.reason)) {
        throw new InvalidDecisionError("reason_unknown", "Ce motif de retrait n'existe pas.");
    }

    // « Autre » ne dit rien au vendeur. Le commentaire est ce qui rend le retrait
    // actionnable, donc il est exigé, et des espaces ne sont pas un commentaire.
    if (decision.reason === "OTHER" && (decision.comment ?? "").trim() === "") {
        throw new InvalidDecisionError("comment_required", "Un motif « autre » exige un commentaire.");
    }
}
