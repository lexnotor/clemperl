"use client";

import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type JSX } from "react";
import { authClient } from "../../../../lib/auth-client";

export default function NouveauMotDePassePage(): JSX.Element {
    const t = useTranslations("authentification.nouveauMotDePasse");
    const [erreur, setErreur] = useState<string | null>(null);

    async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
        evenement.preventDefault();
        setErreur(null);
        const donnees = new FormData(evenement.currentTarget);
        const jeton = new URLSearchParams(window.location.search).get("token") ?? "";

        const { error } = await authClient.resetPassword({
            newPassword: String(donnees.get("motDePasse")),
            token: jeton,
        });

        if (error) {
            setErreur(t("lienExpire"));
            return;
        }
        window.location.href = "/connexion";
    }

    return (
        <main className="mx-auto max-w-md px-4 py-16">
            <h1 className="text-2xl font-semibold">{t("titre")}</h1>
            <form
                method="post"
                onSubmit={soumettre}
                className="mt-8 flex flex-col gap-4"
            >
                <input name="motDePasse" type="password" required minLength={8} className="border border-bordure p-2" />
                {erreur !== null && <p role="alert">{erreur}</p>}
                <Button type="submit">{t("valider")}</Button>
            </form>
        </main>
    );
}
