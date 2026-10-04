"use client";

import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { Button, Field, FormSection, TextAreaField } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { createCollectionAction } from "../actions";
import { INITIAL_COLLECTION_STATE } from "../types/collection-form-state.interface";

export function NewCollectionForm(): JSX.Element {
    const t = messages.collections;
    const [state, action, pending] = useActionState(
        createCollectionAction,
        INITIAL_COLLECTION_STATE,
    );

    return (
        <form action={action} className="mt-12 flex flex-col gap-12">
            <FormSection title={t.detailsSection}>
                <Field
                    label={t.collectionTitle}
                    name="title"
                    required
                    minLength={2}
                    maxLength={120}
                />
                <TextAreaField
                    label={t.description}
                    name="description"
                    maxLength={2000}
                    rows={3}
                    hint={t.descriptionHint}
                />
            </FormSection>

            {state.message.length > 0 && (
                <p role="alert" className="text-sm text-accent">
                    {state.message.join(" ")}
                </p>
            )}

            <Button type="submit" disabled={pending}>
                {t.save}
            </Button>
        </form>
    );
}
