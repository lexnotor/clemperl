"use client";

import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { Button, Field, FormSection, TextAreaField } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { createProductAction } from "../actions";
import { INITIAL_PRODUCT_STATE } from "../types/product-form-state.interface";

export function NewProductForm(): JSX.Element {
    const t = messages.products;
    const [state, action, pending] = useActionState(createProductAction, INITIAL_PRODUCT_STATE);

    return (
        <form action={action} className="mt-12 flex flex-col gap-12">
            <FormSection title={t.detailsSection}>
                <Field label={t.productTitle} name="title" required minLength={2} maxLength={120} />
                <TextAreaField
                    label={t.description}
                    name="description"
                    required
                    minLength={20}
                    maxLength={4000}
                    rows={4}
                    hint={t.descriptionHint}
                />
                {/* Un champ TEXTE et non `type="number"` : la saisie francophone écrit
                    « 12,50 », qu'un contrôle numérique refuse selon la locale du
                    navigateur, sans rien dire. La conversion est faite par le domaine. */}
                <Field
                    label={t.price}
                    name="price"
                    required
                    inputMode="decimal"
                    hint={t.priceHint}
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
