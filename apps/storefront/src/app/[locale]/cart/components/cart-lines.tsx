"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type JSX } from "react";
import { changeQuantity, removeLine } from "../actions";

interface CartLine {
    variantId: string;
    productTitle: string;
    productSlug: string;
    shopSlug: string;
    variantLabel: string;
    quantity: number;
    unitPrice: string;
    linePrice: string;
}

interface CartLinesProps {
    sections: { shopSlug: string; shopName: string; subtotal: string; lines: CartLine[] }[];
    total: string;
    signedIn: boolean;
    labels: {
        quantity: string;
        remove: string;
        subtotal: string;
        total: string;
        checkout: string;
        signInToOrder: string;
    };
}

// Client parce qu'il porte des champs de quantité et des retraits. Il ne formate AUCUN
// prix : il reçoit des chaînes déjà prêtes. `formatPrice` tire `@clemperl/core`, donc
// nodemailer, donc `node:net`, que Turbopack refuse d'assembler dans un paquet navigateur.
//
// Un sous-total PAR BOUTIQUE, parce que chaque groupe deviendra une commande distincte :
// l'acheteur doit voir à l'avance ce que chaque vendeur recevra.
export function CartLines(props: CartLinesProps): JSX.Element {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    // La quantité se valide à la SORTIE du champ ou sur Entrée, jamais à chaque frappe.
    // Vider « 2 » pour taper « 5 » passe par une chaîne vide, que `Number` lit comme zéro
    // et que le dépôt traite comme un retrait : l'article disparaîtrait avant le « 5 ».
    // Un champ vide ne vaut donc rien, et retirer une ligne reste le travail du bouton.
    //
    // Le champ n'est pas contrôlé : `revalidatePath` rafraîchit le rendu serveur, mais
    // c'est `router.refresh()` qui fait relire le prix de ligne, le sous-total et le
    // total par le client.
    function commit(variantId: string, raw: string): void {
        const next = Number(raw);
        if (!Number.isFinite(next) || next <= 0) {
            return;
        }
        startTransition(() => {
            void changeQuantity(variantId, next).then(() => {
                router.refresh();
            });
        });
    }

    return (
        <div className="mt-8 flex flex-col gap-10">
            {props.sections.map((section) => (
                <section key={section.shopSlug}>
                    <h2 className="text-sm text-muet">
                        <Link href={`/shops/${section.shopSlug}`} className="underline">
                            {section.shopName}
                        </Link>
                    </h2>

                    <ul className="mt-3 divide-y divide-bordure">
                        {section.lines.map((line) => (
                            <li key={line.variantId} className="flex items-center gap-4 py-3">
                                <div className="flex-1">
                                    <Link
                                        href={`/shops/${line.shopSlug}/${line.productSlug}`}
                                        className="text-sm"
                                    >
                                        {line.productTitle}
                                    </Link>
                                    {line.variantLabel !== "" && (
                                        <p className="text-xs text-muet">{line.variantLabel}</p>
                                    )}
                                    <p className="text-xs text-muet">{line.unitPrice}</p>
                                </div>

                                <label className="flex items-center gap-2 text-xs text-muet">
                                    {props.labels.quantity}
                                    <input
                                        type="number"
                                        min={1}
                                        defaultValue={line.quantity}
                                        disabled={pending}
                                        className="w-16 border border-bordure bg-transparent px-2 py-1 text-sm"
                                        onBlur={(event) =>
                                            commit(line.variantId, event.target.value)
                                        }
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                                event.preventDefault();
                                                commit(line.variantId, event.currentTarget.value);
                                            }
                                        }}
                                    />
                                </label>

                                <span className="w-24 text-right text-sm">{line.linePrice}</span>

                                <button
                                    type="button"
                                    disabled={pending}
                                    className="text-xs text-muet underline"
                                    onClick={() =>
                                        startTransition(() => {
                                            void removeLine(line.variantId).then(() => {
                                                router.refresh();
                                            });
                                        })
                                    }
                                >
                                    {props.labels.remove}
                                </button>
                            </li>
                        ))}
                    </ul>

                    <p className="mt-2 text-right text-sm text-muet">
                        {props.labels.subtotal} : {section.subtotal}
                    </p>
                </section>
            ))}

            <div className="flex items-baseline justify-between border-t border-bordure pt-6">
                <span className="text-lg">
                    {props.labels.total} : {props.total}
                </span>
                {/* Sans compte, on n'envoie PAS vers une page qui redirigerait : le lien dit
                    ce qu'il demande, parce qu'une redirection silencieuse vers la connexion
                    fait croire à une panne. */}
                <Link
                    href={props.signedIn ? "/checkout" : "/sign-in?next=%2Fcart"}
                    className="border border-bordure px-6 py-3 text-sm"
                >
                    {props.signedIn ? props.labels.checkout : props.labels.signInToOrder}
                </Link>
            </div>
        </div>
    );
}
