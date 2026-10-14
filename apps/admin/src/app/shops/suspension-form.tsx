"use client";

import messages from "@clemperl/i18n/messages/admin/fr.json";
import { Button } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { toggleSuspension } from "./actions";
import { INITIAL_STATE } from "./types/suspension-state.interface";

interface SuspensionFormProps {
    vendorId: string;
    suspended: boolean;
}

// Un formulaire par boutique, et un seul bouton : il dit l'ÉTAT VISÉ, pas la bascule. Un
// bouton « Basculer » obligerait le lecteur à savoir où il part pour deviner où il arrive.
export function SuspensionForm({ vendorId, suspended }: SuspensionFormProps): JSX.Element {
    const t = messages.shops;
    const [state, action, pending] = useActionState(toggleSuspension, INITIAL_STATE);

    return (
        <form action={action} className="flex items-center gap-3">
            <input type="hidden" name="vendorId" value={vendorId} />
            {/* La valeur est l'INVERSE de l'état courant : le formulaire demande ce qu'il
                veut obtenir, et le dépôt est idempotent, donc deux clics simultanés
                aboutissent au même endroit sans refus à expliquer. */}
            <input type="hidden" name="suspended" value={suspended ? "false" : "true"} />
            <Button type="submit" disabled={pending}>
                {suspended ? t.restore : t.suspend}
            </Button>
            {state.message.length > 0 && (
                <p role="status" className="text-sm text-muet">
                    {state.message.join(" ")}
                </p>
            )}
        </form>
    );
}
