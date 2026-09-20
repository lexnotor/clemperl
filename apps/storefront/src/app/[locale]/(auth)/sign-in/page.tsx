"use client";

import { Button, Field } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type JSX } from "react";
import { authClient } from "../../../../lib/auth-client";

// Next ne remplace `process.env.NEXT_PUBLIC_*` qu'en notation POINTÉE, au moment du
// build. En notation crochets, la substitution n'a pas lieu : `process` n'existe pas
// dans le navigateur, le composant lève au rendu, et React abandonne l'hydratation.
// Le formulaire se soumet alors en GET natif, mot de passe visible dans l'URL.
const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ACTIF === "1";

export default function SignInPage(): JSX.Element {
    const t = useTranslations("auth.signIn");
    const tErrors = useTranslations("auth.errors");
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setError(null);
        const form = new FormData(event.currentTarget);

        const { error: failure } = await authClient.signIn.email({
            email: String(form.get("email")),
            password: String(form.get("password")),
        });

        if (failure) {
            // Le message de la bibliothèque est en anglais : on affiche le nôtre, en
            // distinguant l'adresse non vérifiée du refus d'identifiants, parce que
            // l'utilisateur n'a pas la même action à faire dans les deux cas.
            setError(
                failure.status === 403
                    ? tErrors("emailNotVerified")
                    : tErrors("invalidCredentials"),
            );
            return;
        }

        // Une page protégée renvoie ici en portant sa propre adresse. La destination est
        // contrainte à un chemin interne : une URL absolue permettrait à un lien forgé de
        // rediriger vers un site tiers après une connexion réussie.
        // La destination est contrainte à la MÊME ORIGINE, et cela se vérifie en la
        // résolvant — jamais en inspectant ses premiers caractères. Le navigateur traite
        // la barre inverse comme un séparateur d'autorité : `/\\ailleurs.test` ressemble à
        // un chemin interne et mène ailleurs, au moment précis où l'utilisateur vient
        // d'accorder sa confiance.
        const next = new URLSearchParams(window.location.search).get("next");
        const destination = new URL(next ?? "/", window.location.origin);
        const internal = destination.origin === window.location.origin;

        // `router` et non `window.location` : ce dernier recharge tout le document, ce
        // qui inflige un écran blanc et rend la navigation incontrôlable. `refresh()`
        // fait relire la session aux composants serveur, ce qui est la seule raison pour
        // laquelle un rechargement complet semblait nécessaire.
        router.replace(internal ? `${destination.pathname}${destination.search}` : "/");
        router.refresh();
    }

    return (
        <main className="mx-auto max-w-md px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{t("title")}</h1>

            <form method="post" onSubmit={submit} className="mt-10 flex flex-col gap-6">
                <Field label={t("email")} name="email" type="email" required />
                <Field label={t("password")} name="password" type="password" required />
                {error !== null && (
                    <p role="alert" className="text-sm text-accent">
                        {error}
                    </p>
                )}
                <Button type="submit" full className="mt-2">
                    {t("submit")}
                </Button>
            </form>

            {googleEnabled && (
                <Button
                    variant="outline"
                    full
                    className="mt-3"
                    onClick={() =>
                        void authClient.signIn.social({ provider: "google", callbackURL: "/" })
                    }
                >
                    {t("withGoogle")}
                </Button>
            )}

            <div className="mt-10 flex justify-between border-t border-bordure pt-6 text-sm">
                <Link href="/sign-up" className="text-muet hover:text-texte">
                    {t("noAccount")}
                </Link>
                <Link href="/forgot-password" className="text-muet hover:text-texte">
                    {t("forgotPassword")}
                </Link>
            </div>
        </main>
    );
}
