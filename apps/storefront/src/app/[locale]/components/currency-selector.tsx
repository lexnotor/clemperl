"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent, JSX } from "react";

interface CurrencySelectorProps {
    current: string;
    available: string[];
    label: string;
}

// Client, parce qu'il ÉCRIT le cookie. Un an, et `SameSite=Lax` pour qu'il survive à un
// lien entrant. `router.refresh()` plutôt qu'un rechargement : les composants serveur se
// rejouent avec le nouveau cookie, sans perdre la position de défilement.
export function CurrencySelector(props: CurrencySelectorProps): JSX.Element {
    const router = useRouter();

    function onChange(event: ChangeEvent<HTMLSelectElement>): void {
        document.cookie = `currency=${event.target.value}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
    }

    // Une seule devise au catalogue : le sélecteur n'offre aucun choix, donc il ne sert
    // qu'à occuper l'écran. On ne le rend pas.
    if (props.available.length < 2) {
        return <span />;
    }

    return (
        <label className="flex items-center gap-2 text-sm text-muet">
            {props.label}
            <select
                value={props.current}
                onChange={onChange}
                className="border border-bordure bg-transparent px-2 py-1 text-sm text-texte"
            >
                {props.available.map((code) => (
                    <option key={code} value={code}>
                        {code}
                    </option>
                ))}
            </select>
        </label>
    );
}
