"use server";

import { prisma, readCollectionForVendor, setCollectionItems, setCollectionStatus } from "@clemperl/db";
import { moveItem } from "@clemperl/domain";
import { revalidatePath } from "next/cache";
import { requireVendorMembership } from "../../../lib/session";

// Les quatre actions lisent l'ordre courant, le modifient, et le réécrivent en entier.
// Aucune ne fait d'affichage optimiste : l'ordre EST la donnée, et une liste qui
// anticiperait l'écriture mentirait si elle échouait.
//
// Aucune ne rend d'état non plus. Publier une collection n'a aucune précondition,
// contrairement à un produit qui exige une photo prête : il n'y a rien à dire au vendeur
// qu'un rechargement de la page ne dise mieux.

async function currentOrder(collectionId: string, vendorId: string): Promise<string[] | null> {
    // La garde est rappelée ICI, et l'appartenance avec elle : une action serveur est une
    // route publique, et `collectionId` arrive d'un champ caché que n'importe qui peut
    // réécrire.
    const collection = await readCollectionForVendor(prisma, { collectionId, vendorId });
    return collection?.items.map((item) => item.productId) ?? null;
}

export async function moveCollectionItem(form: FormData): Promise<void> {
    const { vendor } = await requireVendorMembership();
    const collectionId = String(form.get("collectionId") ?? "");
    const productId = String(form.get("productId") ?? "");
    const direction = form.get("direction") === "up" ? "up" : "down";

    const order = await currentOrder(collectionId, vendor.id);
    if (order === null) {
        return;
    }

    await setCollectionItems(prisma, {
        collectionId,
        vendorId: vendor.id,
        productIds: moveItem(
            order.map((id) => ({ id })),
            productId,
            direction,
        ).map((item) => item.id),
    });
    revalidatePath(`/collections/${collectionId}`);
}

export async function removeCollectionItem(form: FormData): Promise<void> {
    const { vendor } = await requireVendorMembership();
    const collectionId = String(form.get("collectionId") ?? "");
    const productId = String(form.get("productId") ?? "");

    const order = await currentOrder(collectionId, vendor.id);
    if (order === null) {
        return;
    }

    await setCollectionItems(prisma, {
        collectionId,
        vendorId: vendor.id,
        productIds: order.filter((id) => id !== productId),
    });
    revalidatePath(`/collections/${collectionId}`);
}

export async function addCollectionItem(form: FormData): Promise<void> {
    const { vendor } = await requireVendorMembership();
    const collectionId = String(form.get("collectionId") ?? "");
    const productId = String(form.get("productId") ?? "");

    const order = await currentOrder(collectionId, vendor.id);
    if (order === null || productId === "" || order.includes(productId)) {
        return;
    }

    // Le nouvel article va en QUEUE : il n'y a aucune raison de deviner que le vendeur le
    // veut en tête, et il peut le remonter d'un clic.
    await setCollectionItems(prisma, {
        collectionId,
        vendorId: vendor.id,
        productIds: [...order, productId],
    });
    revalidatePath(`/collections/${collectionId}`);
}

export async function toggleCollectionStatus(form: FormData): Promise<void> {
    const { vendor } = await requireVendorMembership();
    const collectionId = String(form.get("collectionId") ?? "");

    await setCollectionStatus(prisma, {
        collectionId,
        vendorId: vendor.id,
        publish: form.get("publish") === "1",
    });
    revalidatePath(`/collections/${collectionId}`);
    revalidatePath("/collections");
}
