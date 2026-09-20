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

export default function ConnexionPage(): JSX.Element {
    const t = useTranslations("authentification.connexion");
    const tErreurs = useTranslations("authentification.erreurs");
    const [erreur, setErreur] = useState<string | null>(null);

    async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
        evenement.preventDefault();
        setErreur(null);
        const donnees = new FormData(evenement.currentTarget);

        const { error } = await authClient.signIn.email({
            email: String(donnees.get("email")),
            password: String(donnees.get("motDePasse")),
        });

        if (error) {
            // Le message de la bibliothèque est en anglais : on affiche le nôtre, en
            // distinguant l'adresse non vérifiée du refus d'identifiants, parce que
            // l'utilisateur n'a pas la même action à faire dans les deux cas.
            setErreur(
                error.status === 403
                    ? tErreurs("adresseNonVerifiee")
                    : tErreurs("identifiantsInvalides"),
            );
            return;
        }
        // Une page protégée renvoie ici en portant sa propre adresse. La destination est
        // contrainte à un chemin interne : une URL absolue permettrait à un lien forgé de
        // rediriger vers un site tiers après une connexion réussie.
        const suite = new URLSearchParams(window.location.search).get("suite");
        const interne = suite?.startsWith("/") === true && !suite.startsWith("//");
        window.location.href = interne ? (suite as string) : "/";
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
                    Adresse e-mail
                    <input name="email" type="email" required className="border border-bordure p-2" />
                </label>
                <label className="flex flex-col gap-1">
                    Mot de passe
                    <input name="motDePasse" type="password" required className="border border-bordure p-2" />
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
