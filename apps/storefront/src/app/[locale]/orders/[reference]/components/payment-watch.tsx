"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 5000;
// Cinq minutes. Au-delà, un onglet oublié rafraîchirait une page que personne ne lit.
const MAX_TICKS = 60;

interface PaymentWatchProps {
    /** Vrai tant qu'un fournisseur a été sollicité et n'a pas encore répondu. */
    awaiting: boolean;
}

// Redemande la page au serveur par intervalles, et s'arrête dès que `awaiting` retombe ou
// que le plafond est atteint. Un paiement hors ligne reste en attente des jours durant :
// le serveur ne passe `awaiting` qu'à une tentative EN LIGNE, sans quoi cette page se
// rafraîchirait toutes les cinq secondes sans rien apprendre à personne.
export function PaymentWatch({ awaiting }: PaymentWatchProps): null {
    const router = useRouter();

    useEffect(() => {
        if (!awaiting) {
            return;
        }
        let ticks = 0;
        const timer = setInterval(() => {
            ticks += 1;
            if (ticks > MAX_TICKS) {
                clearInterval(timer);
                return;
            }
            router.refresh();
        }, INTERVAL_MS);
        return () => clearInterval(timer);
    }, [awaiting, router]);

    return null;
}
