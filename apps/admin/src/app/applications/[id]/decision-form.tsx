"use client";

import messages from "@clemperl/i18n/messages/admin/fr.json";
import { Button } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { decide } from "./actions";
import { INITIAL_DECISION_STATE } from "./types/decision-state.interface";

const REASONS = [
    "INCOMPLETE_FILE",
    "UNREADABLE_DOCUMENT",
    "IDENTITY_MISMATCH",
    "INELIGIBLE_ACTIVITY",
    "OTHER",
] as const;

interface DecisionFormProps {
    applicationId: string;
}

// L'exigence « commentaire obligatoire si le motif est autre » n'est PAS réécrite ici :
// elle vit dans le domaine, et une seconde copie divergerait.
export function DecisionForm({ applicationId }: DecisionFormProps): JSX.Element {
    const t = messages.decision;
    const reasons = messages.vendor.rejectionReason as Record<string, string>;
    const [state, action, pending] = useActionState(decide, INITIAL_DECISION_STATE);

    return (
        <form action={action} className="mt-8 flex flex-col gap-6 border-t border-bordure pt-8">
            <input type="hidden" name="applicationId" value={applicationId} />
            <h2 className="font-titre text-xl">{t.title}</h2>

            <label className="flex flex-col gap-1">
                <span className="text-sm text-muet">{t.reason}</span>
                <select
                    name="reason"
                    defaultValue=""
                    className="w-full border-0 border-b border-bordure bg-transparent px-0 py-2 text-base outline-none focus:border-texte"
                >
                    <option value="">{t.noReason}</option>
                    {REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                            {reasons[reason]}
                        </option>
                    ))}
                </select>
            </label>

            <label className="flex flex-col gap-1">
                <span className="text-sm text-muet">{t.comment}</span>
                <textarea
                    name="comment"
                    rows={3}
                    className="w-full resize-y border-0 border-b border-bordure bg-transparent px-0 py-2 text-base outline-none focus:border-texte"
                />
            </label>

            {state.message.length > 0 && (
                <p role="alert" className="border-l-2 border-accent pl-4 text-sm text-accent">
                    {state.message[0]}
                </p>
            )}

            <div className="flex gap-3">
                <Button type="submit" name="outcome" value="ACCEPTED" disabled={pending}>
                    {t.approve}
                </Button>
                <Button
                    type="submit"
                    name="outcome"
                    value="REJECTED"
                    variant="outline"
                    disabled={pending}
                >
                    {t.reject}
                </Button>
            </div>
        </form>
    );
}
