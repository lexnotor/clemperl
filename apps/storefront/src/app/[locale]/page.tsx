import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { JSX } from "react";

export default function HomePage(): JSX.Element {
    const t = useTranslations("home");

    return (
        <main className="mx-auto max-w-2xl px-6 py-24">
            <h1 className="font-titre text-5xl leading-[1.05] tracking-tight">{t("title")}</h1>
            <p className="mt-6 max-w-md text-base text-muet">{t("subtitle")}</p>
            <Link href="/become-a-vendor" className="mt-10 inline-block">
                <Button>{t("becomeVendor")}</Button>
            </Link>
        </main>
    );
}
