import { listOrdersForVendor, prisma } from "@clemperl/db";
import { formatPrice } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import Link from "next/link";
import type { JSX } from "react";
import { requireVendorMembership } from "../../lib/session";

// Cette page lit la session : elle ne peut pas être pré-rendue au build.
export const dynamic = "force-dynamic";

const t = messages.orders;
const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long" });

export default async function OrdersPage(): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();
    const orders = await listOrdersForVendor(prisma, vendor.id);

    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">{t.title}</h1>

            {orders.length === 0 ? (
                <p className="mt-12 text-sm text-muet">{t.empty}</p>
            ) : (
                <ul className="mt-12 flex flex-col">
                    {orders.map((order) => (
                        <li key={order.id} className="border-t border-bordure py-4">
                            <Link
                                href={`/orders/${order.id}`}
                                className="flex justify-between gap-6"
                            >
                                <span>{order.reference}</span>
                                <span className="text-sm text-muet">
                                    {/* La devise est celle de la COMMANDE, figée à l'achat :
                                        celle de la boutique a pu changer depuis. */}
                                    {formatPrice(order.totalAmount, order.currency)}
                                </span>
                            </Link>
                            {/* L'état par sa CLÉ, jamais la valeur de l'énumération :
                                « PLACED » n'est pas du français, et un écran qui l'affiche
                                parle la langue de la base. */}
                            <p className="mt-1 text-xs text-muet">
                                {t.status[order.status]} · {order.shipToName} ·{" "}
                                {DATE.format(order.createdAt)}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
