import { prisma, readOrderForBuyer } from "@clemperl/db";
import { E_ORDER_STATUS, E_PAYMENT_METHOD, E_PAYMENT_STATUS } from "@clemperl/db/enums";
import { formatPrice } from "@clemperl/domain";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { requireVerifiedSession } from "../../../../lib/session";
import { PayButton } from "./components/pay-button";
import { PaymentWatch } from "./components/payment-watch";

export const dynamic = "force-dynamic";

// Lu par le serveur et passé au bouton en prop : en notation crochets, un composant client
// n'aurait pas la valeur, `process` n'existant pas dans le navigateur.
const API = process.env["NEXT_PUBLIC_API_URL"] ?? "";

// Les méthodes que l'API sert par un fournisseur. L'écran ne peut pas interroger le registre
// de l'API : cette liste doit rester celle de `SIMULATED_METHODS` dans `registry.ts`, et une
// méthode absente d'ici n'offrirait jamais le bouton « Payer ».
const ONLINE_METHODS: readonly string[] = [E_PAYMENT_METHOD.CARD, E_PAYMENT_METHOD.MOBILE_MONEY];

export default async function OrderPage({
    params,
}: {
    params: Promise<{ locale: string; reference: string }>;
}): Promise<JSX.Element> {
    const { locale, reference } = await params;
    const session = await requireVerifiedSession(`/orders/${reference}`);
    const t = await getTranslations("orders");
    const format = await getFormatter();

    const order = await readOrderForBuyer(prisma, {
        buyerId: session.user.id,
        reference,
    });
    // 404 et non 403 : le filtre vit dans la SIGNATURE du dépôt, et répondre « interdit »
    // confirmerait que cette référence existe, ce qui renseigne déjà.
    if (!order) {
        notFound();
    }

    // Il reste de l'argent à régler tant que le paiement n'est pas reçu, qu'il soit en
    // attente ou refusé : un premier essai refusé laisse la commande `FAILED`, et c'est
    // précisément là que l'acheteur doit pouvoir recommencer. Une commande annulée ne se
    // règle plus : l'API refuserait, autant ne pas offrir le bouton.
    const owed =
        order.paymentStatus !== E_PAYMENT_STATUS.SETTLED &&
        order.status !== E_ORDER_STATUS.CANCELLED;
    const online = ONLINE_METHODS.includes(order.paymentMethod);
    // On n'interroge que pour une tentative EN LIGNE sans réponse, donc portant un
    // fournisseur : un paiement hors ligne attend des jours, et la page se rafraîchirait
    // toutes les cinq secondes pour rien. Une tentative restée en attente derrière une
    // commande réglée est morte, elle n'attend plus rien.
    const awaiting =
        order.paymentStatus !== E_PAYMENT_STATUS.SETTLED &&
        order.payments.some(
            (attempt) =>
                attempt.provider !== null && attempt.status === E_PAYMENT_STATUS.PENDING,
        );

    return (
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
            <h1 className="font-titre text-4xl tracking-tight">{order.reference}</h1>
            <p className="mt-2 text-sm">{t(`status.${order.status}`)}</p>
            <p className="text-sm text-muet">{order.vendor.shopName}</p>

            <ul className="mt-8 divide-y divide-bordure">
                {order.items.map((line) => (
                    <li key={line.id} className="flex justify-between gap-6 py-3 text-sm">
                        <span>
                            {line.productTitle}
                            {line.variantLabel !== "" && ` (${line.variantLabel})`}
                            {` x${line.quantity}`}
                        </span>
                        <span>
                            {formatPrice(
                                line.unitAmount * line.quantity,
                                order.currency as never,
                                locale,
                            )}
                        </span>
                    </li>
                ))}
            </ul>

            <p className="mt-4 text-right">
                {t("total")} :{" "}
                {formatPrice(order.totalAmount, order.currency as never, locale)}
            </p>

            <section className="mt-12 border-t border-bordure pt-6 text-sm">
                <h2 className="text-muet">{t("shipTo")}</h2>
                <p className="mt-2">{order.shipToName}</p>
                <p>{order.shipToLine}</p>
                <p>
                    {order.shipToCity}, {order.shipToCountry}
                </p>
                <p>{order.shipToPhone}</p>
            </section>

            <section className="mt-12 border-t border-bordure pt-6 text-sm">
                <h2 className="text-muet">{t("payment")}</h2>
                <p className="mt-2">{t(`method.${order.paymentMethod}`)}</p>
                <p>{t(`paymentStatus.${order.paymentStatus}`)}</p>

                {owed && (
                    <div className="mt-4 flex flex-col gap-4">
                        <p>{t(`methodHint.${order.paymentMethod}`)}</p>
                        {online ? (
                            <PayButton
                                orderId={order.id}
                                locale={locale}
                                apiUrl={API}
                                labels={{
                                    pay:
                                        order.paymentStatus === E_PAYMENT_STATUS.FAILED
                                            ? t("payRetry")
                                            : t("pay"),
                                    failed: t("payFailed"),
                                    // `raw` rend le bloc entier : une phrase par code que
                                    // l'API peut rendre, sans les énumérer ici.
                                    errors: t.raw("payErrors") as Record<string, string>,
                                }}
                            />
                        ) : (
                            <div>
                                <h3 className="text-muet">{t("shopContact")}</h3>
                                <p className="mt-2">{order.vendor.shopName}</p>
                                <p>{order.vendor.contactEmail}</p>
                                <p>{order.vendor.contactPhone}</p>
                            </div>
                        )}
                    </div>
                )}

                {order.payments.length > 0 && (
                    <div className="mt-6">
                        <h3 className="text-muet">{t("attempts")}</h3>
                        <ul className="mt-2 divide-y divide-bordure">
                            {order.payments.map((attempt) => (
                                <li key={attempt.id} className="flex justify-between gap-6 py-2">
                                    <span>{format.dateTime(attempt.createdAt, "complet")}</span>
                                    <span>{t(`paymentStatus.${attempt.status}`)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>

            <PaymentWatch awaiting={awaiting} />
        </main>
    );
}
