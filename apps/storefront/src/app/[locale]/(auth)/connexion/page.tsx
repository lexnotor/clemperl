"use client";

import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
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
    const routeur = useRouter();

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
        // contrainte à la MÊME ORIGINE, et cela se vérifie en la résolvant — jamais en
        // inspectant ses premiers caractères. Le navigateur traite la barre inverse comme
        // un séparateur d'autorité : `/\\ailleurs.test` ressemble à un chemin interne et
        // mène ailleurs, au moment précis où l'utilisateur vient d'accorder sa confiance.
        const suite = new URLSearchParams(window.location.search).get("suite");
        const destination = new URL(suite ?? "/", window.location.origin);
        const interne = destination.origin === window.location.origin;

        // Le routeur, et non `window.location` : ce dernier recharge tout le document,
        // ce qui inflige un écran blanc et lance une navigation que l'application ne
        // contrôle plus. `refresh()` fait relire la session aux composants serveur, la
        // seule raison pour laquelle un rechargement complet semblait nécessaire.
        // Seuls le chemin et la requête sont transmis : passer l'adresse entière ferait
        // repasser une URL absolue par un chemin censé la refuser.
        routeur.replace(interne ? `${destination.pathname}${destination.search}` : "/");
        routeur.refresh();
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
