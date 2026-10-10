import { prisma, readOrderForBuyer } from "@clemperl/db";
import { formatPrice } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { requireVerifiedSession } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export default async function OrderPage({
    params,
}: {
    params: Promise<{ locale: string; reference: string }>;
}): Promise<JSX.Element> {
    const { locale, reference } = await params;
    const session = await requireVerifiedSession(`/orders/${reference}`);
    const t = await getTranslations("orders");

    const order = await readOrderForBuyer(prisma, {
        buyerId: session.user.id,
        reference,
    });
    // 404 et non 403 : le filtre vit dans la SIGNATURE du dépôt, et répondre « interdit »
    // confirmerait que cette référence existe, ce qui renseigne déjà.
    if (!order) {
        notFound();
    }

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
        </main>
    );
}
