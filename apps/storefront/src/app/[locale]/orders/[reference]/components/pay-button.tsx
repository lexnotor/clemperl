"use client";

import { Button } from "@clemperl/ui";
import { useState, type JSX } from "react";

interface PayButtonProps {
    orderId: string;
    locale: string;
    apiUrl: string;
    /**
     * Les libellés arrivent en PROPS, traduits par le composant serveur : les traduire ici
     * tirerait `@clemperl/core` dans le paquet du navigateur, donc nodemailer, donc
     * `node:net`. `errors` porte une phrase par code que l'API rend.
     */
    labels: { pay: string; failed: string; errors: Record<string, string> };
}

export function PayButton({ orderId, locale, apiUrl, labels }: PayButtonProps): JSX.Element {
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    async function pay(): Promise<void> {
        setBusy(true);
        setMessage(null);
        try {
            // `credentials: "include"` : sans lui le cookie de session ne part pas vers une
            // autre origine, et l'API répond 401 sans que rien ne l'explique.
            const response = await fetch(`${apiUrl}/payments/start`, {
                method: "POST",
                credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ orderId, locale }),
            });
            // Le corps peut ne pas être du JSON (un proxy en panne) : le statut suffit alors à
            // choisir la phrase.
            const body: Record<string, unknown> | null = await response
                .json()
                .catch(() => null);
            const redirectUrl = body?.["redirectUrl"];
            if (response.ok && typeof redirectUrl === "string") {
                // `assign` et non le routeur : la destination est le FOURNISSEUR, qui est
                // hors de cette application. Le bouton reste désactivé, la page s'en va.
                window.location.assign(redirectUrl);
                return;
            }
            // Un refus de l'API porte un CODE dans `message`, jamais une phrase, sauf la
            // session absente, dont le message est une phrase : elle se reconnaît à son statut.
            const code = response.status === 401 ? "UNAUTHORIZED" : body?.["message"];
            // `hasOwn` : un code qui s'appellerait `constructor` ne doit pas rendre la
            // fonction du prototype au lieu d'une phrase.
            const known =
                typeof code === "string" && Object.hasOwn(labels.errors, code)
                    ? labels.errors[code]
                    : undefined;
            setMessage(known ?? labels.failed);
        } catch {
            setMessage(labels.failed);
        }
        setBusy(false);
    }

    return (
        <div className="flex flex-col gap-2">
            <Button type="button" onClick={() => void pay()} disabled={busy} className="self-start">
                {labels.pay}
            </Button>
            {message !== null && (
                <p role="alert" className="text-sm text-accent">
                    {message}
                </p>
            )}
        </div>
    );
}
