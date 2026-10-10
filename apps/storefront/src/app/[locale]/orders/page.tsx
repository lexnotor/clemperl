import { listOrdersForBuyer, prisma } from "@clemperl/db";
import { formatPrice } from "@clemperl/domain";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { JSX } from "react";
import { requireVerifiedSession } from "../../../lib/session";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
    const { locale } = await params;
    const session = await requireVerifiedSession("/orders");
    const t = await getTranslations("orders");
    const format = await getFormatter();

    const orders = await listOrdersForBuyer(prisma, session.user.id);

    return (
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
            <h1 className="font-titre text-4xl tracking-tight">{t("title")}</h1>

            {orders.length === 0 ? (
                <p className="mt-8 text-sm text-muet">{t("empty")}</p>
            ) : (
                <ul className="mt-12 flex flex-col">
                    {orders.map((order) => (
                        <li key={order.reference} className="border-t border-bordure py-4">
                            <Link
                                href={`/orders/${order.reference}`}
                                className="flex justify-between gap-6"
                            >
                                <span>{order.reference}</span>
                                <span className="text-sm">
                                    {formatPrice(
                                        order.totalAmount,
                                        order.currency as never,
                                        locale,
                                    )}
                                </span>
                            </Link>
                            {/* L'état par sa CLÉ, jamais la valeur de l'énumération :
                                « PLACED » n'est pas du français, et un écran qui l'affiche
                                parle la langue de la base. */}
                            <p className="mt-1 text-xs text-muet">
                                {t(`status.${order.status}`)} · {order.vendor.shopName} ·{" "}
                                {format.dateTime(order.createdAt, "long")}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
