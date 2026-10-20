import { listOrdersForVendor, prisma } from "@clemperl/db";
import { formatPrice } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import Link from "next/link";
import type { JSX } from "react";
import { ShopOffline } from "../components/shop-offline";
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
            <ShopOffline suspended={vendor.suspendedAt !== null} />
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
                                parle la langue de la base. Les deux axes se lisent côte à
                                côte, et le mot « Paiement » reste devant le second : sans lui,
                                « Reçue » (la commande) et « Reçu » (l'argent) se confondent. */}
                            <p className="mt-1 text-xs text-muet">
                                {t.status[order.status]} · {t.payment.title} :{" "}
                                {t.payment.status[order.paymentStatus]} · {order.shipToName} ·{" "}
                                {DATE.format(order.createdAt)}
                            </p>
                            {/* Un litige tranché pour le client reste signalé : la boutique a
                                encore à le servir, et la plateforme n'en saura rien tant que
                                le client ne l'aura pas dit. */}
                            {(order.dispute?.status === "OPEN" ||
                                order.dispute?.status === "DECIDED_FOR_BUYER") && (
                                <p
                                    data-testid={`dispute-badge-${order.reference}`}
                                    className="mt-1 text-xs text-accent"
                                >
                                    {order.dispute.status === "OPEN"
                                        ? messages.disputes.badge
                                        : messages.disputes.badgeToServe}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
