import type { JSX, ReactNode } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "./use-theme";

interface ScreenProps {
    children: ReactNode;
}

// Le cadre de chaque écran : les marges de sécurité du téléphone, le fond du thème, et un
// défilement pour les petits écrans ou le clavier ouvert.
export function Screen({ children }: ScreenProps): JSX.Element {
    const theme = useTheme();
    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
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
