"use client";

import { Button, CheckboxField, FormSection, SelectField, TextAreaField } from "@clemperl/ui";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useId, type JSX } from "react";
import { openDisputeAction } from "../actions";
import { INITIAL_DISPUTE_FORM_STATE } from "../types/dispute-form-state.interface";
import { checkAttachments } from "./attachment-check";

interface OpenDisputeFormProps {
    reference: string;
    lines: readonly { id: string; label: string }[];
    /** Les motifs viennent du serveur, qui les tient de l'énumération : ce composant
     * n'importe pas `@clemperl/domain`, dont le barillet tire des modules serveur. */
    reasons: readonly { value: string; label: string }[];
}

export function OpenDisputeForm({ reference, lines, reasons }: OpenDisputeFormProps): JSX.Element {
    const t = useTranslations("disputes");
    const locale = useLocale();
    const tErrors = useTranslations("errors.dispute");
    const filesId = useId();
    const [state, action, pending] = useActionState(openDisputeAction, INITIAL_DISPUTE_FORM_STATE);

    return (
        <form action={action} className="mt-10 flex flex-col gap-10">
            <input type="hidden" name="reference" value={reference} />
            <input type="hidden" name="locale" value={locale} />

            <FormSection title={t("lines")}>
                {lines.map((line) => (
                    <CheckboxField key={line.id} name="lineIds" value={line.id} label={line.label} />
                ))}
            </FormSection>

            {/* Aucun motif choisi d'office : un choix par défaut accuserait le vendeur d'un
                tort que l'acheteur n'a peut-être pas voulu nommer. */}
            <SelectField
                label={t("reason")}
                name="reason"
                required
                defaultValue=""
                placeholder={t("reasonPlaceholder")}
                options={reasons}
            />

            <TextAreaField label={t("body")} name="body" required maxLength={5000} rows={6} />

            {/* Un champ natif : plusieurs fichiers s'y choisissent, et le navigateur les
                nomme tous, là où le champ du kit n'en affiche qu'un. */}
            <div className="flex flex-col gap-1">
                <label htmlFor={filesId} className="text-sm text-muet">
                    {t("attachments")}
                </label>
                <input
                    id={filesId}
                    type="file"
                    name="attachments"
                    multiple
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(event) =>
                        checkAttachments(event.currentTarget, (violation) =>
                            tErrors(violation.i18nKey.replace("errors.dispute.", "") as never, violation.i18nArgs as never),
                        )
                    }
                    className="text-sm"
                />
            </div>

            {state.message.length > 0 && (
                <ul role="alert" className="flex flex-col gap-2 border-l-2 border-accent pl-4">
                    {state.message.map((line) => (
                        <li key={line} className="text-sm text-accent">
                            {line}
                        </li>
                    ))}
                </ul>
            )}

            <Button type="submit" full size="large" disabled={pending}>
                {pending ? t("submitting") : t("submit")}
            </Button>
        </form>
    );
}
