"use client";

import { Button, SelectField, TextAreaField } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { decide } from "./actions";
import { INITIAL_DECISION_STATE } from "./types/decision-state.interface";

interface DecisionFormProps {
    disputeId: string;
    outcomes: readonly { value: string; label: string }[];
    labels: {
        title: string;
        outcome: string;
        outcomePlaceholder: string;
        comment: string;
        noRefund: string;
        submit: string;
        submitting: string;
    };
}

// Aucune issue choisie d'office : un choix par défaut trancherait à la place de
// l'administrateur, et aucune garde ne l'attraperait, l'issue étant du vocabulaire.
export function DecisionForm({ disputeId, outcomes, labels }: DecisionFormProps): JSX.Element {
    const [state, action, pending] = useActionState(decide, INITIAL_DECISION_STATE);

    return (
        <form action={action} className="mt-12 flex flex-col gap-6 border-t border-bordure pt-8">
            <h2 className="font-titre text-2xl">{labels.title}</h2>
            <input type="hidden" name="disputeId" value={disputeId} />
            <SelectField
                label={labels.outcome}
                name="outcome"
                required
                defaultValue=""
                placeholder={labels.outcomePlaceholder}
                options={outcomes}
            />
            <TextAreaField label={labels.comment} name="comment" required rows={4} />
            <p className="text-sm text-muet">{labels.noRefund}</p>
            {state.message.length > 0 && (
                <p role="alert" className="text-sm text-accent">
                    {state.message.join(" ")}
                </p>
            )}
            <Button type="submit" disabled={pending}>
                {pending ? labels.submitting : labels.submit}
            </Button>
        </form>
    );
}
