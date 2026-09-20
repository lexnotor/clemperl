"use client";

import { Button, Field } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type JSX } from "react";
import { authClient } from "../../../../lib/auth-client";

export default function ResetPasswordPage(): JSX.Element {
    const t = useTranslations("auth.resetPassword");
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setError(null);
        const form = new FormData(event.currentTarget);
        const token = new URLSearchParams(window.location.search).get("token") ?? "";

        const { error: failure } = await authClient.resetPassword({
            newPassword: String(form.get("password")),
            token,
        });

        if (failure) {
            setError(t("expiredLink"));
            return;
        }
        router.replace("/sign-in");
    }

    return (
        <main className="mx-auto max-w-md px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{t("title")}</h1>
            <form method="post" onSubmit={submit} className="mt-10 flex flex-col gap-6">
                <Field
                    label={t("password")}
                    name="password"
                    type="password"
                    required
                    minLength={8}
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
        </main>
    );
}
