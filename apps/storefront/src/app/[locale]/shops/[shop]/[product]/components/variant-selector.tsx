"use client";

import { variantCombinationKey } from "@clemperl/domain/browser";
import { useState, type JSX } from "react";
import { AddToCart } from "./add-to-cart";

interface VariantSelectorProps {
    options: { name: string; values: { id: string; label: string }[] }[];
    /**
     * Clé de combinaison vers ce que le serveur a préparé pour ELLE : son prix déjà
     * formaté et son identifiant. Une seule offre pour toute la fiche annoncerait le prix
     * de la déclinaison la moins chère quelle que soit la sélection, et le bouton
     * ajouterait au panier un article que l'acheteur n'a pas choisi.
     */
    offers: Record<string, { price: string; variantId: string }>;
    currency: string;
    signedIn: boolean;
    cartLabels: { add: string; added: string; currencyRefused: string; failed: string };
    emptyLabel: string;
}

// Le seul composant interactif de la fiche, et il ne formate AUCUN prix : il reçoit des
// chaînes déjà prêtes. `formatPrice` tire `@clemperl/core`, donc nodemailer, donc
// `node:net`, et Turbopack refuse d'assembler un paquet navigateur qui le contient.
// L'erreur, si quelqu'un l'importe ici, ne nomme aucun de ces maillons.
export function VariantSelector(props: VariantSelectorProps): JSX.Element {
    // La sélection range des IDENTIFIANTS de valeur, pas des libellés : c'est ce que la clé
    // de combinaison attend, et c'est ce que la base range.
    const [selection, setSelection] = useState<Record<string, string>>({});

    const complete = props.options.every((option) => (selection[option.name] ?? "") !== "");
    const key = variantCombinationKey(Object.values(selection).filter((id) => id !== ""));
    const offer = props.offers[key];
    const ready = complete && offer !== undefined;

    return (
        <div className="mt-8 flex flex-col gap-6">
            {props.options.map((option) => (
                <label key={option.name} className="flex flex-col gap-1 text-sm">
                    {option.name}
                    <select
                        className="border border-bordure bg-transparent px-3 py-2 text-sm"
                        value={selection[option.name] ?? ""}
                        onChange={(event) =>
                            setSelection((current) => ({
                                ...current,
                                [option.name]: event.target.value,
                            }))
                        }
                    >
                        <option value="">{props.emptyLabel}</option>
                        {option.values.map((value) => (
                            <option key={value.id} value={value.id}>
                                {value.label}
                            </option>
                        ))}
                    </select>
                </label>
            ))}

            <p data-testid="prix" className="text-2xl">
                {ready ? offer.price : props.emptyLabel}
            </p>

            {ready && (
                <AddToCart
                    variantId={offer.variantId}
                    currency={props.currency}
                    signedIn={props.signedIn}
                    labels={props.cartLabels}
                />
            )}
        </div>
    );
}
