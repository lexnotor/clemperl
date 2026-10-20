"use client";

import { Button, FileField, TextAreaField } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import { useActionState, type JSX } from "react";
import { markServedAction, replyToDisputeAction } from "../actions";
import { INITIAL_DISPUTE_FORM_STATE } from "../types/dispute-form-state.interface";
import { checkAttachments } from "./attachment-check";

interface ReplyFormProps {
    reference: string;
    disputeId: string;
}

// Rendu seulement sur un litige ouvert : la page décide, et l'action refuse de toute façon
// un message sur un litige tranché.
export function ReplyForm({ reference, disputeId }: ReplyFormProps): JSX.Element {
    const t = useTranslations("disputes");
    const tErrors = useTranslations("errors.dispute");
    const [state, action, pending] = useActionState(replyToDisputeAction, INITIAL_DISPUTE_FORM_STATE);

    return (
        <form action={action} className="mt-10 flex flex-col gap-6">
            <input type="hidden" name="reference" value={reference} />
            <input type="hidden" name="disputeId" value={disputeId} />
            {/* Reprend la réponse rendue par un refus : React vide le formulaire dès que
                l'action se termine. */}
            <TextAreaField
                label={t("reply")}
                name="body"
                required
                maxLength={5000}
                rows={4}
                defaultValue={state.values?.body}
            />
            {/* Le champ du kit, et non le contrôle natif : celui-ci s'affiche dans la langue du
                navigateur, pas dans celle de la page. */}
            <FileField
                label={t("attachments")}
                chooseLabel={t("chooseFiles")}
                emptyLabel={t("noFiles")}
                name="attachments"
                multiple
                accept="application/pdf,image/jpeg,image/png"
                onChange={(event) =>
                    checkAttachments(event.currentTarget, (violation) =>
                        tErrors(violation.i18nKey.replace("errors.dispute.", "") as never, violation.i18nArgs as never),
                    )
                }
            />
            {state.message.length > 0 && (
                <ul role="alert" className="flex flex-col gap-2 border-l-2 border-accent pl-4">
                    {state.message.map((line) => (
                        <li key={line} className="text-sm text-accent">
                            {line}
                        </li>
                    ))}
                </ul>
            )}
            <Button type="submit" disabled={pending}>
                {pending ? t("sending") : t("send")}
            </Button>
        </form>
    );
}

interface ServedFormProps {
    reference: string;
    disputeId: string;
}

// Rendu seulement quand le domaine offre `SERVE` : sur un litige clos, le bouton n'existe pas.
//
// Se déclarer servi clôt le litige pour de bon, et la commande n'en ouvre pas de second :
// l'action se cache derrière un `details`, comme le retrait de la modération, pour qu'un
// clic manqué ne retire pas à l'acheteur son seul recours.
export function ServedForm({ reference, disputeId }: ServedFormProps): JSX.Element {
    const t = useTranslations("disputes");
    const [state, action, pending] = useActionState(markServedAction, INITIAL_DISPUTE_FORM_STATE);

    return (
        <details className="mt-10 border-t border-bordure pt-6 text-sm">
            <summary className="cursor-pointer underline">{t("served")}</summary>
            <form action={action} className="mt-4 flex flex-col gap-3">
                <input type="hidden" name="reference" value={reference} />
                <input type="hidden" name="disputeId" value={disputeId} />
                <p className="text-muet">{t("servedHint")}</p>
                {state.message.length > 0 && (
                    <p role="alert" className="text-accent">
                        {state.message.join(" ")}
                    </p>
                )}
                <Button type="submit" variant="outline" disabled={pending}>
                    {t("servedConfirm")}
                </Button>
            </form>
        </details>
    );
}
