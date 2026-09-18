import messages from "@clemperl/i18n/messages/vendor/fr.json";
import type { JSX } from "react";

export default function AccueilPage(): JSX.Element {
    return (
        <main className="mx-auto max-w-3xl px-4 py-16">
            <h1 className="text-3xl font-semibold">{messages.accueil.titre}</h1>
        </main>
    );
}
