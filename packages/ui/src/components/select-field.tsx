import type { JSX, SelectHTMLAttributes } from "react";
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

export function SelectField({
    label,
    hint,
    options,
    placeholder,
    className,
    ...props
}: SelectFieldProps): JSX.Element {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-sm text-muet">{label}</span>
            <select className={cn(CONTROL, className)} {...props}>
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
            {hint !== undefined && <span className="text-xs text-muet">{hint}</span>}
        </label>
    );
}
