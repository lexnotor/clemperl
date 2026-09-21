import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import type { JSX } from "react";

const VENDOR = process.env["NEXT_PUBLIC_VENDOR_URL"] ?? "";

interface ApplicationApprovedProps {
    shopName: string;
}

export function ApplicationApproved({ shopName }: ApplicationApprovedProps): JSX.Element {
    const t = useTranslations("vendor.application.approved");

    return (
        <main className="mx-auto max-w-2xl px-6 py-20">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">
                {t("title", { shop: shopName })}
            </h1>
            <p className="mt-6 border-t border-bordure pt-6 text-base text-muet">{t("next")}</p>
            {/* L'espace vendeur est une AUTRE origine : un lien ordinaire, pas le routeur
                de Next, qui ne navigue qu'à l'intérieur de l'application. */}
            <a href={`${VENDOR}/shop`} className="mt-8 inline-block">
                <Button>{t("openVendorSpace")}</Button>
            </a>
        </main>
    );
}
