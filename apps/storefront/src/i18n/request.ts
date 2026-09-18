import { isSupportedLocale } from "@clemperl/i18n";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
    const demandee = await requestLocale;
    const locale =
        demandee && isSupportedLocale(demandee) ? demandee : routing.defaultLocale;

    return {
        locale,
        messages: (await import(`@clemperl/i18n/messages/storefront/${locale}.json`))
            .default,
    };
});
