import { getLocales } from "expo-localization";
import { useMemo } from "react";
import { deviceLocale } from "./locale";
import { translate, type TMessageKey } from "./translate";

// La fonction de traduction des écrans, dans la langue du téléphone.
export function useT(): (key: TMessageKey, args?: Record<string, string>) => string {
    const locale = deviceLocale(getLocales()[0]?.languageCode ?? null);
    return useMemo(() => (key, args) => translate(locale, key, args), [locale]);
}
