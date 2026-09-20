import type { JSX, ReactNode } from "react";

interface FormSectionProps {
    title: string;
    children: ReactNode;
}

// Le filet porte la structure, et le titre est une sérif de texte courant plutôt qu'un
// libellé en capitales espacées : un dossier se lit, il ne se crie pas.
export function FormSection({ title, children }: FormSectionProps): JSX.Element {
    return (
        <fieldset className="border-t border-bordure pt-8">
            <legend className="sr-only">{title}</legend>
            <h2 className="font-titre text-xl">{title}</h2>
            <div className="mt-6 flex flex-col gap-6">{children}</div>
        </fieldset>
    );
}
