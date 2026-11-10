import { useMemo } from "react";
import { useLocale } from "./use-locale";
import { translate, type TMessageKey } from "./translate";

// La fonction de traduction des écrans, dans la langue du téléphone.
export function useT(): (key: TMessageKey, args?: Record<string, string>) => string {
    const locale = useLocale();
    return useMemo(() => (key, args) => translate(locale, key, args), [locale]);
}
