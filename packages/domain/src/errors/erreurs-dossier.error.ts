import { ErreurDomaine } from "@clemperl/core";
import type { TActionDossier } from "../constants/index.js";
import type { TStatutDossier } from "../types/index.js";

export class ErreurTransitionInterdite extends ErreurDomaine {
    constructor(depuis: TStatutDossier, action: TActionDossier) {
        super({
            i18nKey: "errors.vendor_application.forbidden_transition",
            i18nArgs: { depuis, action },
            fallbackMessage: `Transition ${action} interdite depuis l'état ${depuis}.`,
        });
    }
}

export class ErreurDecisionInvalide extends ErreurDomaine {
    constructor(cle: string, fallbackMessage: string) {
        super({ i18nKey: `errors.vendor_application.${cle}`, fallbackMessage });
    }
}
