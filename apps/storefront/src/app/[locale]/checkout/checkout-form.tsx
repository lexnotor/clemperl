"use client";

import { Button, Field, FormSection, TextAreaField } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { submitCheckout, type ICheckoutState } from "./actions";

interface CheckoutFormProps {
    /** Le total AFFICHÉ, qui part en champ caché : le dépôt refuse s'il a bougé. */
    expectedTotal: number;
    total: string;
    /** `methods` : ce que CETTE boutique accepte, lu avec les prix. */
    shops: { slug: string; name: string; methods: string[] }[];
    labels: Record<string, string>;
    /** Le libellé traduit de chaque méthode proposée, par sa valeur d'énumération. */
    methodLabels: Record<string, string>;
    /** Une phrase par code d'erreur rendu par l'action. */
    errors: Record<string, string>;
}

const INITIAL: ICheckoutState = {};

export function CheckoutForm(props: CheckoutFormProps): JSX.Element {
    const [state, action, pending] = useActionState(submitCheckout, INITIAL);

    // React 19 vide les champs non contrôlés d'un formulaire dès qu'une action rend la
    // main sans lever, et tous les refus de `submitCheckout` en rendent une. L'action
    // renvoie donc ce qui avait été saisi, et chaque champ le reprend : sans cela
    // l'adresse entière est à retaper après le moindre message d'erreur.
    const kept = (field: string): string => state.values?.[field] ?? "";

    return (
        <form action={action} className="mt-12 flex flex-col gap-12">
            {/* Le total affiché voyage avec la commande. Le dépôt le compare à ce qu'il
                recalcule sous verrou : un panier qui a grossi dans un autre onglet est
                refusé plutôt que facturé au mauvais prix. */}
            <input type="hidden" name="expectedTotal" value={props.expectedTotal} />

            <FormSection title={props.labels["shipTo"] ?? ""}>
                <Field
                    label={props.labels["shipToName"] ?? ""}
                    name="name"
                    required
                    minLength={2}
                    defaultValue={kept("name")}
                />
                <Field
                    label={props.labels["shipToPhone"] ?? ""}
                    name="phone"
                    required
                    minLength={6}
                    defaultValue={kept("phone")}
                />
                <Field
                    label={props.labels["shipToLine"] ?? ""}
                    name="line"
                    required
                    minLength={4}
                    defaultValue={kept("line")}
                />
                <Field
                    label={props.labels["shipToCity"] ?? ""}
                    name="city"
                    required
                    minLength={2}
                    defaultValue={kept("city")}
                />
                <Field
                    label={props.labels["shipToCountry"] ?? ""}
                    name="country"
                    required
                    minLength={2}
                    maxLength={2}
                    defaultValue={kept("country")}
                />
            </FormSection>

            {/* Un mot et une méthode PAR BOUTIQUE : chaque groupe devient une commande
                distincte, un mot unique arriverait chez des vendeurs qui n'ont rien à voir
                entre eux, et une méthode unique rendrait le panier invalidable dès que deux
                boutiques n'en ont aucune en commun. */}
            {props.shops.map((shop) => (
                <div key={shop.slug} className="flex flex-col gap-6">
                    <TextAreaField
                        label={(props.labels["noteToShop"] ?? "").replace("{shop}", shop.name)}
                        name={`note:${shop.slug}`}
                        maxLength={1000}
                        rows={2}
                        hint={props.labels["noteHint"] ?? ""}
                        defaultValue={kept(`note:${shop.slug}`)}
                    />
                    {/* AUCUN bouton présélectionné : préchoisir pour quelqu'un comment il
                        paie se paie en litige. Seul le choix qui revient d'un refus est
                        recoché, pour qu'il ne soit pas à refaire. */}
                    <fieldset className="flex flex-col gap-3">
                        <legend className="mb-3 text-sm">
                            {(props.labels["paymentMethod"] ?? "").replace("{shop}", shop.name)}
                        </legend>
                        {shop.methods.map((method) => (
                            <label key={method} className="inline-flex items-center gap-2 text-sm">
                                <input
                                    type="radio"
                                    name={`method:${shop.slug}`}
                                    value={method}
                                    defaultChecked={kept(`method:${shop.slug}`) === method}
                                    className="size-4 accent-texte"
                                />
                                <span>{props.methodLabels[method] ?? method}</span>
                            </label>
                        ))}
                    </fieldset>
                </div>
            ))}

            {state.error !== undefined && (
                <p role="alert" className="text-sm text-accent">
                    {props.errors[state.error] ?? props.errors["invalid"]}
                </p>
            )}

            <div className="flex items-baseline justify-between border-t border-bordure pt-6">
                <span className="text-lg">{props.total}</span>
                <Button type="submit" disabled={pending}>
                    {props.labels["confirm"] ?? ""}
                </Button>
            </div>
        </form>
    );
}
