import type { PrismaClient } from "../../generated/prisma/client.js";

export interface ICreateCollection {
    vendorId: string;
    /** Dérivé du titre par l'appelant, comme pour un produit. */
    slug: string;
    title: string;
    description?: string;
}

export interface ISetCollectionItems {
    collectionId: string;
    /** L'ordre VOULU, du premier au dernier. Les positions en découlent. */
    productIds: readonly string[];
}

export function listCollectionsForVendor(prisma: PrismaClient, vendorId: string) {
    return prisma.collection.findMany({
        where: { vendorId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { items: true } } },
    });
}

export function readCollectionForVendor(
    prisma: PrismaClient,
    input: { collectionId: string; vendorId: string },
) {
    return prisma.collection.findFirst({
        where: { id: input.collectionId, vendorId: input.vendorId, deletedAt: null },
        include: {
            items: {
                // Le départage par `id` n'est pas décoratif : deux positions égales ne
                // devraient pas exister, mais un tri non déterministe ferait sauter une
                // ligne d'un affichage à l'autre sans rien signaler.
                orderBy: [{ position: "asc" }, { id: "asc" }],
                include: {
                    product: {
                        select: { id: true, title: true, slug: true, status: true },
                    },
                },
            },
        },
    });
}

export async function createCollection(
    prisma: PrismaClient,
    input: ICreateCollection,
): Promise<{ id: string }> {
    const created = await prisma.collection.create({
        data: {
            vendorId: input.vendorId,
            slug: input.slug,
            title: input.title,
            description: input.description ?? null,
        },
        select: { id: true },
    });
    return created;
}

// Tout l'ordre est réécrit, pas seulement les lignes qui bougent. C'est ce qui rend
// l'échange de deux rangs possible sans contrainte d'unicité sur `position` : PostgreSQL
// vérifie une contrainte à chaque INSTRUCTION, donc la première écriture d'un échange la
// violerait avant que la seconde ne la rétablisse.
//
// C'est aussi ce qui referme les trous laissés par un retrait. Une collection est un choix
// humain, donc une poignée de lignes : le jour où elle est longue, la sortie est un pas
// d'incrément et des positions espacées.
export async function setCollectionItems(
    prisma: PrismaClient,
    input: ISetCollectionItems,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        await tx.collectionItem.deleteMany({ where: { collectionId: input.collectionId } });
        await tx.collectionItem.createMany({
            data: input.productIds.map((productId, position) => ({
                collectionId: input.collectionId,
                productId,
                position,
            })),
        });
    });
}

export async function setCollectionStatus(
    prisma: PrismaClient,
    input: { collectionId: string; vendorId: string; publish: boolean },
): Promise<void> {
    // `updateMany` conditionné sur la boutique : une collection étrangère n'est pas
    // refusée bruyamment, elle n'est simplement pas touchée. Même forme que pour un
    // produit, et même raison.
    await prisma.collection.updateMany({
        where: { id: input.collectionId, vendorId: input.vendorId, deletedAt: null },
        data: {
            status: input.publish ? "PUBLISHED" : "DRAFT",
            // `publishedAt` ne se remet jamais à zéro : il date le moment où le slug a
            // cessé de pouvoir bouger.
            ...(input.publish ? { publishedAt: new Date() } : {}),
        },
    });
}

// Les collections qu'un visiteur peut voir sur la vitrine d'une boutique. Elle est
// désignée par son SLUG et non par son identifiant : la forme publique d'une boutique
// n'expose pas d'`id`, et l'élargir pour cette seule lecture ferait fuiter une clé
// interne dans toutes les pages qui la rendent.
//
// Une collection vide reste listée : son existence est une information, et c'est le
// vendeur qui décide quand il la publie.
export function listPublishedCollections(prisma: PrismaClient, shopSlug: string) {
    return prisma.collection.findMany({
        where: {
            deletedAt: null,
            status: "PUBLISHED",
            vendor: { slug: shopSlug, deletedAt: null },
        },
        orderBy: { publishedAt: "desc" },
        select: { id: true, slug: true, title: true },
    });
}

// Rend la collection publiée d'une boutique, ou `null`. Elle ne porte PAS ses articles :
// la liste vient de la requête du catalogue, qui seule connaît les conditions
// d'éligibilité, et les recopier ici créerait une seconde vérité.
export function readPublishedCollection(
    prisma: PrismaClient,
    input: { shopSlug: string; slug: string },
) {
    return prisma.collection.findFirst({
        where: {
            slug: input.slug,
            status: "PUBLISHED",
            deletedAt: null,
            vendor: { slug: input.shopSlug, deletedAt: null },
        },
        select: { id: true, slug: true, title: true, description: true },
    });
}
