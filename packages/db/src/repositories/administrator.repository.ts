import type { PrismaClient } from "../../generated/prisma/client.js";

/**
 * Le nombre de comptes d'administration actifs, tous niveaux confondus.
 *
 * Les DEUX rôles comptent. Compter les seuls `ADMIN` rendrait zéro sur une base qui ne porte
 * qu'un `SUPER_ADMIN`, donc rouvrirait l'amorçage sur l'état que l'amorçage produit
 * lui-même : la plateforme se réinstallerait par-dessus son propre propriétaire.
 */
export async function countAdministrators(prisma: PrismaClient): Promise<number> {
    return prisma.user.count({
        where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, deletedAt: null },
    });
}
