import { ApolloProvider } from "@apollo/client/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { JSX } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { apolloClient } from "../lib/runtime";

// La racine de la navigation. Expo Router fait de chaque fichier de `src/app/` un écran, et ce
// fichier-ci les enveloppe tous : le client GraphQL leur est fourni ici, une fois. Les écrans
// portent leur propre titre : la barre de navigation d'Expo Router est masquée.
export default function RootLayout(): JSX.Element {
    return (
        <ApolloProvider client={apolloClient}>
            <SafeAreaProvider>
                <StatusBar style="auto" />
                <Stack screenOptions={{ headerShown: false }} />
            </SafeAreaProvider>
        </ApolloProvider>
    );
}
