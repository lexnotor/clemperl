import type { JSX } from "react";
import { StyleSheet, Text } from "react-native";
import { useTheme } from "./use-theme";

interface NoticeProps {
    text: string;
}

// Un avis à lire, refus ou mise en garde, que les lecteurs d'écran annoncent dès qu'il paraît.
export function Notice({ text }: NoticeProps): JSX.Element {
    const theme = useTheme();
    return (
        <Text accessibilityRole="alert" style={[styles.notice, { color: theme.accent, borderLeftColor: theme.accent }]}>
            {text}
        </Text>
    );
}

const styles = StyleSheet.create({
    notice: { borderLeftWidth: 2, paddingLeft: 12, fontSize: 14 },
});
