import { getLocales } from "expo-localization";
import { deviceLocale, type TMobileLocale } from "./locale";

// La langue des écrans : celle du téléphone. `useT` et les dates passent toutes deux par ici,
// pour que le texte et la date d'un même écran ne soient jamais dans deux langues.
export function useLocale(): TMobileLocale {
    return deviceLocale(getLocales()[0]?.languageCode ?? null);
}
