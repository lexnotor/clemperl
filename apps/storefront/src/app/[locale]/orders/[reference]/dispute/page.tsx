import { prisma, readDisputeForBuyer, readOrderForBuyer } from "@clemperl/db";
import { DISPUTE_REASONS, E_DISPUTE_ACTION, allowedDisputeActions, canOpenDispute } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { requireVerifiedSession } from "../../../../../lib/session";
import { DisputeThread } from "./components/dispute-thread";
import { OpenDisputeForm } from "./components/open-dispute-form";
import { ReplyForm, ServedForm } from "./components/reply-form";

// Cette page lit la session : elle ne peut pas être pré-rendue au build.
export const dynamic = "force-dynamic";

// Les seuls avis connus. Une valeur inventée dans l'URL n'affiche rien plutôt qu'une clé.
const NOTICES = { opened: "opened", mail_failed: "mailFailed" } as const;

export default async function DisputePage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string; reference: string }>;
    searchParams: Promise<{ notice?: string | string[] }>;
}): Promise<JSX.Element> {
    const { reference } = await params;
    const { notice } = await searchParams;
    const session = await requireVerifiedSession(`/orders/${reference}/dispute`);
    const t = await getTranslations("disputes");

    // 404 et non 403 : le filtre par acheteur vit dans la signature du dépôt, et répondre
    // « interdit » confirmerait que cette référence existe.
    const order = await readOrderForBuyer(prisma, { buyerId: session.user.id, reference });
    if (!order) {
        notFound();
    }

    const dispute =
        order.dispute === null
            ? null
            : await readDisputeForBuyer(prisma, { buyerId: session.user.id, orderReference: reference });

    const noticeKey =
        typeof notice === "string" && Object.hasOwn(NOTICES, notice)
            ? NOTICES[notice as keyof typeof NOTICES]
            : undefined;

    if (dispute === null) {
        // Ni litige, ni droit d'en ouvrir un : rien à montrer ici.
        if (!canOpenDispute({ status: order.status, shippedAt: order.shippedAt, hasDispute: false }, new Date())) {
            notFound();
        }
        return (
            <main className="mx-auto w-full max-w-3xl px-6 py-16">
                <Link href={`/orders/${reference}`} className="text-sm text-muet hover:text-texte">
                    {t("backToOrder")}
                </Link>
                <h1 className="mt-4 font-titre text-4xl tracking-tight">{t("title", { reference })}</h1>
                <p className="mt-4 text-sm text-muet">{t("openIntro")}</p>
                <OpenDisputeForm
                    reference={reference}
                    lines={order.items.map((line) => ({
                        id: line.id,
                        label: `${line.productTitle}${line.variantLabel !== "" ? ` (${line.variantLabel})` : ""} x${line.quantity}`,
                    }))}
                    reasons={DISPUTE_REASONS.map((value) => ({
                        value,
                        label: t(`reasons.${value}` as never),
                    }))}
                />
            </main>
        );
    }

    // L'issue d'une décision, qu'elle soit encore en cours ou que l'acheteur ait été servi
    // depuis. Un litige servi sans décision n'en a pas.
    const decided =
        dispute.decidedAt === null
            ? null
            : dispute.status === "DECIDED_FOR_VENDOR"
              ? "DECIDED_FOR_VENDOR"
              : "DECIDED_FOR_BUYER";

    return (
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
            <Link href={`/orders/${reference}`} className="text-sm text-muet hover:text-texte">
                {t("backToOrder")}
            </Link>
            <h1 className="mt-4 font-titre text-4xl tracking-tight">{t("title", { reference })}</h1>
            {noticeKey !== undefined && (
                <p role="status" className="mt-4 border-l-2 border-texte pl-4 text-sm">
                    {t(noticeKey)}
                </p>
            )}
            <p className="mt-6 text-sm">
                <span className="text-muet">{t("statusLabel")} : </span>
                <span data-testid="dispute-status">{t(`status.${dispute.status}`)}</span>
            </p>

            {/* La décision reste lisible après que l'acheteur s'est déclaré servi : ses
                champs survivent au passage à `SERVED`. */}
            {decided !== null && (
                <section className="mt-8 border-t border-bordure pt-6 text-sm">
                    <h2 className="text-muet">{t("decisionTitle")}</h2>
                    <p className="mt-2">{t(`decision.${decided}`)}</p>
                    <p className="mt-2 whitespace-pre-wrap">{dispute.decisionComment}</p>
                    {decided === "DECIDED_FOR_BUYER" && <p className="mt-2 text-muet">{t("noRefund")}</p>}
                </section>
            )}

            <DisputeThread messages={dispute.messages} />

            {dispute.status === "OPEN" && <ReplyForm reference={reference} disputeId={dispute.id} />}
            {allowedDisputeActions(dispute.status).includes(E_DISPUTE_ACTION.SERVE) && (
                <ServedForm reference={reference} disputeId={dispute.id} />
            )}
        </main>
    );
}
