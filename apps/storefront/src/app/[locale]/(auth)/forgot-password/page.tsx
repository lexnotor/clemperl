"use client";

import { Button, Field } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type JSX } from "react";
import { authClient } from "../../../../lib/auth-client";

export default function ForgotPasswordPage(): JSX.Element {
    const t = useTranslations("auth.forgotPassword");
    const [sent, setSent] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        const form = new FormData(event.currentTarget);

        // La route exposée est `request-password-reset` ; `forgetPassword` renvoie
        // 404 sur cette version — vérifié en interrogeant le gestionnaire.
        await authClient.requestPasswordReset({
            email: String(form.get("email")),
            redirectTo: "/reset-password",
        });

        // On affiche la même confirmation que l'adresse existe ou non : indiquer le
        // contraire révélerait quels comptes existent à qui saisit des adresses au
        // hasard.
        setSent(true);
    }

    if (sent) {
        return (
            <main className="mx-auto max-w-md px-6 py-20">
                <h1 className="font-titre text-4xl tracking-tight">{t("title")}</h1>
                <p className="mt-6 text-base text-muet">{t("confirmation")}</p>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-md px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{t("title")}</h1>
            <form method="post" onSubmit={submit} className="mt-10 flex flex-col gap-6">
                <Field label={t("email")} name="email" type="email" required />
                <Button type="submit" full className="mt-2">
                    {t("submit")}
                </Button>
            </form>
        </main>
    );
}
