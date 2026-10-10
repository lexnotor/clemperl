"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type JSX } from "react";
import { clearLocalCart, readLocalCart } from "../../../../lib/local-cart";
import { pushLocalCart } from "../actions";

interface LocalCartSyncProps {
    signedIn: boolean;
    labels: {
        /** « Certains articles n'ont pas pu être repris : » */
        rejected: string;
        /** Une phrase par raison, indexée par la clé que le dépôt rend. */
        reason: Record<string, string>;
    };
}

// Remonte UNE fois, à l'arrivée sur le panier quand on est connecté. Le garde-fou n'est pas
// décoratif : sans lui, le `router.refresh()` qui suit relancerait la remontée, qui
// relancerait le rafraîchissement.
export function LocalCartSync(props: LocalCartSyncProps): JSX.Element | null {
    const router = useRouter();
    const done = useRef(false);
    const [rejected, setRejected] = useState<{ variantId: string; reason: string }[]>([]);

    useEffect(() => {
        if (!props.signedIn || done.current) {
            return;
        }
        done.current = true;

        const lines = readLocalCart();
        if (lines.length === 0) {
            return;
        }

        void pushLocalCart(lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })))
            .then((result) => {
                // Les refus sont AFFICHÉS, jamais escamotés. Un acheteur qui retrouve trois
                // articles sur quatre sans un mot croit avoir perdu le quatrième par la
                // faute du site.
                setRejected(result.rejected);
                // Vidé DÈS que le serveur a pris la main : deux sources qui se croient
                // toutes deux à jour est le défaut qu'on évite. Vidé même quand des
                // articles sont refusés, sinon la remontée les représenterait à chaque
                // visite et le message reviendrait sans fin.
                clearLocalCart();
                router.refresh();
            })
            .catch(() => undefined);
    }, [props.signedIn, router]);

    if (rejected.length === 0) {
        return null;
    }

    return (
        <div role="status" className="mt-4 border border-bordure p-3 text-sm">
            <p>{props.labels.rejected}</p>
            <ul>
                {rejected.map((refusal) => (
                    <li key={refusal.variantId}>
                        {props.labels.reason[refusal.reason] ?? props.labels.reason["ineligible"]}
                    </li>
                ))}
            </ul>
        </div>
    );
}
