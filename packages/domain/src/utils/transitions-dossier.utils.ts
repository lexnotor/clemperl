import { TRANSITIONS_DOSSIER, type TActionDossier } from "../constants/index.js";
import { ErreurTransitionInterdite } from "../errors/index.js";
import type { TStatutDossier } from "../types/index.js";

export function peutTransitionner(
    depuis: TStatutDossier,
    action: TActionDossier,
): boolean {
    return TRANSITIONS_DOSSIER[depuis][action] !== undefined;
}

export function appliquerTransition(
    depuis: TStatutDossier,
    action: TActionDossier,
): TStatutDossier {
    const vers = TRANSITIONS_DOSSIER[depuis][action];
    if (vers === undefined) {
        throw new ErreurTransitionInterdite(depuis, action);
    }
    return vers;
}
