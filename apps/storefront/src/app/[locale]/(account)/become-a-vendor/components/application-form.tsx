"use client";

import { Button, Field, FileField, FormSection, TextAreaField } from "@clemperl/ui";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, type JSX } from "react";
import { submitApplication } from "../actions";
import { INITIAL_STATE } from "../types/form-state.interface";

const CATEGORIES = ["APPAREL", "JEWELLERY", "LEATHER_GOODS"] as const;
const DOCUMENTS = [
    { kind: "REGISTRY", required: true },
    { kind: "IDENTITY", required: true },
    { kind: "TAX", required: false },
] as const;

export function ApplicationForm(): JSX.Element {
    const t = useTranslations("vendor.application");
    const tKind = useTranslations("vendor.documentKind");
    const locale = useLocale();
    const [state, action, pending] = useActionState(submitApplication, INITIAL_STATE);

    return (
        <form action={action} className="mt-12 flex flex-col gap-12">
            <input type="hidden" name="locale" value={locale} />

            <FormSection title={t("shopSection")}>
                <Field label={t("shopName")} name="shopName" required minLength={2} maxLength={80} />
                <TextAreaField
                    label={t("description")}
                    name="shopDescription"
                    required
                    minLength={20}
                    maxLength={2000}
                    rows={4}
                    hint={t("descriptionHint")}
                />
                <Field label={t("contactEmail")} name="contactEmail" type="email" required />
                <Field label={t("contactPhone")} name="contactPhone" required />

                <div className="flex flex-col gap-3">
                    <span className="text-sm text-muet">{t("categories")}</span>
                    {CATEGORIES.map((category) => (
                        <label key={category} className="flex items-center gap-3 text-base">
                            <input
                                type="checkbox"
                                name="categories"
                                value={category}
                                className="size-4 accent-texte"
                            />
                            {t(`category.${category}`)}
                        </label>
                    ))}
                </div>
            </FormSection>

            <FormSection title={t("legalSection")}>
                <Field label={t("legalForm")} name="legalForm" required />
                <Field label={t("legalName")} name="legalName" required />
                <Field label={t("registrationNumber")} name="registrationNumber" required />
                <Field label={t("taxNumber")} name="taxNumber" />
                <Field label={t("country")} name="country" required maxLength={2} />
            </FormSection>

            <FormSection title={t("documentsSection")}>
                {DOCUMENTS.map(({ kind, required }) => (
                    <FileField
                        key={kind}
                        name={kind}
                        label={required ? tKind(kind) : `${tKind(kind)} — ${t("optional")}`}
                        chooseLabel={t("chooseFile")}
                        emptyLabel={t("noFileChosen")}
                        required={required}
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
                {pending ? t("submitting") : t("submit")}
            </Button>
        </form>
    );
}
