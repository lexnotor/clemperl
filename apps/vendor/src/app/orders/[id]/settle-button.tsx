"use client";

import { Button } from "@clemperl/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition, type JSX } from "react";

interface SettleButtonProps {
    orderId: string;
    apiUrl: string;
    // Le code que l'API rend quand le paiement est déjà pointé. La page le passe en prop :
    // ce composant ne peut pas importer `@clemperl/db`, qui entraînerait le client Prisma
    // dans le paquet du navigateur, et un littéral recopié ici ne suivrait pas un
    // renommage côté API.
    alreadySettledCode: string;
    labels: { settle: string; failed: string };
}

// Nest rend un refus sous la forme `{ message: "<CODE>", ... }`. Un corps absent ou qui
// n'est pas du JSON n'a pas de code, et ne doit pas faire échouer la lecture du refus.
async function readRefusalCode(response: Response): Promise<string | null> {
    try {
        const body: unknown = await response.json();
        if (
            typeof body === "object" &&
            body !== null &&
            "message" in body &&
            typeof body.message === "string"
        ) {
            return body.message;
        }
    } catch {
        // Rien à lire : le bouton se contente du statut HTTP.
    }
    return null;
}

// Le vendeur pointe lui-même un encaissement qui s'est fait hors de la plateforme. L'appel
// part du NAVIGATEUR vers l'API, sur une autre origine : le cookie de session ne voyage que
// par `credentials: "include"`, et sans lui l'API répond 401 sans rien qui l'explique.
export function SettleButton({
    orderId,
    apiUrl,
    alreadySettledCode,
    labels,
}: SettleButtonProps): JSX.Element {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    // Le bouton reste pris tant que la page n'a pas fini de se relire : sans cela, un second
    // clic partirait pendant que l'écran montre encore un paiement non réglé.
    const [refreshing, startRefresh] = useTransition();

    async function settle(): Promise<void> {
        setBusy(true);
        setFailed(false);
        try {
            const response = await fetch(`${apiUrl}/payments/${orderId}/settle`, {
                method: "POST",
                credentials: "include",
            });
            // Un collègue qui a pointé le même paiement avant ce clic n'est pas un échec : la
            // commande est dans l'état voulu, et c'est la page qui est périmée. Elle se relit
            // comme après un succès, et montre qui a pointé.
            const alreadySettled =
                response.status === 409 && (await readRefusalCode(response)) === alreadySettledCode;
            if (!response.ok && !alreadySettled) {
                setFailed(true);
                return;
            }
            // La page se relit APRÈS la réponse : elle est rendue par le serveur, qui ne
            // sait pas que l'API vient d'écrire.
            startRefresh(() => router.refresh());
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col items-start gap-2">
            <Button
                type="button"
                variant="outline"
                onClick={() => void settle()}
                disabled={busy || refreshing}
            >
                {labels.settle}
            </Button>
            {failed ? (
                <p role="alert" className="text-sm text-accent">
                    {labels.failed}
                </p>
            ) : null}
        </div>
    );
}
