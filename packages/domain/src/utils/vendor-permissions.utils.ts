import { E_APPLICATION_ACTION } from "../constants/index.js";
import type { TApplicationStatus } from "../types/index.js";
import { canTransition } from "./application-transitions.utils.js";

interface IActor {
    id: string;
    role: "CUSTOMER" | "ADMIN";
}

export function canViewApplication(actor: IActor, application: { applicantId: string }): boolean {
    return actor.role === "ADMIN" || actor.id === application.applicantId;
}

export function canDecide(actor: IActor): boolean {
    return actor.role === "ADMIN";
}

// La question « l'état autorise-t-il ? » est déléguée à la machine à états : réécrire
// `status === "REJECTED"` ici créerait une seconde vérité à tenir synchrone.
export function canResubmit(
    actor: IActor,
    application: { applicantId: string; status: TApplicationStatus },
): boolean {
    return (
        actor.id === application.applicantId &&
        canTransition(application.status, E_APPLICATION_ACTION.RESUBMIT)
    );
}

export function isMemberOf(
    members: readonly { userId: string }[],
    userId: string,
): boolean {
    return members.some((member) => member.userId === userId);
}
