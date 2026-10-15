"use client";

import { Button } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { retire, review } from "./actions";
import { INITIAL_STATE } from "./types/moderation-state.interface";

interface ModerationRowProps {
    productId: string;
    /** Les motifs viennent du SERVEUR : importer le domaine ici tirerait `@clemperl/core`
     *  dans le paquet navigateur. */
    reasons: { value: string; label: string }[];
    labels: {
        review: string;
        retire: string;
        reasonLabel: string;
        reasonPlaceholder: string;
        commentLabel: string;
        confirm: string;
    };
}

export function ModerationRow(props: ModerationRowProps): JSX.Element {
    const [etatExamen, actionExamen, examenEnCours] = useActionState(review, INITIAL_STATE);
    const [etatRetrait, actionRetrait, retraitEnCours] = useActionState(retire, INITIAL_STATE);

    return (
        <div className="flex flex-col items-end gap-2">
            <div className="flex items-start gap-3">
                <form action={actionExamen}>
                    <input type="hidden" name="productId" value={props.productId} />
                    <Button type="submit" disabled={examenEnCours}>
                        {props.labels.review}
                    </Button>
                </form>

                <details>
                    <summary className="cursor-pointer border border-bordure px-4 py-2 text-sm">
                        {props.labels.retire}
                    </summary>
                    <form action={actionRetrait} className="mt-3 flex flex-col gap-3">
                        <input type="hidden" name="productId" value={props.productId} />
                        <label className="flex flex-col gap-1 text-sm">
                            {props.labels.reasonLabel}
                            {/* Le premier choix est VIDE et le champ obligatoire. Sans
                                cela, le premier motif de la liste est sélectionné par
                                défaut, et confirmer sans choisir accuserait de
                                contrefaçon quelqu'un qu'on voulait seulement rappeler à
                                l'ordre. La valeur vide ne passe pas non plus côté
                                serveur : elle n'est pas du vocabulaire. */}
                            <select
                                name="reason"
                                required
                                defaultValue=""
                                className="border border-bordure bg-transparent px-3 py-2 text-sm"
                            >
                                <option value="">{props.labels.reasonPlaceholder}</option>
                                {props.reasons.map((motif) => (
                                    <option key={motif.value} value={motif.value}>
                                        {motif.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1 text-sm">
                            {props.labels.commentLabel}
                            <textarea
                                name="comment"
                                rows={3}
                                className="border border-bordure bg-transparent px-3 py-2 text-sm"
                            />
                        </label>
                        <Button type="submit" disabled={retraitEnCours}>
                            {props.labels.confirm}
                        </Button>
                    </form>
                </details>
            </div>

            {[...etatExamen.message, ...etatRetrait.message].map((phrase) => (
                <p key={phrase} role="alert" className="text-sm text-muet">
                    {phrase}
                </p>
            ))}
        </div>
    );
}
