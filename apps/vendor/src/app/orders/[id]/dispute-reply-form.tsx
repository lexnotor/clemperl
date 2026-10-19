"use client";

import { Button, TextAreaField } from "@clemperl/ui";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { useActionState, useId, type JSX } from "react";
import { attachmentViolations } from "@clemperl/domain/browser";
import { INITIAL_DISPUTE_FORM_STATE } from "../types/dispute-form-state.interface";
import { replyToDisputeAsVendorAction } from "./dispute-actions";
import { violationText } from "./dispute-violation-text";

const T = messages.disputes;

interface DisputeReplyFormProps {
    disputeId: string;
}

// Rendu seulement sur un litige ouvert : la page décide, et le dépôt refuse de toute façon
// un message sur un litige tranché.
export function DisputeReplyForm({ disputeId }: DisputeReplyFormProps): JSX.Element {
    const filesId = useId();
    const [state, action, pending] = useActionState(
        replyToDisputeAsVendorAction,
        INITIAL_DISPUTE_FORM_STATE,
    );

    return (
        <form action={action} className="mt-8 flex flex-col gap-6">
            <input type="hidden" name="disputeId" value={disputeId} />
            <TextAreaField label={T.reply} name="body" required maxLength={5000} rows={4} />
            {/* Un champ natif : plusieurs fichiers s'y choisissent et le navigateur les nomme
                tous, là où le champ du kit n'en affiche qu'un. */}
            <div className="flex flex-col gap-1">
                <label htmlFor={filesId} className="text-muet">
                    {T.attachments}
                </label>
                <input
                    id={filesId}
                    type="file"
                    name="attachments"
                    multiple
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(event) => {
                        // Contrôlées AVANT l'envoi, avec la règle du serveur : au-delà de
                        // 16 Mo, Next refuserait le corps de l'action sans qu'elle tourne.
                        const input = event.currentTarget;
                        const [first] = attachmentViolations(
                            Array.from(input.files ?? []).map((file) => ({
                                mimeType: file.type,
                                sizeBytes: file.size,
                            })),
                        );
                        input.setCustomValidity(
                            first === undefined ? "" : violationText(first.i18nKey, first.i18nArgs),
                        );
                        if (first !== undefined) {
                            input.reportValidity();
                        }
                    }}
                />
            </div>
            {state.message.length > 0 && (
                <ul role="alert" className="flex flex-col gap-2 border-l-2 border-accent pl-4">
                    {state.message.map((line) => (
                        <li key={line} className="text-accent">
                            {line}
                        </li>
                    ))}
                </ul>
            )}
            <Button type="submit" disabled={pending}>
                {pending ? T.sending : T.send}
            </Button>
        </form>
    );
}
