"use client";

import { useRouter } from "next/navigation";
import { useState, type JSX } from "react";
import { addToLocalCart } from "../../../../../../lib/local-cart";
import { addToServerCart } from "../actions";

interface AddToCartProps {
    variantId: string;
    currency: string;
    signedIn: boolean;
    labels: { add: string; added: string; currencyRefused: string; failed: string };
}

// Connecté, l'ajout va DIRECTEMENT au serveur : le panier local ne sert plus, et deux
// sources qui se croient toutes deux à jour est exactement ce qu'on évite. Sans compte, il
// n'écrit que dans le navigateur.
export function AddToCart(props: AddToCartProps): JSX.Element {
    const router = useRouter();
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onClick(): Promise<void> {
        setBusy(true);
        setMessage(null);
        try {
            if (props.signedIn) {
                const result = await addToServerCart(props.variantId);
                // Trois issues et non deux : un refus de devise se répare en vidant le
                // panier, un refus sans raison ne se répare pas de la même façon. Les
                // confondre dirait à l'acheteur de vider un panier qui n'est pas en cause.
                if (result.ok) {
                    setMessage(props.labels.added);
                } else {
                    setMessage(
                        result.reason === "currency"
                            ? props.labels.currencyRefused
                            : props.labels.failed,
                    );
                }
                router.refresh();
            } else {
                const result = addToLocalCart({
                    variantId: props.variantId,
                    quantity: 1,
                    currency: props.currency,
                });
                setMessage(result.added ? props.labels.added : props.labels.currencyRefused);
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                disabled={busy}
                onClick={() => void onClick()}
                className="self-start border border-bordure px-6 py-3 text-sm"
            >
                {props.labels.add}
            </button>
            {message !== null && (
                <p role="status" className="text-sm text-muet">
                    {message}
                </p>
            )}
        </div>
    );
}
