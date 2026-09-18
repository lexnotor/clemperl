"use client";

import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type JSX } from "react";
import { authClient } from "../../../../lib/auth-client";

// Next ne remplace `process.env.NEXT_PUBLIC_*` qu'en notation POINTÉE, au moment du
// build. En notation crochets, la substitution n'a pas lieu : `process` n'existe pas
// dans le navigateur, le composant lève au rendu, et React abandonne l'hydratation.
// Le formulaire se soumet alors en GET natif, mot de passe visible dans l'URL.
const googleActif = process.env.NEXT_PUBLIC_GOOGLE_ACTIF === "1";

export default function InscriptionPage(): JSX.Element {
    const t = useTranslations("authentification.inscription");
    const tVerif = useTranslations("authentification.verification");
    const [erreur, setErreur] = useState<string | null>(null);
    const [envoye, setEnvoye] = useState(false);

    async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
        evenement.preventDefault();
        setErreur(null);
        const donnees = new FormData(evenement.currentTarget);

        const { error } = await authClient.signUp.email({
            email: String(donnees.get("email")),
            password: String(donnees.get("motDePasse")),
            name: String(donnees.get("nom")),
        });

        if (error) {
            setErreur(error.message ?? "");
            return;
        }
        // La vérification étant obligatoire, l'inscription ne connecte pas : on annonce
        // le courriel plutôt que de rediriger vers une page qui refuserait l'accès.
        setEnvoye(true);
    }

    if (envoye) {
        return (
            <main className="mx-auto max-w-md px-4 py-16">
                <h1 className="text-2xl font-semibold">{tVerif("titre")}</h1>
                <p className="mt-4 text-sm opacity-80">{tVerif("instruction")}</p>
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
                <label className="flex flex-col gap-1">
                    {t("nom")}
                    <input name="nom" required className="border border-bordure p-2" />
                </label>
                <label className="flex flex-col gap-1">
                    {t("email")}
                    <input name="email" type="email" required className="border border-bordure p-2" />
                </label>
                <label className="flex flex-col gap-1">
                    {t("motDePasse")}
                    <input name="motDePasse" type="password" required minLength={8} className="border border-bordure p-2" />
                </label>
                {erreur !== null && <p role="alert">{erreur}</p>}
                <Button type="submit">{t("valider")}</Button>
            </form>
            {googleActif && (
                <Button
                    variante="contour"
                    className="mt-4 w-full"
                    onClick={() =>
                        void authClient.signIn.social({ provider: "google", callbackURL: "/" })
                    }
                >
                    {t("avecGoogle")}
                </Button>
            )}
        </main>
    );
}
