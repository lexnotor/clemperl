import { prisma, readOrderForVendor } from "@clemperl/db";
import { allowedOrderActions, formatPrice } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { requireVendorMembership } from "../../../lib/session";
import { OrderActions } from "./order-actions";

// Cette page lit la session : elle ne peut pas être pré-rendue au build.
export const dynamic = "force-dynamic";

const t = messages.orders;
const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long", timeStyle: "short" });

export default async function OrderPage({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();
    const { id } = await params;

    const order = await readOrderForVendor(prisma, { vendorId: vendor.id, orderId: id });
    // 404 et non 403 : le filtre par boutique vit dans la signature du dépôt, et répondre
    // « interdit » confirmerait que cette commande existe, ce qui renseigne déjà.
    if (!order) {
        notFound();
    }

    // La devise est copiée dans une CONSTANTE locale : la restriction de type d'un accès
    // à une propriété est abandonnée dès qu'on entre dans une fermeture, et `formatPrice`
    // est appelée dans un `map`.
    const currency = order.currency;

    // Les boutons viennent de CETTE liste, et de rien d'autre. Une action impossible ne
    // s'affiche pas grisée, elle ne s'affiche pas : un bouton qu'on ne peut pas presser
    // est une promesse que l'écran ne tient pas.
    const actions = allowedOrderActions(order.status).map((action) => ({
        action,
        label: t.action[action],
    }));

    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <Link href="/orders" className="text-sm text-muet hover:text-texte">
                {t.back}
            </Link>

            <div className="mt-4 flex items-baseline justify-between gap-6">
                <h1 className="font-titre text-4xl leading-tight tracking-tight">
                    {order.reference}
                </h1>
                <span className="text-sm text-muet">{t.status[order.status]}</span>
            </div>
            <p className="mt-2 text-sm text-muet">
                {t.placedOn} {DATE.format(order.createdAt)}
            </p>

            <section className="mt-10">
                <h2 className="font-titre text-xl">{t.lines}</h2>
                {/* Titre, libellé et prix unitaire viennent de la LIGNE de commande, jamais
                    du catalogue : le vendeur a pu renommer son produit ou changer son prix
                    depuis l'achat, et ce qui doit s'afficher est ce qui a été acheté. */}
                <ul className="mt-4 border-t border-bordure">
                    {order.items.map((line) => (
                        <li
                            key={line.id}
                            className="flex justify-between gap-6 border-b border-bordure py-3 text-sm"
                        >
                            <span>
                                {line.productTitle}
                                {line.variantLabel !== "" && ` (${line.variantLabel})`}
                                {` x${line.quantity}`}
                            </span>
                            <span>{formatPrice(line.unitAmount * line.quantity, currency)}</span>
                        </li>
                    ))}
                </ul>
                <p className="mt-4 text-right text-sm">
                    {t.total} : {formatPrice(order.totalAmount, currency)}
                </p>
            </section>

            <section className="mt-10 text-sm">
                <h2 className="font-titre text-xl">{t.shipTo}</h2>
                <p className="mt-4">{order.shipToName}</p>
                <p>{order.shipToLine}</p>
                <p>
                    {order.shipToCity}, {order.shipToCountry}
                </p>
                <p>{order.shipToPhone}</p>
            </section>

            {order.note !== null && order.note !== "" && (
                <section className="mt-10 text-sm">
                    <h2 className="font-titre text-xl">{t.note}</h2>
                    <p className="mt-4">{order.note}</p>
                </section>
            )}

            {actions.length > 0 && <OrderActions orderId={order.id} actions={actions} />}
        </main>
    );
}
