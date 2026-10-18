import { prisma, readOrderForAdministration } from "@clemperl/db";
import { allowedOrderActions, formatPrice } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { requireAdministrator } from "../../../lib/session";
import { OrderActions } from "./order-actions";

export const dynamic = "force-dynamic";

// Le dépôt rend la devise en `string` : le type attendu par `formatPrice` se déduit de sa
// signature.
type Currency = Parameters<typeof formatPrice>[1];

const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long", timeStyle: "short" });

export default async function OrderPage({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
    await requireAdministrator();
    const { id } = await params;
    const t = messages.orders;
    const statusLabels = t.status as Record<string, string>;
    const paymentLabels = t.payment.status as Record<string, string>;
    const actionLabels = t.action as Record<string, string>;

    const order = await readOrderForAdministration(prisma, id);
    if (order === null) {
        notFound();
    }

    // Les boutons viennent de CETTE liste, et de rien d'autre. Une action impossible ne
    // s'affiche pas grisée, elle ne s'affiche pas.
    const allowed = allowedOrderActions(order.status as never) as readonly string[];

    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <Link href="/orders" className="text-sm text-muet hover:text-texte">
                {t.backToList}
            </Link>

            <div className="mt-4 flex items-baseline justify-between gap-6">
                <h1 className="font-titre text-4xl leading-tight tracking-tight">
                    {order.reference}
                </h1>
                <span data-testid="order-status" className="text-sm text-muet">
                    {statusLabels[order.status] ?? order.status}
                </span>
            </div>
            <p className="mt-2 text-sm text-muet">
                {t.placedOn} {DATE.format(order.createdAt)}
            </p>
            <p className="mt-1 text-sm text-muet">
                {order.shopName} · {order.shopSlug}
            </p>

            <section className="mt-10 text-sm">
                <p className="flex justify-between gap-6">
                    <span>{formatPrice(order.totalAmount, order.currency as Currency)}</span>
                    <span className="text-muet">
                        {t.payment.title} :{" "}
                        {paymentLabels[order.paymentStatus] ?? order.paymentStatus}
                    </span>
                </p>
                <p className="mt-6 text-muet">{t.buyer}</p>
                <p>{order.shipToName}</p>
            </section>

            {allowed.length > 0 && (
                <OrderActions
                    orderId={order.id}
                    actions={allowed.map((value) => ({
                        value,
                        label: actionLabels[value] ?? value,
                    }))}
                    // L'avertissement ne s'affiche que s'il y a quelque chose à avertir : une
                    // annulation possible ET un paiement déjà reçu. Le dire sur une commande
                    // impayée inquiéterait pour rien.
                    settledWarning={
                        order.paymentStatus === "SETTLED" && allowed.includes("CANCEL")
                            ? t.settledWarning
                            : ""
                    }
                />
            )}
        </main>
    );
}
