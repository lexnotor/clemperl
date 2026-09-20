import { useFormatter, useTranslations } from "next-intl";
import type { JSX } from "react";

interface ApplicationUnderReviewProps {
    since: Date;
}

export function ApplicationUnderReview({ since }: ApplicationUnderReviewProps): JSX.Element {
    const t = useTranslations("vendor.application.underReview");
    const format = useFormatter();

    return (
        <main className="mx-auto max-w-2xl px-6 py-20">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">{t("title")}</h1>
            <p className="mt-6 border-t border-bordure pt-6 text-base text-muet">
                {t("since", { date: format.dateTime(since, "long") })}
            </p>
        </main>
    );
}
