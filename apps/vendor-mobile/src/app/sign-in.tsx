import { useRouter } from "expo-router";
import type { JSX } from "react";
import { StyleSheet, Text } from "react-native";
import { SignInForm } from "../features/session/sign-in-form";
import { useT } from "../i18n/use-t";
import { authClient } from "../lib/runtime";
import { Screen } from "../ui/screen";
import { useTheme } from "../ui/use-theme";

export default function SignIn(): JSX.Element {
    const t = useT();
    const theme = useTheme();
    const router = useRouter();

    return (
        <Screen>
            <Text style={[styles.title, { color: theme.text }]}>{t("signIn.title")}</Text>
            <Text style={{ color: theme.muted }}>{t("signIn.intro")}</Text>
            <SignInForm
                // Seuls le statut et le code du refus comptent pour l'écran : le code choisit la
                // phrase à afficher.
                signIn={async (input) => {
                    const { error } = await authClient.signIn.email(input);
                    return {
                        error: error === null ? null : { status: error.status, code: error.code },
                    };
                }}
                onSignedIn={() => router.replace("/")}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    title: { fontSize: 28, fontWeight: "600" },
});
