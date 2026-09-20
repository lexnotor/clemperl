"use client";

import { useId, useState, type ChangeEvent, type InputHTMLAttributes, type JSX } from "react";
import { cn } from "../utils";

export interface FileFieldProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
    label: string;
    /** Libellé du déclencheur, et texte affiché tant qu'aucun fichier n'est choisi. */
    chooseLabel: string;
    emptyLabel: string;
}

// Le contrôle natif s'affiche dans la langue du NAVIGATEUR, pas dans celle de la page :
// « Choose File » apparaît sur une page française sans qu'aucune traduction n'y puisse
// rien. Il est donc masqué visuellement — jamais retiré du flux ni du clavier — et
// remplacé par un déclencheur que nous libellons.
//
// Le déclencheur est un SECOND `label`, marqué `aria-hidden` : il ouvre le sélecteur au
// clic, et son texte n'entre pas dans le nom accessible du champ, qui resterait sinon
// « Registre de commerce Choisir un fichier Aucun fichier choisi ».
export function FileField({
    label,
    chooseLabel,
    emptyLabel,
    className,
    onChange,
    ...props
}: FileFieldProps): JSX.Element {
    const inputId = useId();
    const [fileName, setFileName] = useState<string | null>(null);

    function handleChange(event: ChangeEvent<HTMLInputElement>): void {
        setFileName(event.target.files?.[0]?.name ?? null);
        onChange?.(event);
    }

    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-sm text-muet">
                {label}
            </label>
            <input
                id={inputId}
                type="file"
                className={cn("peer sr-only", className)}
                onChange={handleChange}
                {...props}
            />
            <label
                htmlFor={inputId}
                aria-hidden="true"
                className="flex cursor-pointer items-center gap-4 border-b border-bordure py-3 peer-focus-visible:border-texte"
            >
                <span className="rounded-[--radius-controle] border border-bordure px-4 py-2 text-sm">
                    {chooseLabel}
                </span>
                <span className={cn("text-sm", fileName === null ? "text-muet" : "text-texte")}>
                    {fileName ?? emptyLabel}
                </span>
            </label>
        </div>
    );
}
