"use client";

// `@clemperl/domain/browser` et non le barillet : celui-ci réexporte les erreurs du
// domaine, qui tirent `@clemperl/core`, qui tire nodemailer, qui tire `node:net` —
// et Turbopack refuse d'assembler un paquet navigateur qui le contient.
import { buildVariantMatrix, selectionKey } from "@clemperl/domain/browser";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { Button, Field, FormSection, TextAreaField } from "@clemperl/ui";
import { useActionState, useState, type JSX } from "react";
import { INITIAL_PRODUCT_STATE } from "../types/product-form-state.interface";
import { saveProductAction } from "./actions";

interface OptionRow {
    name: string;
    values: string[];
}

interface ProductFormProps {
    productId: string;
    title: string;
    description: string;
    /** Nombre de décimales de la devise de la boutique, pour l'affichage des prix. */
    exponent: number;
    options: OptionRow[];
    variants: { selections: Record<string, string>; priceAmount: number }[];
}

// Un champ de saisie ne doit porter que le NOMBRE : `formatPrice` rendrait « 12,50 € »,
// et le renvoi du formulaire échouerait sur son propre affichage. La conversion est
// écrite ici plutôt qu'importée, parce qu'elle vit dans `price.utils`, qui tire
// `@clemperl/core` — donc nodemailer, donc `node:net`.
function priceForInput(amount: number, exponent: number): string {
    const text = (amount / 10 ** exponent).toFixed(exponent);
    return exponent === 0 ? text : text.replace(".", ",");
}

export function ProductForm(product: ProductFormProps): JSX.Element {
    const t = messages.products;
    const [state, action, pending] = useActionState(saveProductAction, INITIAL_PRODUCT_STATE);
    const [options, setOptions] = useState<OptionRow[]>(product.options);

    // La MÊME fonction pure que le serveur : la grille affichée est celle qui sera
    // écrite, sans qu'aucune règle ne soit recopiée côté client.
    const grid = buildVariantMatrix(
        options,
        product.variants,
        product.variants[0]?.priceAmount ?? 0,
    );

    function updateOption(index: number, patch: Partial<OptionRow>): void {
        setOptions((current) =>
            current.map((row, position) => (position === index ? { ...row, ...patch } : row)),
        );
    }

    return (
        <form action={action} className="mt-12 flex flex-col gap-12">
            <input type="hidden" name="productId" value={product.productId} />

            <FormSection title={t.detailsSection}>
                <Field
                    label={t.productTitle}
                    name="title"
                    required
                    minLength={2}
                    maxLength={120}
                    defaultValue={product.title}
                />
                <TextAreaField
                    label={t.description}
                    name="description"
                    required
                    minLength={20}
                    maxLength={4000}
                    rows={4}
                    defaultValue={product.description}
                />
            </FormSection>

            <FormSection title={t.optionsSection}>
                <p className="text-sm text-muet">{t.optionsHint}</p>
                {options.map((option, index) => (
                    <div
                        key={index}
                        className="flex flex-col gap-2 border-t border-bordure pt-4"
                    >
                        <Field
                            label={t.optionName}
                            name="optionName"
                            value={option.name}
                            onChange={(event) => updateOption(index, { name: event.target.value })}
                        />
                        <Field
                            label={t.optionValues}
                            name="optionValues"
                            value={option.values.join(", ")}
                            onChange={(event) =>
                                updateOption(index, {
                                    values: event.target.value
                                        .split(",")
                                        .map((value) => value.trim())
                                        .filter((value) => value.length > 0),
                                })
                            }
                        />
                        <button
                            type="button"
                            className="self-start text-xs underline"
                            onClick={() =>
                                setOptions((current) =>
                                    current.filter((_, position) => position !== index),
                                )
                            }
                        >
                            {t.removeOption}
                        </button>
                    </div>
                ))}
                {options.length < 3 && (
                    <button
                        type="button"
                        className="self-start text-sm underline"
                        onClick={() =>
                            setOptions((current) => [...current, { name: "", values: [] }])
                        }
                    >
                        {t.addOption}
                    </button>
                )}
            </FormSection>

            {/* Sans axe, la grille tient en UNE ligne dont le libellé est « Prix » : le
                mot « déclinaison » n'apparaît nulle part, et le joaillier qui vend des
                pièces uniques n'a pas à comprendre la notion. */}
            <FormSection title={t.priceGrid}>
                {grid.map((variant) => {
                    const label = Object.values(variant.selections).join(" / ");
                    return (
                        <Field
                            key={selectionKey(variant.selections)}
                            label={label.length > 0 ? label : t.price}
                            // La POSITION, et non la clé de combinaison : celle-ci porte
                            // des caractères de contrôle comme séparateurs, et un nom de
                            // champ multipart n'en accepte aucun — la requête entière
                            // devient illisible, avec « Malformed part header » pour tout
                            // diagnostic. Le serveur recalcule la même grille avec la même
                            // fonction pure, donc les positions correspondent.
                            name={`price:${variant.position}`}
                            required
                            inputMode="decimal"
                            defaultValue={priceForInput(variant.priceAmount, product.exponent)}
                        />
                    );
                })}
            </FormSection>

            {state.message.length > 0 && (
                <p role="alert" className="text-sm text-accent">
                    {state.message.join(" ")}
                </p>
            )}
            {state.saved && <p className="text-sm text-muet">{t.savedProduct}</p>}

            <Button type="submit" disabled={pending}>
                {t.saveProduct}
            </Button>
        </form>
    );
}
