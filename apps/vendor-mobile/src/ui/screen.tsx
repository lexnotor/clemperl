import type { JSX, ReactNode } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "./use-theme";

interface ScreenProps {
    children: ReactNode;
    // L'écran est sous l'en-tête natif, qui couvre déjà le bord du haut : y ajouter la marge
    // de sécurité laisserait une bande vide sous le titre.
    underHeader?: boolean;
}

// Le cadre de chaque écran : les marges de sécurité du téléphone, le fond du thème, et un
// défilement pour les petits écrans ou le clavier ouvert.
export function Screen({ children, underHeader = false }: ScreenProps): JSX.Element {
    const theme = useTheme();
    return (
        <SafeAreaView
            edges={underHeader ? ["right", "bottom", "left"] : undefined}
            style={[styles.safe, { backgroundColor: theme.background }]}
        >
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {children}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    content: { padding: 24, gap: 16 },
});
