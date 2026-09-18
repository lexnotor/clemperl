import { isSupportedLocale } from "@clemperl/i18n";
import "@clemperl/ui/styles/globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import type { JSX, ReactNode } from "react";

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
        <html lang={locale}>
            <body>
                <NextIntlClientProvider messages={messages}>
                    {children}
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
