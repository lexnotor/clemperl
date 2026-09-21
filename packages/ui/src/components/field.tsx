"use client";

import {
    useId,
    type InputHTMLAttributes,
    type JSX,
    type TextareaHTMLAttributes,
} from "react";
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

// `aria-describedby` accepte PLUSIEURS identifiants, séparés par des espaces. Les
// concaténer laisse coexister l'indication du composant et ce que l'appelant ajoute.
function describedIds(...ids: (string | undefined)[]): string | undefined {
    const kept = ids.filter((id): id is string => id !== undefined && id.length > 0);
    return kept.length > 0 ? kept.join(" ") : undefined;
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement>, LabelledProps {}

// Le libellé est associé par `htmlFor`, et le contrôle n'est PAS enveloppé dedans.
//
// Envelopper coûte deux fois. Le nom accessible d'un contrôle enveloppé se calcule sur
// le `textContent` du `<label>` entier : l'indication en fait partie, et pour un
// `<textarea>` la valeur aussi, puisque React rend `defaultValue` comme CONTENU de
// l'élément. Un champ « Description » dont la valeur parle de joaillerie finit donc
// nommé « DescriptionJoaillerie… », et tout sélecteur par libellé attrape le mauvais
// élément — ou deux.
//
// L'indication devient une `aria-describedby` : elle reste lue, après le nom, sans
// entrer dedans.
export function Field({
    label,
    hint,
    className,
    id,
    "aria-describedby": describedBy,
    ...props
}: FieldProps): JSX.Element {
    const generated = useId();
    const controlId = id ?? generated;
    const hintId = `${controlId}-hint`;

    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={controlId} className="text-sm text-muet">
                {label}
            </label>
            <input
                id={controlId}
                className={cn(CONTROL, className)}
                {...props}
                // APRÈS le spread, et fusionné : étalé avant, un `aria-describedby`
                // fourni par l'appelant — un message d'erreur, typiquement — écraserait
                // l'indication, qui resterait visible sans être annoncée.
                aria-describedby={describedIds(describedBy, hint === undefined ? undefined : hintId)}
            />
            {hint !== undefined && (
                <span id={hintId} className="text-xs text-muet">
                    {hint}
                </span>
            )}
        </div>
    );
}

export interface TextAreaFieldProps
    extends TextareaHTMLAttributes<HTMLTextAreaElement>,
        LabelledProps {}

export function TextAreaField({
    label,
    hint,
    className,
    id,
    "aria-describedby": describedBy,
    ...props
}: TextAreaFieldProps): JSX.Element {
    const generated = useId();
    const controlId = id ?? generated;
    const hintId = `${controlId}-hint`;

    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={controlId} className="text-sm text-muet">
                {label}
            </label>
            <textarea
                id={controlId}
                className={cn(CONTROL, "resize-y", className)}
                {...props}
                aria-describedby={describedIds(describedBy, hint === undefined ? undefined : hintId)}
            />
            {hint !== undefined && (
                <span id={hintId} className="text-xs text-muet">
                    {hint}
                </span>
            )}
        </div>
    );
}
