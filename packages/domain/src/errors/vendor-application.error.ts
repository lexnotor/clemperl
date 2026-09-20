import { DomainError } from "@clemperl/core";
import type { TApplicationAction } from "../constants/index.js";
import type { TApplicationStatus } from "../types/index.js";

export class ForbiddenTransitionError extends DomainError {
    constructor(from: TApplicationStatus, action: TApplicationAction) {
        super({
            i18nKey: "errors.vendor_application.forbidden_transition",
            i18nArgs: { from, action },
            fallbackMessage: `Transition ${action} interdite depuis l'état ${from}.`,
        });
    }
}

export class InvalidDecisionError extends DomainError {
    constructor(key: string, fallbackMessage: string) {
        super({ i18nKey: `errors.vendor_application.${key}`, fallbackMessage });
    }
}
