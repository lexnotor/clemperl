"use client";

import { Button, Field, FormSection, TextAreaField } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { submitCheckout, type ICheckoutState } from "./actions";

interface CheckoutFormProps {
    /** Le total AFFICHÉ, qui part en champ caché : le dépôt refuse s'il a bougé. */
    expectedTotal: number;
    total: string;
    shops: { slug: string; name: string }[];
    labels: Record<string, string>;
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

            {/* Un mot PAR BOUTIQUE : chaque groupe devient une commande distincte, et un
                mot unique arriverait chez des vendeurs qui n'ont rien à voir entre eux. */}
            {props.shops.map((shop) => (
                <TextAreaField
                    key={shop.slug}
                    label={(props.labels["noteToShop"] ?? "").replace("{shop}", shop.name)}
                    name={`note:${shop.slug}`}
                    maxLength={1000}
                    rows={2}
                    hint={props.labels["noteHint"] ?? ""}
                    defaultValue={kept(`note:${shop.slug}`)}
                />
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
