import {
    DISPUTE_OPENING_WINDOW_DAYS,
    DISPUTE_REASONS,
    DISPUTE_SILENCE_DAYS,
    DISPUTE_TRANSITIONS,
    MAX_DISPUTE_MESSAGE_LENGTH,
    type TDisputeAction,
    type TDisputeStatus,
} from "../constants/index.js";
import { ForbiddenDisputeTransitionError } from "../errors/index.js";
import type { IDisputeViolation, ISubmittedAttachment } from "../interfaces/index.js";
import { attachmentViolations } from "./dispute-attachments.utils.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** La plus ancienne date d'expédition encore contestable à `now`. */
export function disputeOpeningCutoff(now: Date): Date {
    return new Date(now.getTime() - DISPUTE_OPENING_WINDOW_DAYS * DAY_MS);
}

// Une commande sans date d'expédition n'ouvre rien : elle a été expédiée avant que la date
// existe, et la reconstituer serait deviner.
export function canOpenDispute(
    order: { status: string; shippedAt: Date | null; hasDispute: boolean },
    now: Date,
): boolean {
    return (
        order.status === "SHIPPED" &&
        order.shippedAt !== null &&
        order.shippedAt.getTime() >= disputeOpeningCutoff(now).getTime() &&
        !order.hasDispute
    );
}

// Une CONDITION calculée à la lecture, jamais un état écrit : aucune horloge ne fait
// avancer un litige, et changer le délai ne demande aucun rattrapage.
export function isDisputeRipe(lastActivityAt: Date, now: Date): boolean {
    return now.getTime() - lastActivityAt.getTime() >= DISPUTE_SILENCE_DAYS * DAY_MS;
}

export function advanceDispute(from: TDisputeStatus, action: TDisputeAction): TDisputeStatus {
    const to = DISPUTE_TRANSITIONS[from][action];
    if (to === undefined) {
        throw new ForbiddenDisputeTransitionError(from, action);
    }
    return to;
}

// L'écran construit ses boutons depuis CETTE liste : une action impossible ne s'affiche pas
// grisée, elle ne s'affiche pas.
export function allowedDisputeActions(from: TDisputeStatus): TDisputeAction[] {
    return Object.keys(DISPUTE_TRANSITIONS[from]) as TDisputeAction[];
}

function violation(key: string, args?: Record<string, unknown>): IDisputeViolation {
    return args === undefined
        ? { i18nKey: `errors.dispute.${key}` }
        : { i18nKey: `errors.dispute.${key}`, i18nArgs: args };
}

// Le récit et les pièces obéissent aux mêmes règles à l'ouverture et dans chaque réponse.
function messageViolations(input: {
    body: string;
    attachments: readonly ISubmittedAttachment[];
}): IDisputeViolation[] {
    const violations: IDisputeViolation[] = [];
    const body = input.body.trim();

    if (body === "") {
        violations.push(violation("body_required"));
    } else if (body.length > MAX_DISPUTE_MESSAGE_LENGTH) {
        violations.push(violation("body_too_long", { maximum: MAX_DISPUTE_MESSAGE_LENGTH }));
    }

    return [...violations, ...attachmentViolations(input.attachments)];
}

// Les violations sont cumulées : une personne qui corrige a besoin de la liste entière,
// sinon elle repart pour un aller-retour par faute.
//
// Le motif se cherche dans un TABLEAU, pas dans un objet : `constructor` n'y est pas.
export function validateDisputeOpening(input: {
    lineIds: readonly string[];
    reason: string;
    body: string;
    attachments: readonly ISubmittedAttachment[];
}): IDisputeViolation[] {
    const violations: IDisputeViolation[] = [];
    if (input.lineIds.length === 0) {
        violations.push(violation("lines_required"));
    }
    if (!DISPUTE_REASONS.includes(input.reason)) {
        violations.push(violation("reason_unknown"));
    }
    return [...violations, ...messageViolations(input)];
}

export function validateDisputeMessage(input: {
    body: string;
    attachments: readonly ISubmittedAttachment[];
}): IDisputeViolation[] {
    return messageViolations(input);
}

// Les deux parties lisent ce commentaire, et c'est la seule explication qu'elles recevront.
export function validateDisputeDecision(input: { comment: string }): IDisputeViolation[] {
    return input.comment.trim() === "" ? [violation("comment_required")] : [];
}
