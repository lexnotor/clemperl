"use client";

import { useActionState, type JSX } from "react";
import { INITIAL_PUBLISH_STATE } from "../types/product-form-state.interface";
import { toggleProductStatus } from "./actions";

interface PublishButtonProps {
    productId: string;
    published: boolean;
    label: string;
}

// Un composant client pour UN bouton, uniquement parce qu'il doit rendre un message.
// Publier peut être refusé — le dépôt exige au moins une photo prête — et un formulaire
// servi par une action qui rend `void` n'a nulle part où le dire : la page se re-rendait
// à l'identique et le vendeur voyait un bouton sans effet.
export function PublishButton(props: PublishButtonProps): JSX.Element {
    const [state, action, pending] = useActionState(toggleProductStatus, INITIAL_PUBLISH_STATE);

    return (
        <form action={action} className="mt-12 flex flex-col gap-2">
            <input type="hidden" name="productId" value={props.productId} />
            <input type="hidden" name="publish" value={props.published ? "0" : "1"} />
            <button type="submit" className="self-start text-sm underline" disabled={pending}>
                {props.label}
            </button>
            {state.error !== null && (
                <p role="alert" className="text-sm text-accent">
                    {state.error}
                </p>
            )}
        </form>
    );
}
