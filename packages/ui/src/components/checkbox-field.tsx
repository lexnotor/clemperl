import type { InputHTMLAttributes, JSX } from "react";
import { cn } from "../utils";

export interface CheckboxFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string;
}

// Le contrôle natif est conservé, pas remplacé par un carré dessiné : il porte déjà son
// rôle, son état coché et la navigation au clavier, et les réimplémenter est la façon la
// plus courante de perdre les trois. Seule sa teinte suit le thème.
export function CheckboxField({ label, className, ...props }: CheckboxFieldProps): JSX.Element {
    return (
        <label className="inline-flex items-center gap-2 text-sm">
            <input
                type="checkbox"
                className={cn("size-4 accent-texte", className)}
                {...props}
            />
            <span>{label}</span>
        </label>
    );
}
