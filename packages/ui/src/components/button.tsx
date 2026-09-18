import { type VariantProps, cva } from "class-variance-authority";
import type { ButtonHTMLAttributes, JSX } from "react";
import { cn } from "../utils";

const boutonVariants = cva(
    "inline-flex items-center justify-center font-medium transition-colors " +
        "disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variante: {
                plein: "bg-accent text-fond hover:opacity-90",
                contour: "border border-bordure bg-transparent hover:bg-bordure/20",
            },
            taille: {
                normale: "h-10 px-4 text-sm rounded-[--radius-controle]",
                large: "h-12 px-6 text-base rounded-[--radius-controle]",
            },
        },
        defaultVariants: { variante: "plein", taille: "normale" },
    },
);

// Les props de composant ne portent pas le préfixe I : c'est la forme attendue par
// l'écosystème React et par les composants shadcn installés tels quels.
export interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof boutonVariants> {}

export function Button({
    className,
    variante,
    taille,
    ...props
}: ButtonProps): JSX.Element {
    return (
        <button
            className={cn(boutonVariants({ variante, taille }), className)}
            {...props}
        />
    );
}
