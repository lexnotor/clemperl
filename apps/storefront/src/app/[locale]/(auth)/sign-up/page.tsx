"use client";

import { Button, Field } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type FormEvent, type JSX } from "react";
import { authClient } from "../../../../lib/auth-client";

// Next ne remplace `process.env.NEXT_PUBLIC_*` qu'en notation POINTÉE, au moment du
// build. En notation crochets, la substitution n'a pas lieu : `process` n'existe pas
// dans le navigateur, le composant lève au rendu, et React abandonne l'hydratation.
// Le formulaire se soumet alors en GET natif, mot de passe visible dans l'URL.
const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ACTIF === "1";

export default function SignUpPage(): JSX.Element {
    const t = useTranslations("auth.signUp");
    const tVerify = useTranslations("auth.verifyEmail");
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setError(null);
        const form = new FormData(event.currentTarget);

        const { error: failure } = await authClient.signUp.email({
            email: String(form.get("email")),
            password: String(form.get("password")),
            name: String(form.get("name")),
        });

        if (failure) {
            setError(failure.message ?? "");
            return;
        }
        // La vérification étant obligatoire, l'inscription ne connecte pas : on annonce
        // le courriel plutôt que de rediriger vers une page qui refuserait l'accès.
        setSent(true);
    }

    if (sent) {
        return (
            <main className="mx-auto max-w-md px-6 py-20">
                <h1 className="font-titre text-4xl tracking-tight">{tVerify("title")}</h1>
                <p className="mt-6 text-base text-muet">{tVerify("instruction")}</p>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-md px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{t("title")}</h1>

            <form method="post" onSubmit={submit} className="mt-10 flex flex-col gap-6">
                <Field label={t("name")} name="name" required />
                <Field label={t("email")} name="email" type="email" required />
                <Field
                    label={t("password")}
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    hint={t("passwordHint")}
                />
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

            <div className="mt-10 border-t border-bordure pt-6 text-sm">
                <Link href="/sign-in" className="text-muet hover:text-texte">
                    {t("haveAccount")}
                </Link>
            </div>
        </main>
    );
}
