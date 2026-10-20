"use client";

import { Button, CheckboxField, FileField, FormSection, SelectField, TextAreaField } from "@clemperl/ui";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, type JSX } from "react";
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
    const [state, action, pending] = useActionState(openDisputeAction, INITIAL_DISPUTE_FORM_STATE);

    return (
        <form action={action} className="mt-10 flex flex-col gap-10">
            <input type="hidden" name="reference" value={reference} />
            <input type="hidden" name="locale" value={locale} />

            <FormSection title={t("lines")}>
                {lines.map((line) => (
                    <CheckboxField
                        key={line.id}
                        name="lineIds"
                        value={line.id}
                        label={line.label}
                        defaultChecked={state.values?.lineIds?.includes(line.id) ?? false}
                    />
                ))}
            </FormSection>

            {/* Aucun motif choisi d'office : un choix par défaut accuserait le vendeur d'un
                tort que l'acheteur n'a peut-être pas voulu nommer. */}
            {/* La `key` remonte le `select` sur le motif rendu : React ne met pas à jour la
                valeur par défaut d'un `select` après son premier rendu, et la remise à zéro du
                formulaire reviendrait au choix vide. */}
            <SelectField
                key={`reason-${state.values?.reason ?? ""}`}
                label={t("reason")}
                name="reason"
                required
                defaultValue={state.values?.reason ?? ""}
                placeholder={t("reasonPlaceholder")}
                options={reasons}
            />

            {/* Les valeurs par défaut reprennent la saisie rendue par un refus : React vide le
                formulaire dès que l'action se termine, et le récit serait perdu. */}
            <TextAreaField
                label={t("body")}
                name="body"
                required
                maxLength={5000}
                rows={6}
                defaultValue={state.values?.body}
            />

            {/* Le champ du kit, et non le contrôle natif : celui-ci s'affiche dans la langue du
                navigateur, pas dans celle de la page. */}
            <FileField
                label={t("attachments")}
                chooseLabel={t("chooseFiles")}
                emptyLabel={t("noFiles")}
                name="attachments"
                multiple
                accept="application/pdf,image/jpeg,image/png"
                onChange={(event) =>
                    checkAttachments(event.currentTarget, (violation) =>
                        tErrors(violation.i18nKey.replace("errors.dispute.", "") as never, violation.i18nArgs as never),
                    )
                }
            />

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
