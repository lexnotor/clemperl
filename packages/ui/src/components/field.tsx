import type { InputHTMLAttributes, JSX, TextareaHTMLAttributes } from "react";
import { cn } from "../utils";

// Un filet sous le champ, jamais de boîte. C'est ce qui distingue un dossier d'un
// formulaire : la ligne organise sans enfermer, et l'œil descend d'un champ au suivant
// sans traverser quatre bordures.
const CONTROL =
    "w-full border-0 border-b border-bordure bg-transparent px-0 py-2 text-base " +
    "outline-none transition-colors placeholder:text-muet " +
    "focus:border-texte focus:outline-none " +
    "aria-[invalid=true]:border-accent";

interface LabelledProps {
    label: string;
    hint?: string;
}

export interface FieldProps
    extends InputHTMLAttributes<HTMLInputElement>,
        LabelledProps {}

export function Field({ label, hint, className, ...props }: FieldProps): JSX.Element {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-sm text-muet">{label}</span>
            <input className={cn(CONTROL, className)} {...props} />
            {hint !== undefined && <span className="text-xs text-muet">{hint}</span>}
        </label>
    );
}

export interface TextAreaFieldProps
    extends TextareaHTMLAttributes<HTMLTextAreaElement>,
        LabelledProps {}

export function TextAreaField({
    label,
    hint,
    className,
    ...props
}: TextAreaFieldProps): JSX.Element {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-sm text-muet">{label}</span>
            <textarea className={cn(CONTROL, "resize-y", className)} {...props} />
            {hint !== undefined && <span className="text-xs text-muet">{hint}</span>}
        </label>
    );
}
