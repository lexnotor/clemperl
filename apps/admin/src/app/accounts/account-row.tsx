"use client";

import { Button } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { changeRole, resendInvitation } from "./actions";
import { INITIAL_STATE } from "./types/accounts-state.interface";

interface AccountRowProps {
    userId: string;
    name: string;
    email: string;
    roleLabel: string;
    pending: boolean;
    /** Ce que le lecteur peut faire vient du SERVEUR : importer le domaine ici tirerait
     *  `@clemperl/core` dans le paquet navigateur. Un bouton non permis n'est pas rendu. */
    canRemove: boolean;
    canResend: boolean;
    canPromote: boolean;
    labels: { pending: string; remove: string; resend: string; promote: string };
}

export function AccountRow(props: AccountRowProps): JSX.Element {
    const [roleState, roleAction, roleBusy] = useActionState(changeRole, INITIAL_STATE);
    const [resendState, resendAction, resendBusy] = useActionState(
        resendInvitation,
        INITIAL_STATE,
    );

    return (
        <li className="flex items-center justify-between gap-6 border-b border-bordure py-5">
            <div className="flex flex-col gap-1">
                <span className="font-titre text-lg">{props.name}</span>
                <span className="text-sm text-muet">{props.email}</span>
                <span data-testid="role" className="text-sm text-muet">
                    {props.roleLabel}
                    {props.pending && ` · ${props.labels.pending}`}
                </span>
            </div>
            <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-3">
                    {props.canPromote && (
                        <form action={roleAction}>
                            <input type="hidden" name="userId" value={props.userId} />
                            <input type="hidden" name="role" value="SUPER_ADMIN" />
                            <Button type="submit" disabled={roleBusy}>
                                {props.labels.promote}
                            </Button>
                        </form>
                    )}
                    {props.canResend && (
                        <form action={resendAction}>
                            <input type="hidden" name="userId" value={props.userId} />
                            <Button type="submit" disabled={resendBusy}>
                                {props.labels.resend}
                            </Button>
                        </form>
                    )}
                    {props.canRemove && (
                        <form action={roleAction}>
                            <input type="hidden" name="userId" value={props.userId} />
                            <input type="hidden" name="role" value="CUSTOMER" />
                            <Button type="submit" disabled={roleBusy}>
                                {props.labels.remove}
                            </Button>
                        </form>
                    )}
                </div>
                {[...roleState.message, ...resendState.message].map((phrase) => (
                    <p key={phrase} role="alert" className="text-sm text-muet">
                        {phrase}
                    </p>
                ))}
            </div>
        </li>
    );
}
