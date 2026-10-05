import type { PrismaClient } from "../../generated/prisma/client.js";
import { isUniqueViolation } from "../prisma-errors.js";

export interface ICreateCollection {
    vendorId: string;
    /** Dérivé du titre par l'appelant, comme pour un produit. */
    slug: string;
    title: string;
    description?: string;
}

// Des erreurs NOMMÉES plutôt qu'un message de base relu à l'autre bout. C'est la forme
// que `product.repository.ts` emploie déjà pour le slug déjà pris, et elle survit à une
// reformulation de Prisma.
export const ERROR_COLLECTION_NOT_FOUND = "COLLECTION_NOT_FOUND";
export const ERROR_COLLECTION_FOREIGN_PRODUCT = "COLLECTION_FOREIGN_PRODUCT";
export const ERROR_COLLECTION_SLUG_TAKEN = "COLLECTION_SLUG_TAKEN";

export interface ISetCollectionItems {
    collectionId: string;
    /** La boutique de l'appelant. Tout article doit lui appartenir. */
    vendorId: string;
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
// TOUTE fonction porte `vendorId` et filtre par la boutique. C'est la règle que T2c a
// écrite en tête de `product-image.repository.ts`, et elle vaut ici pour la même raison :
// `collectionId` et `productIds` viennent du formulaire, donc du client. La garantie est
// dans la SIGNATURE, pas dans une vérification à l'entrée que le prochain appelant
// oubliera.
//
// Sans elle, un vendeur range le produit d'une autre boutique dans sa collection. Il lui
// suffit de lire un identifiant de produit dans l'URL d'une vignette du catalogue public,
// où il figure en clair. Rien ne fuit publiquement, parce que la page publique passe aussi
// `shopSlug` à la requête du catalogue, mais la relation est écrite en base et l'écran
// vendeur affiche le titre et l'état de publication du produit d'autrui.
//
// La vérification vit DANS la transaction, comme `reorderImages` : lue avant, elle
// jugerait un état que l'écriture ne retrouve pas.
export interface IRenameCollection {
    collectionId: string;
    vendorId: string;
    title: string;
    description: string;
    /** Le slug dérivé du nouveau titre. Le dépôt décide s'il l'applique. */
    slug: string;
}

// Le slug SUIT le titre tant que la collection n'a jamais été publiée, puis il se fige.
// C'est la règle de `saveProduct`, et pour la même raison : après la première publication
// il est parti dans une URL publique, et une URL qui bouge est une URL cassée. C'est le
// dépôt qui tranche, parce que c'est lui qui connaît cette date.
//
// Sans renommage, un vendeur qui écrivait « Soldes d ete » gardait la faute, et le slug
// fautif restait occupé puisqu'il n'existe pas de suppression.
export async function renameCollection(
    prisma: PrismaClient,
    input: IRenameCollection,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const collection = await tx.collection.findFirst({
            where: { id: input.collectionId, vendorId: input.vendorId, deletedAt: null },
            select: { id: true, publishedAt: true },
        });
        if (!collection) {
            throw new Error(ERROR_COLLECTION_NOT_FOUND);
        }

        try {
            await tx.collection.update({
                where: { id: collection.id },
                data: {
                    title: input.title,
                    description: input.description === "" ? null : input.description,
                    ...(collection.publishedAt === null ? { slug: input.slug } : {}),
                },
            });
        } catch (error) {
            // Deux collections d'une même boutique ne peuvent pas porter le même slug.
            // Le distinguer permet de dire au vendeur de changer son titre plutôt que de
            // lui montrer une panne, et de lui éviter de reproduire le même refus.
            if (isUniqueViolation(error)) {
                throw new Error(ERROR_COLLECTION_SLUG_TAKEN, { cause: error });
            }
            throw error;
        }
    });
}

export async function setCollectionItems(
    prisma: PrismaClient,
    input: ISetCollectionItems,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const collection = await tx.collection.findFirst({
            where: { id: input.collectionId, vendorId: input.vendorId, deletedAt: null },
            select: { id: true },
        });
        if (!collection) {
            throw new Error(ERROR_COLLECTION_NOT_FOUND);
        }

        // Le compte, et non une lecture ligne à ligne : un identifiant répété ou inconnu
        // fait chuter le compte, donc le même refus les couvre tous les trois.
        const siens = await tx.product.count({
            where: {
                id: { in: [...input.productIds] },
                vendorId: input.vendorId,
                deletedAt: null,
            },
        });
        if (siens !== new Set(input.productIds).size) {
            throw new Error(ERROR_COLLECTION_FOREIGN_PRODUCT);
        }

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
