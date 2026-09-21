"use client";

import { useId, type JSX, type SelectHTMLAttributes } from "react";
import { cn } from "../utils";

// Le même filet sous le contrôle que `Field`, pour que l'œil descende d'un champ au
// suivant sans traverser deux styles différents. La chaîne est recopiée plutôt
// qu'importée : `field.tsx` la garde privée, et l'exporter pour une seule réutilisation
// figerait une décision de style en interface publique.
const CONTROL =
    "w-full border-0 border-b border-bordure bg-transparent px-0 py-2 text-base " +
    "outline-none transition-colors focus:border-texte focus:outline-none " +
    "disabled:cursor-not-allowed disabled:text-muet";

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label: string;
    hint?: string;
    options: readonly { value: string; label: string }[];
    /** Libellé de l'entrée vide, affichée tant que rien n'est choisi. */
    placeholder?: string;
}

function describedIds(...ids: (string | undefined)[]): string | undefined {
    const kept = ids.filter((id): id is string => id !== undefined && id.length > 0);
    return kept.length > 0 ? kept.join(" ") : undefined;
}

// Libellé, contrôle et indication sont FRÈRES, comme dans `Field`. Envelopper le
// `<select>` dans son `<label>` ferait entrer l'indication dans le nom accessible du
// contrôle — « Devise des prix Elle se fige dès que… » — et un sélecteur par nom exact
// ne trouverait plus rien.
export function SelectField({
    label,
    hint,
    options,
    placeholder,
    className,
    id,
    "aria-describedby": describedBy,
    ...props
}: SelectFieldProps): JSX.Element {
    const generated = useId();
    const controlId = id ?? generated;
    const hintId = `${controlId}-hint`;

    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={controlId} className="text-sm text-muet">
                {label}
            </label>
            <select
                id={controlId}
                className={cn(CONTROL, className)}
                {...props}
                // APRÈS le spread, et fusionné : étalé avant, un `aria-describedby`
                // fourni par l'appelant écraserait l'indication.
                aria-describedby={describedIds(describedBy, hint === undefined ? undefined : hintId)}
            >
                {placeholder !== undefined && (
                    <option value="" disabled>
                        {placeholder}
                    </option>
                )}
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            {hint !== undefined && (
                <span id={hintId} className="text-xs text-muet">
                    {hint}
                </span>
            )}
        </div>
    );
}
