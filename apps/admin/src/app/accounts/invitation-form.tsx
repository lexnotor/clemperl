"use client";

import { Button, Field, SelectField } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { invite } from "./actions";
import { INITIAL_STATE } from "./types/accounts-state.interface";

interface InvitationFormProps {
    /** Les niveaux viennent du SERVEUR, déjà filtrés par ce que le lecteur peut nommer :
     *  importer le domaine ici tirerait `@clemperl/core` dans le paquet navigateur. */
    levels: { value: string; label: string }[];
    labels: {
        name: string;
        email: string;
        level: string;
        levelPlaceholder: string;
        submit: string;
    };
}

export function InvitationForm({ levels, labels }: InvitationFormProps): JSX.Element {
    const [state, action, pending] = useActionState(invite, INITIAL_STATE);

    return (
        <form action={action} className="mt-4 flex flex-col gap-4">
            <Field label={labels.name} name="name" required maxLength={80} />
            <Field label={labels.email} name="email" type="email" required />
            {/* Le premier choix est VIDE et le champ obligatoire. Sans `defaultValue`, le
                navigateur sélectionne la première entrée NON désactivée, et envoyer sans
                choisir nommerait quelqu'un au premier niveau de la liste. La valeur vide ne
                passe pas non plus côté serveur : elle n'est pas du vocabulaire. */}
            <SelectField
                label={labels.level}
                name="role"
                required
                defaultValue=""
                placeholder={labels.levelPlaceholder}
                options={levels}
            />
            <div className="flex items-center gap-3">
                <Button type="submit" disabled={pending}>
                    {labels.submit}
                </Button>
                {state.message.length > 0 && (
                    <p role="status" className="text-sm text-muet">
                        {state.message.join(" ")}
                    </p>
                )}
            </div>
        </form>
    );
}
