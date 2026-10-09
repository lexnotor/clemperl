import {
    ORDER_TRANSITIONS,
    type TOrderAction,
    type TOrderStatus,
} from "../constants/order-transitions.constant.js";
import { ForbiddenOrderTransitionError } from "../errors/index.js";

export function canAdvanceOrder(from: TOrderStatus, action: TOrderAction): boolean {
    return ORDER_TRANSITIONS[from][action] !== undefined;
}

export function advanceOrder(from: TOrderStatus, action: TOrderAction): TOrderStatus {
    const to = ORDER_TRANSITIONS[from][action];
    if (to === undefined) {
        throw new ForbiddenOrderTransitionError(from, action);
    }
    return to;
}

// L'écran vendeur construit ses boutons depuis CETTE liste. Une action impossible ne
// s'affiche pas grisée, elle ne s'affiche pas : un bouton qu'on ne peut pas presser est
// une promesse que l'écran ne tient pas.
export function allowedOrderActions(from: TOrderStatus): TOrderAction[] {
    return Object.keys(ORDER_TRANSITIONS[from]) as TOrderAction[];
}
