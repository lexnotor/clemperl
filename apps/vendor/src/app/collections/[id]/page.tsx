import { listProductsForVendor, prisma, readCollectionForVendor } from "@clemperl/db";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { requireVendorMembership } from "../../../lib/session";
import { toggleCollectionStatus } from "./actions";
import { CollectionItems } from "./collection-items";

// Cette page lit la session : elle ne peut pas être pré-rendue au build.
export const dynamic = "force-dynamic";

const t = messages.collections;
const STOREFRONT = process.env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "";

export default async function CollectionPage({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();
    const { id } = await params;

    const collection = await readCollectionForVendor(prisma, {
        collectionId: id,
        vendorId: vendor.id,
    });
    if (!collection) {
        notFound();
    }

    // Les produits qu'on peut encore ranger : ceux du vendeur, moins ceux déjà là.
    const ranges = new Set(collection.items.map((item) => item.productId));
    const available = (await listProductsForVendor(prisma, vendor.id))
        .filter((product) => !ranges.has(product.id))
        .map((product) => ({ id: product.id, title: product.title }));

    const published = collection.status === "PUBLISHED";

    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <div className="flex items-baseline justify-between gap-6">
                <h1 className="font-titre text-4xl leading-tight tracking-tight">
                    {collection.title}
                </h1>
                <span className="text-sm text-muet">{t[collection.status]}</span>
            </div>

            {collection.description !== null && (
                <p className="mt-4 text-base text-muet">{collection.description}</p>
            )}

            <CollectionItems
                collectionId={collection.id}
                items={collection.items}
                available={available}
            />

            <div className="mt-12 flex items-baseline gap-6 border-t border-bordure pt-8">
                <form action={toggleCollectionStatus}>
                    <input type="hidden" name="collectionId" value={collection.id} />
                    <input type="hidden" name="publish" value={published ? "0" : "1"} />
                    <button type="submit" className="text-sm underline">
                        {published ? t.unpublish : t.publish}
                    </button>
                </form>

                {published && (
                    // La page publique vit sur une AUTRE origine : un lien ordinaire, pas
                    // le routeur de Next, qui ne navigue qu'à l'intérieur de l'application.
                    <a
                        href={`${STOREFRONT}/shops/${vendor.slug}/collections/${collection.slug}`}
                        className="text-sm text-muet underline"
                    >
                        {t.publicLink}
                    </a>
                )}
            </div>
        </main>
    );
}
