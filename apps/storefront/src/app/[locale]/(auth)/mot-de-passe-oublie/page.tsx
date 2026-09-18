"use client";

import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type JSX } from "react";
import { authClient } from "../../../../lib/auth-client";

export default function MotDePasseOubliePage(): JSX.Element {
    const t = useTranslations("authentification.motDePasseOublie");
    const [envoye, setEnvoye] = useState(false);

    async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
        evenement.preventDefault();
        const donnees = new FormData(evenement.currentTarget);

        // La route exposée est `request-password-reset` ; `forgetPassword` renvoie
        // 404 sur cette version — vérifié en interrogeant le gestionnaire.
        await authClient.requestPasswordReset({
            email: String(donnees.get("email")),
            redirectTo: "/nouveau-mot-de-passe",
        });

        // On affiche la même confirmation que l'adresse existe ou non : indiquer le
        // contraire révélerait quels comptes existent à qui saisit des adresses au
        // hasard.
        setEnvoye(true);
    }

    if (envoye) {
        return (
            <main className="mx-auto max-w-md px-4 py-16">
                <p>{t("confirmation")}</p>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-md px-4 py-16">
            <h1 className="text-2xl font-semibold">{t("titre")}</h1>
            <form
                method="post"
                onSubmit={soumettre}
                className="mt-8 flex flex-col gap-4"
            >
                <input name="email" type="email" required className="border border-bordure p-2" />
                <Button type="submit">{t("valider")}</Button>
            </form>
        </main>
    );
}
