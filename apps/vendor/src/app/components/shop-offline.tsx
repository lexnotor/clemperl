import messages from "@clemperl/i18n/messages/vendor/fr.json";
import type { JSX } from "react";

// Composant SERVEUR, sans état et sans interaction : il n'a rien à faire dans le paquet
// navigateur.
//
// Rendu par les PAGES et non par la mise en page : celle-ci est statique par décision, et
// un layout qui ne garde pas l'accès n'a rien à faire de données protégées. C'est la même
// raison qui veut que `requireVendorMembership` soit appelée en tête de chaque page plutôt
// que posée une fois dans le layout.
export function ShopOffline({ suspended }: { suspended: boolean }): JSX.Element | null {
    if (!suspended) {
        return null;
    }

    return (
        <p role="status" className="border border-bordure bg-bordure/20 px-4 py-3 text-sm">
            {messages.shopOffline.message}
        </p>
    );
}
