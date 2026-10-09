import { DomainError } from "@clemperl/core";
import type { TOrderAction, TOrderStatus } from "../constants/index.js";

// Une erreur à elle, et non celle des candidatures : cette dernière est typée sur
// `TApplicationStatus` et porte un message qui parle de dossier. Un vendeur qui lirait
// « Ce dossier a déjà été traité » à propos d'une commande ne comprendrait rien.
export class ForbiddenOrderTransitionError extends DomainError {
    constructor(from: TOrderStatus, action: TOrderAction) {
        super({
            i18nKey: "errors.order.forbidden_transition",
            i18nArgs: { from, action },
            fallbackMessage: `Transition ${action} interdite depuis l'état ${from}.`,
        });
    }
}
