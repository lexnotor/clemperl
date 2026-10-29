import type { JSX } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "./use-theme";

interface TextFieldProps extends Omit<TextInputProps, "style"> {
    label: string;
}

// Un champ et son libellé. Le libellé est aussi le nom accessible du champ : un lecteur
// d'écran l'annonce, et les tests le retrouvent par lui.
export function TextField({ label, ...input }: TextFieldProps): JSX.Element {
    const theme = useTheme();
    return (
        <View style={styles.field}>
            <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
            <TextInput
                accessibilityLabel={label}
                placeholderTextColor={theme.muted}
                style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                {...input}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    field: { gap: 6 },
    label: { fontSize: 14 },
    input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
