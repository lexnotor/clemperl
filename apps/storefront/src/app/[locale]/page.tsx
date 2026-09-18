import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import type { JSX } from "react";

export default function AccueilPage(): JSX.Element {
    const t = useTranslations("accueil");

    return (
        <main className="mx-auto max-w-3xl px-4 py-16">
            <h1 className="text-3xl font-semibold">{t("titre")}</h1>
            <p className="mt-2 text-sm opacity-80">{t("sousTitre")}</p>
            <Button className="mt-8">{t("titre")}</Button>
        </main>
    );
}
