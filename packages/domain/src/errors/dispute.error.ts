import { DomainError } from "@clemperl/core";
import type { TDisputeAction, TDisputeStatus } from "../constants/index.js";

// Une erreur à elle, et non celle des commandes : ses arguments sont des états de litige,
// et un message qui parlerait de commande égarerait celui qui le lit.
export class ForbiddenDisputeTransitionError extends DomainError {
    constructor(from: TDisputeStatus, action: TDisputeAction) {
        super({
            i18nKey: "errors.dispute.forbidden_transition",
            i18nArgs: { from, action },
            fallbackMessage: `Transition ${action} interdite depuis l'état ${from} du litige.`,
        });
    }
}
