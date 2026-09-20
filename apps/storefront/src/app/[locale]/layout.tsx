import { isSupportedLocale } from "@clemperl/i18n";
import "@clemperl/ui/styles/globals.css";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { getMessages } from "next-intl/server";
import { Archivo, Spectral } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX, ReactNode } from "react";

// `next/font` auto-héberge les fichiers et les sert depuis notre origine : pas de requête
// vers Google au rendu, et aucun saut de police au chargement.
const titre = Spectral({
    subsets: ["latin"],
    weight: ["400", "500"],
    style: ["normal", "italic"],
    variable: "--police-titre",
    display: "swap",
});

const interfaceUtilisateur = Archivo({
    subsets: ["latin"],
    weight: ["400", "500"],
    variable: "--police-interface",
    display: "swap",
});

function EnTete(): JSX.Element {
    const t = useTranslations("navigation");

    return (
        <header className="border-b border-bordure">
            <div className="mx-auto flex max-w-2xl items-baseline justify-between px-6 py-5">
                <Link href="/" className="font-titre text-lg tracking-tight">
                    ClemPerl
                </Link>
                <Link href="/become-a-vendor" className="text-sm text-muet hover:text-texte">
                    {t("account")}
                </Link>
            </div>
        </header>
    );
}

export default async function LocaleLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
    const { locale } = await params;
    if (!isSupportedLocale(locale)) notFound();

    const messages = await getMessages();

    return (
        <html lang={locale} className={`${titre.variable} ${interfaceUtilisateur.variable}`}>
            <body>
                <NextIntlClientProvider messages={messages}>
                    <EnTete />
                    {children}
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
