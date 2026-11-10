import { useTheme } from "./use-theme";

// Les options de `Stack.Screen` d'un écran qui montre l'en-tête natif, avec son retour : le
// titre, et les couleurs du thème, pour que l'en-tête suive le mode clair ou sombre. La racine
// masque l'en-tête par défaut ; un écran le rend visible ici.
export function useHeaderOptions(title: string) {
    const theme = useTheme();
    return {
        headerShown: true,
        title,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text },
    };
}
