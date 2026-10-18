"use client";

import { useActionState, type JSX } from "react";
import { advance } from "./actions";
import { INITIAL_STATE } from "./types/order-action-state.interface";

interface OrderActionsProps {
    orderId: string;
    actions: readonly { value: string; label: string }[];
    /** Vide quand il n'y a rien à signaler : calculé côté serveur. */
    settledWarning: string;
}

// Aucun import de `@clemperl/domain` ici : son barrel racine tire `@clemperl/core`, puis
// nodemailer, et le paquet du navigateur ne s'assemble plus. Le serveur calcule, ce
// composant reçoit des props.
export function OrderActions(props: OrderActionsProps): JSX.Element {
    const [state, action, pending] = useActionState(advance, INITIAL_STATE);

    return (
        <form action={action} className="mt-12 flex flex-col gap-3 border-t border-bordure pt-8">
            <input type="hidden" name="orderId" value={props.orderId} />
            {props.settledWarning !== "" && (
                <p data-testid="settled-warning" className="text-sm">
                    {props.settledWarning}
                </p>
            )}
            <div className="flex gap-6">
                {props.actions.map((option) => (
                    <button
                        key={option.value}
                        type="submit"
                        name="action"
                        value={option.value}
                        className="text-sm underline"
                        disabled={pending}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            {state.error !== "" && (
                <p role="alert" className="text-sm text-accent">
                    {state.error}
                </p>
            )}
        </form>
    );
}
