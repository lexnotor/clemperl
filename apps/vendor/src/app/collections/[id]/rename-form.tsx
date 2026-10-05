"use client";

import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { Button, Field, FormSection, TextAreaField } from "@clemperl/ui";
import { useActionState, useState, type JSX } from "react";
import { INITIAL_COLLECTION_STATE } from "../types/collection-form-state.interface";
import { renameCollectionAction } from "./actions";

interface RenameFormProps {
    collectionId: string;
    title: string;
    description: string | null;
    /** Vrai dès la première publication : le slug est alors figé, et l'écran le dit. */
    slugFrozen: boolean;
}

// Client, parce qu'il doit rendre un message : un titre déjà pris n'est pas une panne, et
// « réessayez » enverrait le vendeur reproduire exactement le même refus.
export function RenameForm(props: RenameFormProps): JSX.Element {
    const t = messages.collections;
    const [state, action, pending] = useActionState(
        renameCollectionAction,
        INITIAL_COLLECTION_STATE,
    );

    // CONTRÔLÉS, et non `defaultValue`. React 19 réinitialise les champs non contrôlés
    // d'un formulaire servi par une action, et tout rendu de la page les ramène à la
    // valeur du serveur : la correction que le vendeur vient de taper disparaît alors
    // entre sa frappe et son envoi, sans rien à l'écran pour le dire.
    const [titre, setTitre] = useState(props.title);
    const [description, setDescription] = useState(props.description ?? "");

    return (
        <form action={action} className="mt-12 flex flex-col gap-8 border-t border-bordure pt-8">
            <input type="hidden" name="collectionId" value={props.collectionId} />

            <FormSection title={t.detailsSection}>
                <Field
                    label={t.collectionTitle}
                    name="title"
                    required
                    minLength={2}
                    maxLength={120}
                    value={titre}
                    onChange={(event) => setTitre(event.target.value)}
                    // Le vendeur doit savoir que son adresse publique ne suivra plus son
                    // titre, sinon il croit l'avoir corrigée partout.
                    hint={props.slugFrozen ? t.slugFrozenHint : t.slugFollowsHint}
                />
                <TextAreaField
                    label={t.description}
                    name="description"
                    maxLength={2000}
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    hint={t.descriptionHint}
                />
            </FormSection>

            {state.message.length > 0 && (
                <p role="alert" className="text-sm text-accent">
                    {state.message.join(" ")}
                </p>
            )}
            {state.saved && <p className="text-sm text-muet">{t.renamed}</p>}

            <Button type="submit" disabled={pending}>
                {t.saveChanges}
            </Button>
        </form>
    );
}
