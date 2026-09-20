"use client";

import { Button, Field, FileField, FormSection, TextAreaField } from "@clemperl/ui";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, type JSX } from "react";
import { resubmitApplicationAction, submitApplication } from "../actions";
import type { IApplicationValues } from "../types/application-values.interface";
import { INITIAL_STATE } from "../types/form-state.interface";

const CATEGORIES = ["APPAREL", "JEWELLERY", "LEATHER_GOODS"] as const;
const DOCUMENTS = [
    { kind: "REGISTRY", required: true },
    { kind: "IDENTITY", required: true },
    { kind: "TAX", required: false },
] as const;

interface ApplicationFormProps {
    // Une resoumission repart du dossier refusé : redemander la saisie complète pour une
    // pièce illisible ferait abandonner des candidats légitimes.
    initialValues?: IApplicationValues;
}

export function ApplicationForm({ initialValues }: ApplicationFormProps): JSX.Element {
    const t = useTranslations("vendor.application");
    const tKind = useTranslations("vendor.documentKind");
    const locale = useLocale();
    const [state, action, pending] = useActionState(
        initialValues ? resubmitApplicationAction : submitApplication,
        INITIAL_STATE,
    );

    return (
        <form action={action} className="mt-12 flex flex-col gap-12">
            <input type="hidden" name="locale" value={locale} />
            {initialValues && (
                <input type="hidden" name="applicationId" value={initialValues.applicationId} />
            )}

            <FormSection title={t("shopSection")}>
                <Field
                    label={t("shopName")}
                    name="shopName"
                    required
                    minLength={2}
                    maxLength={80}
                    defaultValue={initialValues?.shopName}
                />
                <TextAreaField
                    label={t("description")}
                    name="shopDescription"
                    required
                    minLength={20}
                    maxLength={2000}
                    rows={4}
                    hint={t("descriptionHint")}
                    defaultValue={initialValues?.shopDescription}
                />
                <Field
                    label={t("contactEmail")}
                    name="contactEmail"
                    type="email"
                    required
                    defaultValue={initialValues?.contactEmail}
                />
                <Field
                    label={t("contactPhone")}
                    name="contactPhone"
                    required
                    defaultValue={initialValues?.contactPhone}
                />

                <div className="flex flex-col gap-3">
                    <span className="text-sm text-muet">{t("categories")}</span>
                    {CATEGORIES.map((category) => (
                        <label key={category} className="flex items-center gap-3 text-base">
                            <input
                                type="checkbox"
                                name="categories"
                                value={category}
                                defaultChecked={initialValues?.categories.includes(category)}
                                className="size-4 accent-texte"
                            />
                            {t(`category.${category}`)}
                        </label>
                    ))}
                </div>
            </FormSection>

            <FormSection title={t("legalSection")}>
                <Field
                    label={t("legalForm")}
                    name="legalForm"
                    required
                    defaultValue={initialValues?.legalForm}
                />
                <Field
                    label={t("legalName")}
                    name="legalName"
                    required
                    defaultValue={initialValues?.legalName}
                />
                <Field
                    label={t("registrationNumber")}
                    name="registrationNumber"
                    required
                    defaultValue={initialValues?.registrationNumber}
                />
                <Field
                    label={t("taxNumber")}
                    name="taxNumber"
                    defaultValue={initialValues?.taxNumber ?? undefined}
                />
                <Field
                    label={t("country")}
                    name="country"
                    required
                    maxLength={2}
                    defaultValue={initialValues?.country}
                />
            </FormSection>

            <FormSection title={t("documentsSection")}>
                {initialValues && (
                    <p className="text-sm text-muet">{t("documentsUnchanged")}</p>
                )}
                {DOCUMENTS.map(({ kind, required }) => (
                    <FileField
                        key={kind}
                        name={kind}
                        label={required ? tKind(kind) : `${tKind(kind)} — ${t("optional")}`}
                        chooseLabel={t("chooseFile")}
                        emptyLabel={t("noFileChosen")}
                        required={required && initialValues === undefined}
                        accept="application/pdf,image/jpeg,image/png"
                    />
                ))}
            </FormSection>

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
                {pending ? t("submitting") : t(initialValues ? "resubmit" : "submit")}
            </Button>
        </form>
    );
}
