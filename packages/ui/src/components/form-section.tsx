import type { JSX, ReactNode } from "react";

interface FormSectionProps {
    title: string;
    // Identifiant de l'élément qui dit la règle du groupe : un lecteur d'écran l'annonce
    // après le titre, à l'entrée dans le `fieldset`, avant la première case.
    describedBy?: string;
    children: ReactNode;
}

// Le filet porte la structure, et le titre est une sérif de texte courant plutôt qu'un
// libellé en capitales espacées : un dossier se lit, il ne se crie pas.
export function FormSection({ title, describedBy, children }: FormSectionProps): JSX.Element {
    return (
        <fieldset aria-describedby={describedBy} className="border-t border-bordure pt-8">
            <legend className="sr-only">{title}</legend>
            <h2 className="font-titre text-xl">{title}</h2>
            <div className="mt-6 flex flex-col gap-6">{children}</div>
        </fieldset>
    );
}
