import { useTranslations } from "next-intl";
import type { JSX } from "react";

// Page atteinte après l'inscription. Better Auth traite le jeton sur sa propre route ;
// celle-ci n'existe que pour dire à l'utilisateur ce qu'il doit faire, dans sa langue.
export default function VerifyEmailPage(): JSX.Element {
    const t = useTranslations("auth.verifyEmail");

    return (
        <main className="mx-auto max-w-md px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{t("title")}</h1>
            <p className="mt-6 text-base text-muet">{t("instruction")}</p>
        </main>
    );
}
