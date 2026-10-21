import { toOrigin } from "../../payments/utils";

// Les deux applications qui ont une salle. L'administration n'en a pas : elle est absente
// d'ici à dessein, et son origine est refusée comme une inconnue.
const REALTIME_APPS = [
    ["storefront", "NEXT_PUBLIC_STOREFRONT_URL"],
    ["vendor", "NEXT_PUBLIC_VENDOR_URL"],
] as const;

// L'application qui se connecte se reconnaît à l'origine de la poignée de main. C'est elle,
// et non la session, qui choisit les salles : un même compte achète et vend, avec une session
// partagée entre les fronts, et seule l'origine dit de quel onglet il s'agit.
//
// La comparaison est une ÉGALITÉ sur l'origine entière, jamais un préfixe :
// `http://storefront.test.elsewhere.test` commence comme une origine connue. Une origine
// absente rend `null`, comme une inconnue.
export function appForOrigin(
    origin: string | undefined,
    env: NodeJS.ProcessEnv,
): "storefront" | "vendor" | null {
    for (const [app, name] of REALTIME_APPS) {
        const value = env[name] ?? "";
        // Une variable absente ne désigne aucune origine : sans ce garde, une poignée de main
        // dont l'origine serait vide passerait pour cette application.
        if (value !== "" && toOrigin(name, value) === origin) {
            return app;
        }
    }
    return null;
}
