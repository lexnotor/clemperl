import { prisma, readDisputeForAdministration } from "@clemperl/db";
import { E_DISPUTE_ACTION, allowedDisputeActions } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { requireAdministrator } from "../../../lib/session";
import { DecisionForm } from "./decision-form";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long", timeStyle: "short" });

export default async function DisputePage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ notice?: string | string[] }>;
}): Promise<JSX.Element> {
    await requireAdministrator();
    const { id } = await params;
    const { notice } = await searchParams;
    const t = messages.disputes;
    const reasons = t.reasons as Record<string, string>;

    const dispute = await readDisputeForAdministration(prisma, id);
    if (dispute === null) {
        notFound();
    }

    // Le formulaire s'offre sur tout litige ouvert, mûr ou non : la file désigne ce qui
    // attend, elle n'interdit pas de trancher plus tôt.
    const allowed = allowedDisputeActions(dispute.status);
    const outcomes = [E_DISPUTE_ACTION.DECIDE_FOR_BUYER, E_DISPUTE_ACTION.DECIDE_FOR_VENDOR]
        .filter((action) => allowed.includes(action))
        .map((action) => ({ value: action, label: t.outcomes[action] }));

    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <a href="/disputes" className="text-sm text-muet hover:text-texte">
                {t.backToList}
            </a>
            <h1 className="mt-4 font-titre text-4xl leading-tight tracking-tight">
                {dispute.order.reference}
            </h1>
            <p className="mt-2 text-sm text-muet">
                {dispute.order.vendor.shopName} · {dispute.order.vendor.slug}
            </p>
            {/* Seuls les deux avis connus s'affichent : une valeur inventée dans l'URL ne
                montre rien. */}
            {notice === "decided" && (
                <p role="status" className="mt-4 border-l-2 border-texte pl-4 text-sm">
                    {t.decidedNotice}
                </p>
            )}
            {notice === "mail_failed" && (
                <p role="status" className="mt-4 border-l-2 border-accent pl-4 text-sm text-accent">
                    {messages.errors.dispute.mail_failed}
                </p>
            )}
            <p className="mt-4 text-sm">
                <span className="text-muet">{t.statusLabel} : </span>
                <span data-testid="dispute-status">{t.status[dispute.status]}</span>
            </p>
            <p className="text-sm">
                <span className="text-muet">{t.reasonLabel} : </span>
                {reasons[dispute.reason] ?? dispute.reason}
            </p>

            <section className="mt-8 text-sm">
                <h2 className="text-muet">{t.lines}</h2>
                <ul className="mt-2">
                    {dispute.items.map(({ orderItem }) => (
                        <li key={orderItem.id}>
                            {orderItem.productTitle}
                            {orderItem.variantLabel !== "" && ` (${orderItem.variantLabel})`} x{orderItem.quantity}
                        </li>
                    ))}
                </ul>
            </section>

            {dispute.decidedAt !== null && (
                <section className="mt-8 text-sm">
                    <h2 className="text-muet">{t.decisionComment}</h2>
                    <p className="mt-2 whitespace-pre-wrap">{dispute.decisionComment}</p>
                </section>
            )}

            {/* Le fil, du plus ancien au plus récent. Les pièces passent par la route gardée
                de l'administration, jamais par une URL du stockage. */}
            <ol className="mt-10 flex flex-col gap-6 text-sm">
                {dispute.messages.map((message) => (
                    <li key={message.id} data-testid="dispute-message" className="border-l-2 border-bordure pl-4">
                        <p className="text-muet">
                            {t.party[message.party]} · {DATE.format(message.createdAt)}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap">{message.body}</p>
                        {message.attachments.length > 0 && (
                            <ul className="mt-2 flex flex-col gap-1" aria-label={t.attachmentsOf}>
                                {message.attachments.map((attachment) => (
                                    <li key={attachment.id}>
                                        <a href={`/api/disputes/attachments/${attachment.id}`} className="underline">
                                            {attachment.originalName}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </li>
                ))}
            </ol>

            {outcomes.length > 0 && (
                <DecisionForm
                    disputeId={dispute.id}
                    outcomes={outcomes}
                    labels={{
                        title: t.decisionTitle,
                        outcome: t.outcome,
                        outcomePlaceholder: t.outcomePlaceholder,
                        comment: t.comment,
                        noRefund: t.noRefund,
                        submit: t.submit,
                        submitting: t.submitting,
                    }}
                />
            )}
        </main>
    );
}
