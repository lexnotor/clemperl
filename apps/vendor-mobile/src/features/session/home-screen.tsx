import { useApolloClient, useQuery } from "@apollo/client/react";
import { useRouter } from "expo-router";
import { useEffect, type JSX } from "react";
import { StyleSheet, Text } from "react-native";
import { useT } from "../../i18n/use-t";
import { Button } from "../../ui/button";
import { Notice } from "../../ui/notice";
import { useTheme } from "../../ui/use-theme";
import { meState } from "./me-state";
import { ME_QUERY } from "./me.query";

interface HomeScreenProps {
    // La déconnexion du client Better Auth. Reçue plutôt qu'importée, pour la même raison que
    // la connexion du formulaire : l'écran de route la branche, les tests la remplacent.
    signOut: () => Promise<unknown>;
}

export function HomeScreen({ signOut }: HomeScreenProps): JSX.Element {
    const t = useT();
    const theme = useTheme();
    const router = useRouter();
    const client = useApolloClient();
    // `notifyOnNetworkStatusChange` : sans lui, « Réessayer » relance la requête sans que
    // l'écran repasse par l'attente, et le vendeur croirait que rien ne s'est passé.
    const result = useQuery(ME_QUERY, { notifyOnNetworkStatusChange: true });
    const state = meState(result);

    // Une session que le serveur ne reconnaît plus renvoie à la connexion, sans message : rien
    // de ce qui s'est passé n'est à la portée du vendeur.
    useEffect(() => {
        if (state.kind === "signed-out") {
            router.replace("/sign-in");
        }
    }, [state.kind, router]);

    async function leave(): Promise<void> {
        try {
            await signOut();
        } catch {
            // La boutique, qui monte Better Auth, est injoignable. Le client a déjà oublié le
            // cookie avant d'envoyer la requête : le téléphone n'a plus de session, et l'écran
            // doit le suivre au lieu de rester sur la boutique.
        }
        // Le cache garde la réponse de `me` : le compte suivant verrait sinon un instant la
        // boutique du précédent.
        await client.clearStore();
        router.replace("/sign-in");
    }

    const title = StyleSheet.flatten([styles.title, { color: theme.text }]);
    const body = StyleSheet.flatten([styles.body, { color: theme.muted }]);

    switch (state.kind) {
        case "loading":
        case "signed-out":
            return <Text style={body}>{t("common.loading")}</Text>;
        case "unreachable":
            return (
                <>
                    <Text style={title}>{t("unreachable.title")}</Text>
                    <Text style={body}>{t("unreachable.body")}</Text>
                    <Button label={t("common.retry")} onPress={() => void result.refetch()} />
                    {/* Une sortie, même ici : une erreur durable du serveur laisserait sinon le
                        vendeur devant « Réessayer », sans pouvoir changer de compte. */}
                    <Button label={t("home.signOut")} onPress={() => void leave()} variant="outline" />
                </>
            );
        case "no-shop":
            return (
                <>
                    <Text style={title}>{t("noShop.title")}</Text>
                    <Text style={body}>{t("noShop.body")}</Text>
                    <Button label={t("home.signOut")} onPress={() => void leave()} variant="outline" />
                </>
            );
        case "ready":
            return (
                <>
                    <Text style={body}>{t("home.shop")}</Text>
                    <Text style={title}>{state.shop.name}</Text>
                    {state.shop.suspended && <Notice text={t("home.suspended")} />}
                    <Text style={body}>{t("home.signedInAs", { email: state.email })}</Text>
                    <Button label={t("home.signOut")} onPress={() => void leave()} variant="outline" />
                </>
            );
    }
}

const styles = StyleSheet.create({
    title: { fontSize: 28, fontWeight: "600" },
    body: { fontSize: 15 },
});
