import { useTranslations } from "next-intl";
import type { JSX } from "react";

// Page atteinte après l'inscription. Better Auth traite le jeton sur sa propre route ;
// celle-ci n'existe que pour dire à l'utilisateur ce qu'il doit faire, dans sa langue.
export default function VerifierPage(): JSX.Element {
    const t = useTranslations("authentification.verification");

    return (
        <main className="mx-auto max-w-md px-4 py-16">
            <h1 className="text-2xl font-semibold">{t("titre")}</h1>
            <p className="mt-4 text-sm opacity-80">{t("instruction")}</p>
        </main>
    );
}
