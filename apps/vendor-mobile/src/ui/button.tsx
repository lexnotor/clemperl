import type { JSX } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "./use-theme";

interface ButtonProps {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    variant?: "primary" | "outline";
}

export function Button({ label, onPress, disabled = false, variant = "primary" }: ButtonProps): JSX.Element {
    const theme = useTheme();
    const filled = variant === "primary";
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={[
                styles.base,
                filled
                    ? { backgroundColor: theme.text }
                    : { borderColor: theme.text, borderWidth: 1 },
                disabled && styles.disabled,
            ]}
        >
            <Text style={[styles.label, { color: filled ? theme.background : theme.text }]}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    base: { paddingVertical: 14, paddingHorizontal: 20, alignItems: "center" },
    label: { fontSize: 16, fontWeight: "600" },
    disabled: { opacity: 0.5 },
});
