"use client";

import { useActionState, type JSX } from "react";
import {
    INITIAL_ORDER_ACTION_STATE,
    type IOrderActionOption,
} from "../types/order-action-state.interface";
import { advanceOrderAction } from "./actions";

interface OrderActionsProps {
    orderId: string;
    actions: readonly IOrderActionOption[];
}

// Un composant client pour des boutons, uniquement parce qu'ils doivent rendre un message.
// Une boutique a plusieurs membres : la commande peut avoir avancé dans l'onglet d'un
// collègue entre ce rendu et le clic. L'action refuse alors, et un formulaire servi par
// une action qui rend `void` n'a nulle part où le dire.
//
// UN seul formulaire pour toutes les actions, et le bouton qui soumet porte son `name` et
// sa `value`, que React joint au `FormData`. Un formulaire par bouton demanderait un état
// par formulaire, et le refus s'afficherait sous un bouton au lieu de la commande.
export function OrderActions(props: OrderActionsProps): JSX.Element {
    const [state, action, pending] = useActionState(
        advanceOrderAction,
        INITIAL_ORDER_ACTION_STATE,
    );

    return (
        <form action={action} className="mt-12 flex flex-col gap-3 border-t border-bordure pt-8">
            <input type="hidden" name="orderId" value={props.orderId} />
            <div className="flex gap-6">
                {props.actions.map((option) => (
                    <button
                        key={option.action}
                        type="submit"
                        name="action"
                        value={option.action}
                        className="text-sm underline"
                        disabled={pending}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            {state.error !== null && (
                <p role="alert" className="text-sm text-accent">
                    {state.error}
                </p>
            )}
        </form>
    );
}
