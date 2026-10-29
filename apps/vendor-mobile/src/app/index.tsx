import type { JSX } from "react";
import { HomeScreen } from "../features/session/home-screen";
import { authClient } from "../lib/runtime";
import { Screen } from "../ui/screen";

// L'accueil. Sans session, `me` est refusé, et l'écran renvoie de lui-même à la connexion.
export default function Home(): JSX.Element {
    return (
        <Screen>
            <HomeScreen signOut={() => authClient.signOut()} />
        </Screen>
    );
}
