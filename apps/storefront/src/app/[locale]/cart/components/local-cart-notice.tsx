"use client";

import Link from "next/link";
import { useEffect, useState, type JSX } from "react";
import { readLocalCart } from "../../../../lib/local-cart";

interface LocalCartNoticeProps {
    labels: { one: string; many: string; empty: string; signInToOrder: string };
}

// Ce que voit un visiteur SANS compte. Son panier vit dans son navigateur, donc le serveur
// ne sait pas s'il est vide : rendre « votre panier est vide » depuis la page mentirait à
// quelqu'un qui vient d'y mettre un article.
//
// Il affiche un NOMBRE et non les articles : les nommer demanderait de résoudre chaque
// identifiant côté serveur, et la spec ne promet de les retrouver qu'après connexion.
// `localStorage` n'est lisible qu'après le montage, d'où l'état plutôt qu'une lecture
// directe au rendu.
export function LocalCartNotice(props: LocalCartNoticeProps): JSX.Element | null {
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        setCount(readLocalCart().length);
    }, []);

    // Tant que le compte n'est pas lu, on n'affirme rien : annoncer « vide » puis se
    // corriger ferait clignoter un message faux.
    if (count === null) {
        return null;
    }

    if (count === 0) {
        return <p className="mt-8 text-sm text-muet">{props.labels.empty}</p>;
    }

    const label = count === 1 ? props.labels.one : props.labels.many;

    return (
        <div className="mt-8 flex items-baseline gap-4">
            <p className="text-sm text-muet">{label.replace("{count}", String(count))}</p>
            <Link href="/sign-in?next=%2Fcart" className="text-sm underline">
                {props.labels.signInToOrder}
            </Link>
        </div>
    );
}
