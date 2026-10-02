"use client";

import { variantCombinationKey } from "@clemperl/domain/browser";
import { useState, type JSX } from "react";

interface VariantSelectorProps {
    options: { name: string; values: { id: string; label: string }[] }[];
    /** Clé de combinaison vers prix DÉJÀ FORMATÉ par le serveur. */
    prices: Record<string, string>;
    contact: { href: string; label: string };
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

    const complet = props.options.every((option) => (selection[option.name] ?? "") !== "");
    const cle = variantCombinationKey(Object.values(selection).filter((id) => id !== ""));
    const prix = props.prices[cle];
    const pret = complet && prix !== undefined;

    return (
        <div className="mt-8 flex flex-col gap-6">
            {props.options.map((option) => (
                <label key={option.name} className="flex flex-col gap-1 text-sm">
                    {option.name}
                    <select
                        className="border border-bordure bg-transparent px-3 py-2 text-sm"
                        value={selection[option.name] ?? ""}
                        onChange={(event) =>
                            setSelection((courant) => ({
                                ...courant,
                                [option.name]: event.target.value,
                            }))
                        }
                    >
                        <option value="">{props.emptyLabel}</option>
                        {option.values.map((valeur) => (
                            <option key={valeur.id} value={valeur.id}>
                                {valeur.label}
                            </option>
                        ))}
                    </select>
                </label>
            ))}

            <p data-testid="prix" className="text-2xl">
                {pret ? prix : props.emptyLabel}
            </p>

            {pret && (
                <a
                    href={props.contact.href}
                    className="self-start border border-bordure px-6 py-3 text-sm"
                >
                    {props.contact.label}
                </a>
            )}
        </div>
    );
}
