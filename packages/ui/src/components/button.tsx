import { type VariantProps, cva } from "class-variance-authority";
import type { ButtonHTMLAttributes, JSX } from "react";
import { cn } from "../utils";

// Le plein est NOIR et non accentué : l'accent est réservé à ce qui ne va pas, et un
// bouton principal rouge sur chaque écran lui retirerait tout pouvoir de signalement.
const buttonVariants = cva(
    "inline-flex items-center justify-center font-medium tracking-tight transition-colors " +
        "disabled:pointer-events-none disabled:opacity-40",
    {
        variants: {
            variant: {
                solid: "bg-texte text-fond hover:opacity-85",
                outline: "border border-bordure bg-transparent hover:border-texte",
                quiet: "text-muet underline underline-offset-4 hover:text-texte",
            },
            size: {
                normal: "h-11 px-5 text-sm rounded-[--radius-controle]",
                large: "h-12 px-6 text-base rounded-[--radius-controle]",
                bare: "h-auto p-0 text-sm",
            },
            full: { true: "w-full", false: "" },
        },
        defaultVariants: { variant: "solid", size: "normal", full: false },
    },
);

// Les props de composant ne portent pas le préfixe I : c'est la forme attendue par
// l'écosystème React et par les composants shadcn installés tels quels.
export interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {}

export function Button({
    className,
    variant,
    size,
    full,
    ...props
}: ButtonProps): JSX.Element {
    return (
        <button className={cn(buttonVariants({ variant, size, full }), className)} {...props} />
    );
}
