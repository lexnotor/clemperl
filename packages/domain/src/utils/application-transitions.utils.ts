import { APPLICATION_TRANSITIONS, type TApplicationAction } from "../constants/index.js";
import { ForbiddenTransitionError } from "../errors/index.js";
import type { TApplicationStatus } from "../types/index.js";

export function canTransition(
    from: TApplicationStatus,
    action: TApplicationAction,
): boolean {
    return APPLICATION_TRANSITIONS[from][action] !== undefined;
}

export function applyTransition(
    from: TApplicationStatus,
    action: TApplicationAction,
): TApplicationStatus {
    const to = APPLICATION_TRANSITIONS[from][action];
    if (to === undefined) {
        throw new ForbiddenTransitionError(from, action);
    }
    return to;
}
