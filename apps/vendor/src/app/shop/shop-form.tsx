"use client";

import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { E_CURRENCY } from "@clemperl/db/enums";
import { Button, CheckboxField, Field, FormSection, SelectField, TextAreaField } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { saveShopCurrency, saveShopProfile } from "./actions";
import { INITIAL_STATE } from "./types/shop-form-state.interface";

const CATEGORIES = ["APPAREL", "JEWELLERY", "LEATHER_GOODS"] as const;

interface ShopFormProps {
    shopName: string;
    shopDescription: string;
    contactEmail: string;
    contactPhone: string;
    categories: readonly string[];
    currency: string | null;
    currencyLocked: boolean;
}

export function ShopForm(shop: ShopFormProps): JSX.Element {
    const t = messages.shop;
    const labels = messages.category as Record<string, string>;
    const currencyLabels = messages.currency as Record<string, string>;
    const [state, action, pending] = useActionState(saveShopProfile, INITIAL_STATE);
    const [currencyState, currencyAction, currencyPending] = useActionState(
        saveShopCurrency,
        INITIAL_STATE,
    );

    return (
        <>
        <form action={action} className="mt-12 flex flex-col gap-12">
            <FormSection title={t.commercialSection}>
                <Field
                    label={t.shopName}
                    name="shopName"
                    required
                    minLength={2}
                    maxLength={80}
                    defaultValue={shop.shopName}
                />
                <TextAreaField
                    label={t.description}
                    name="shopDescription"
                    required
                    minLength={20}
                    maxLength={2000}
                    rows={4}
                    hint={t.descriptionHint}
                    defaultValue={shop.shopDescription}
                />
                <Field
                    label={t.contactEmail}
                    name="contactEmail"
                    type="email"
                    required
                    defaultValue={shop.contactEmail}
                />
                <Field
                    label={t.contactPhone}
                    name="contactPhone"
                    required
                    defaultValue={shop.contactPhone}
                />
                <fieldset className="flex flex-col gap-2">
                    <legend className="text-sm text-muet">{t.categories}</legend>
                    <div className="flex flex-wrap gap-4">
                        {CATEGORIES.map((category) => (
                            <CheckboxField
                                key={category}
                                label={labels[category] as string}
                                name="categories"
                                value={category}
                                defaultChecked={shop.categories.includes(category)}
                            />
                        ))}
                    </div>
                </fieldset>
            </FormSection>

            {state.message.length > 0 && (
                <p role="alert" className="text-sm text-accent">
                    {state.message.join(" ")}
                </p>
            )}
            {state.saved && <p className="text-sm text-muet">{t.saved}</p>}

            <Button type="submit" disabled={pending}>
                {t.save}
            </Button>
        </form>

        {/* Une form SÉPARÉE : la devise a sa propre action serveur, et imbriquer deux
            formulaires produit un HTML que le navigateur répare comme il peut. */}
        <form action={currencyAction} className="mt-12 flex flex-col gap-6">
            <FormSection title={t.currencySection}>
                <SelectField
                    label={t.currency}
                    name="currency"
                    required
                    defaultValue={shop.currency ?? ""}
                    disabled={shop.currencyLocked}
                    placeholder={t.currencyPlaceholder}
                    hint={shop.currencyLocked ? t.currencyLocked : t.currencyHint}
                    options={Object.values(E_CURRENCY).map((code) => ({
                        value: code,
                        label: currencyLabels[code] as string,
                    }))}
                />
            </FormSection>

            {currencyState.message.length > 0 && (
                <p role="alert" className="text-sm text-accent">
                    {currencyState.message.join(" ")}
                </p>
            )}
            {currencyState.saved && <p className="text-sm text-muet">{t.currencySaved}</p>}

            <Button type="submit" disabled={currencyPending || shop.currencyLocked}>
                {t.saveCurrency}
            </Button>
        </form>
        </>
    );
}
