"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, type JSX } from "react";

// Une minute : l'avis d'un fournisseur qui a répondu arrive bien avant, et un acheteur qui
// l'a manqué ne reste pas longtemps devant une page figée.
export const FALLBACK_REFRESH_DELAY_MS = 60_000;

// Le marqueur d'une commande dont une tentative en ligne attend son fournisseur. L'écoute du
// temps réel le cherche à sa première connexion ; le marqueur, lui, redemande la page au
// serveur UNE fois, une minute après son affichage, au cas où l'avis du fournisseur se serait
// perdu : parti avant que la connexion ait rejoint sa salle, ou pendant que Redis ou l'API
// étaient injoignables. Une fois, et jamais plus : ce n'est pas une interrogation par
// intervalles. Une page qui attend encore après ce rafraîchissement attend un fournisseur qui
// n'a pas répondu, et c'est son avis, quand il viendra, qui la fera changer.
export function ProviderWaitingMarker(): JSX.Element {
    const router = useRouter();
    // Le drapeau tient même quand React rejoue l'effet sans démonter le composant, comme pour
    // une page cachée puis réaffichée : le délai ne se programme qu'une fois dans sa vie.
    const refreshed = useRef(false);
    const onElapsed = useEffectEvent(() => {
        refreshed.current = true;
        router.refresh();
    });

    useEffect(() => {
        if (refreshed.current) {
            return;
        }
        // L'issue du fournisseur, réglée ou refusée, rend la page sans ce marqueur : le
        // composant se démonte, et le nettoyage emporte le délai avec lui.
        const timer = setTimeout(() => onElapsed(), FALLBACK_REFRESH_DELAY_MS);
        return () => clearTimeout(timer);
    }, []);

    return <div data-realtime-waiting="" hidden />;
}
