import { useTranslations } from "next-intl";
import type { JSX } from "react";

interface DossierAccepteProps {
    nomBoutique: string;
}

export function DossierAccepte({ nomBoutique }: DossierAccepteProps): JSX.Element {
    const t = useTranslations("vendeur.dossier.accepte");

    return (
        <main className="mx-auto max-w-2xl px-4 py-16">
            <h1 className="text-2xl font-semibold">{t("titre", { boutique: nomBoutique })}</h1>
            <p className="mt-4 text-sm opacity-80">{t("suite")}</p>
        </main>
    );
}
