import { listOpenDisputesForAdministration, prisma } from "@clemperl/db";
import { isDisputeRipe } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import type { JSX } from "react";
import { requireAdministrator } from "../../lib/session";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long", timeStyle: "short" });

export default async function DisputesPage(): Promise<JSX.Element> {
    await requireAdministrator();
    const t = messages.disputes;
    const reasons = t.reasons as Record<string, string>;
    const disputes = await listOpenDisputesForAdministration(prisma);

    // UN seul « maintenant » pour toute la page : deux lignes au même silence ne doivent
    // pas recevoir deux marques différentes parce que l'horloge a tourné entre elles.
    const now = new Date();
    const rows = disputes.map((dispute) => ({ ...dispute, ripe: isDisputeRipe(dispute.lastActivityAt, now) }));
    const ripeCount = rows.filter((row) => row.ripe).length;

    return (
        <main className="mx-auto max-w-3xl px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{t.title}</h1>

            {rows.length === 0 ? (
                <p className="mt-8 border-t border-bordure pt-8 text-base text-muet">{t.empty}</p>
            ) : (
                <>
                    {/* Le COMPTE des litiges à trancher, parce que c'est lui qui se vide :
                        il dit à l'administration où elle en est. */}
                    <p data-testid="ripe-count" className="mt-2 text-sm text-muet">
                        {t.ripeCount.replace("{count}", () => String(ripeCount))}
                    </p>

                    {/* Tous les litiges ouverts, les plus longs silences en tête : l'ordre
                        du dépôt place d'office ceux qui sont à trancher là où l'on regarde,
                        et les autres restent joignables pour trancher plus tôt. */}
                    <ul className="mt-8 border-t border-bordure">
                        {rows.map((row) => (
                            <li key={row.id} className="border-b border-bordure py-5">
                                <a href={`/disputes/${row.id}`} className="font-medium hover:underline">
                                    {row.order.reference}
                                </a>
                                {row.ripe && (
                                    <span className="ml-3 text-xs uppercase tracking-wide text-accent">
                                        {t.ripe}
                                    </span>
                                )}
                                {/* Le slug accompagne le nom : un nom de boutique n'est pas
                                    unique, et deux lignes indistinguables feraient trancher le
                                    litige de quelqu'un d'autre. */}
                                <p className="mt-1 text-sm text-muet">
                                    {row.order.vendor.shopName} · {row.order.vendor.slug} ·{" "}
                                    {reasons[row.reason] ?? row.reason} · {t.lastActivity} :{" "}
                                    {DATE.format(row.lastActivityAt)}
                                </p>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </main>
    );
}
