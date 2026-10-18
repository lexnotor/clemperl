import { listOrdersForAdministration, listShopsForAdministration, prisma } from "@clemperl/db";
import { formatPrice } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import type { JSX } from "react";
import { requireAdministrator } from "../../lib/session";
import { OrderFilters } from "./order-filters";
import { pageFrom, statusFrom } from "./search-params";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// Le dépôt rend la devise en `string` : la colonne est une énumération, mais la ligne aplatie
// ne porte pas ce type. Le type attendu par `formatPrice` se déduit de sa signature.
type Currency = Parameters<typeof formatPrice>[1];

const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long" });

// Les filtres de la requête, repris tels quels dans les liens de pagination : changer de
// page ne doit pas faire perdre l'état ou la boutique choisis.
function hrefFor(page: number, status: string | undefined, shop: string | undefined): string {
    const query = new URLSearchParams();
    if (status !== undefined) {
        query.set("status", status);
    }
    if (shop !== undefined) {
        query.set("shop", shop);
    }
    if (page > 1) {
        query.set("page", String(page));
    }
    const text = query.toString();
    return text === "" ? "/orders" : `/orders?${text}`;
}

// Un paramètre répété (`?page=1&page=2`) arrive en tableau : on lit le premier.
function firstOf(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

export default async function OrdersPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
    await requireAdministrator();
    const t = messages.orders;
    const statusLabels = t.status as Record<string, string>;
    const paymentLabels = t.payment.status as Record<string, string>;

    const params = await searchParams;
    const page = pageFrom(firstOf(params["page"]));
    const status = statusFrom(firstOf(params["status"]));
    const rawShop = firstOf(params["shop"]);
    const shop = rawShop === undefined || rawShop === "" ? undefined : rawShop;

    const [{ rows, total }, shops] = await Promise.all([
        listOrdersForAdministration(prisma, {
            ...(status === undefined ? {} : { status }),
            ...(shop === undefined ? {} : { vendorId: shop }),
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
        }),
        listShopsForAdministration(prisma),
    ]);

    // Les états viennent du catalogue, jamais de la valeur de l'énumération brute.
    const statuses = Object.keys(statusLabels).map((value) => ({
        value,
        label: statusLabels[value] ?? value,
    }));

    const hasPrevious = page > 1;
    const hasNext = page * PAGE_SIZE < total;

    return (
        <main className="mx-auto max-w-3xl px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{t.title}</h1>

            <OrderFilters
                shops={shops.map((s) => ({ id: s.id, shopName: s.shopName }))}
                statuses={statuses}
                selectedShop={shop ?? ""}
                selectedStatus={status ?? ""}
                labels={{
                    shopFilter: t.shopFilter,
                    statusFilter: t.statusFilter,
                    allShops: t.allShops,
                    allStatuses: t.allStatuses,
                    apply: t.apply,
                }}
            />

            <p data-testid="orders-count" className="mt-4 text-sm text-muet">
                {t.counted.replace("{count}", () => String(total))}
            </p>

            {rows.length === 0 ? (
                <p className="mt-8 border-t border-bordure pt-8 text-base text-muet">{t.empty}</p>
            ) : (
                <ul className="mt-8 border-t border-bordure">
                    {rows.map((row) => (
                        <li key={row.id} className="border-b border-bordure">
                            <a
                                href={`/orders/${row.id}`}
                                className="flex items-center justify-between gap-6 py-5"
                            >
                                <div className="flex flex-col gap-1">
                                    <span className="font-titre text-lg">{row.reference}</span>
                                    {/* Le SLUG à côté du nom : `shopName` n'est pas unique, et
                                        deux lignes indistinguables feraient agir sur la
                                        commande de quelqu'un d'autre. */}
                                    <span className="text-sm text-muet">
                                        {row.shopName} · {row.shopSlug}
                                    </span>
                                    <span className="text-sm text-muet">{row.shipToName}</span>
                                    <span className="text-sm text-muet">
                                        {DATE.format(row.createdAt)}
                                    </span>
                                </div>
                                <div className="flex flex-col items-end gap-1 text-sm">
                                    <span>{formatPrice(row.totalAmount, row.currency as Currency)}</span>
                                    <span>{statusLabels[row.status] ?? row.status}</span>
                                    {/* « Paiement » devant l'état : « Reçue » la commande et
                                        « Reçu » l'argent se confondent sans lui. */}
                                    <span className="text-muet">
                                        {t.payment.title} :{" "}
                                        {paymentLabels[row.paymentStatus] ?? row.paymentStatus}
                                    </span>
                                </div>
                            </a>
                        </li>
                    ))}
                </ul>
            )}

            {hasPrevious || hasNext ? (
                <nav className="mt-8 flex justify-between text-sm">
                    {hasPrevious ? (
                        <a href={hrefFor(page - 1, status, shop)} className="hover:text-texte">
                            {t.previous}
                        </a>
                    ) : (
                        <span />
                    )}
                    {hasNext ? (
                        <a href={hrefFor(page + 1, status, shop)} className="hover:text-texte">
                            {t.next}
                        </a>
                    ) : null}
                </nav>
            ) : null}
        </main>
    );
}
