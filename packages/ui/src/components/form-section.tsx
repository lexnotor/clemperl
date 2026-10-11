import type { JSX, ReactNode } from "react";

interface FormSectionProps {
    title: string;
    // Identifiant de l'élément qui dit la règle du groupe. Il devient la DESCRIPTION
    // accessible du `fieldset`, qu'un lecteur d'écran peut annoncer après le nom, à
    // l'entrée dans le groupe : les couples lecteur-navigateur ne la restituent pas tous,
    // donc la phrase reste visible à l'écran et ne vit jamais de cette seule annonce.
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
