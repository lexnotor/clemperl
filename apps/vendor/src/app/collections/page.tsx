import { listCollectionsForVendor, prisma } from "@clemperl/db";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import Link from "next/link";
import type { JSX } from "react";
import { requireVendorMembership } from "../../lib/session";

// Cette page lit la session : elle ne peut pas être pré-rendue au build.
export const dynamic = "force-dynamic";

const t = messages.collections;

function countLabel(count: number): string {
    if (count === 0) return t.noItem;
    if (count === 1) return t.singleItem;
    return t.itemCount.replace("{count}", String(count));
}

export default async function CollectionsPage(): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();
    const collections = await listCollectionsForVendor(prisma, vendor.id);

    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <div className="flex items-baseline justify-between gap-6">
                <h1 className="font-titre text-4xl leading-tight tracking-tight">{t.title}</h1>
                <Link href="/collections/new" className="text-sm underline">
                    {t.create}
                </Link>
            </div>

            {collections.length === 0 ? (
                <p className="mt-12 text-sm text-muet">{t.empty}</p>
            ) : (
                <ul className="mt-12 flex flex-col">
                    {collections.map((collection) => (
                        <li key={collection.id} className="border-t border-bordure py-4">
                            <Link
                                href={`/collections/${collection.id}`}
                                className="flex justify-between gap-6"
                            >
                                <span>{collection.title}</span>
                                <span className="text-sm text-muet">
                                    {countLabel(collection._count.items)}
                                </span>
                            </Link>
                            <p className="mt-1 text-xs text-muet">{t[collection.status]}</p>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
