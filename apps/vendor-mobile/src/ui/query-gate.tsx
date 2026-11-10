import { useRouter } from "expo-router";
import { useEffect, type JSX, type ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { useT } from "../i18n/use-t";
import { queryFailure } from "../lib/query-failure";
import type { TQueryFailure } from "../types/query-failure.type";
import { Button } from "./button";
import { useTheme } from "./use-theme";

interface QueryGateProps<TData> {
    result: { loading: boolean; error?: unknown; data?: TData; refetch: () => unknown };
    children: (data: TData) => ReactNode;
}

// Le portail de chaque écran qui lit l'API : l'attente, le retour à la connexion ou à l'accueil,
// l'écran « injoignable », puis seulement les données. Un écran n'écrit donc jamais ces cas lui-même.
export function QueryGate<TData>({ result, children }: QueryGateProps<TData>): JSX.Element {
    const t = useT();
    const theme = useTheme();
    const router = useRouter();
    const failure: TQueryFailure | null =
        result.error === undefined ? null : queryFailure(result.error);

    // Session refusée : la connexion, sans message. Compte sans boutique, ou qui l'a perdue
    // pendant que l'application était ouverte : l'accueil, qui dit « Aucune boutique ».
    useEffect(() => {
        if (failure === "signed-out") {
            router.replace("/sign-in");
        } else if (failure === "no-shop") {
            router.replace("/");
        }
    }, [failure, router]);

    const title = StyleSheet.flatten([styles.title, { color: theme.text }]);
    const body = StyleSheet.flatten([styles.body, { color: theme.muted }]);

    if (failure === "unreachable") {
        return (
            <>
                <Text style={title}>{t("unreachable.title")}</Text>
                <Text style={body}>{t("unreachable.body")}</Text>
                <Button label={t("common.retry")} onPress={() => void result.refetch()} />
            </>
        );
    }
    if (failure !== null || result.loading || result.data === undefined) {
        // Pendant la redirection, l'attente reste affichée plutôt qu'un écran vide.
        return <Text style={body}>{t("common.loading")}</Text>;
    }
    return <>{children(result.data)}</>;
}

const styles = StyleSheet.create({
    title: { fontSize: 28, fontWeight: "600" },
    body: { fontSize: 15 },
});
