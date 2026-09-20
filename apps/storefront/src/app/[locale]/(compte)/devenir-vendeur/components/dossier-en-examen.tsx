import { useFormatter, useTranslations } from "next-intl";
import type { JSX } from "react";

interface DossierEnExamenProps {
    depuis: Date;
}

export function DossierEnExamen({ depuis }: DossierEnExamenProps): JSX.Element {
    const t = useTranslations("vendeur.dossier.enExamen");
    const format = useFormatter();

    return (
        <main className="mx-auto max-w-2xl px-4 py-16">
            <h1 className="text-2xl font-semibold">{t("titre")}</h1>
            <p className="mt-4 text-sm opacity-80">
                {t("depuis", { date: format.dateTime(depuis, "long") })}
            </p>
        </main>
    );
}
