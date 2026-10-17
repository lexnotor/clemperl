import type { PrismaClient } from "../../generated/prisma/client.js";
import { isUniqueViolation } from "../prisma-errors.js";

export const ERROR_ACCOUNT_NOT_FOUND = "ACCOUNT_NOT_FOUND";
export const ERROR_ACCOUNT_EMAIL_TAKEN = "ACCOUNT_EMAIL_TAKEN";
export const ERROR_LAST_SUPER_ADMIN = "LAST_SUPER_ADMIN";

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

// Une clé constante, et un verrou consultatif de TRANSACTION. L'invariant porte sur un
// NOMBRE, pas sur une ligne : deux retraits visent deux lignes différentes, donc un verrou
// sur la ligne visée ne protège rien, et verrouiller « l'ensemble des super_admin » ferait
// dépendre la portée du verrou d'une requête dont le résultat change entre les deux
// transactions.
//
// Une condition d'écriture ne suffit pas non plus. `UPDATE ... WHERE (SELECT count(*) ...) > 1`
// évalue sa sous-requête sur l'instantané de SON instruction : en `READ COMMITTED`, les
// deux transactions y lisent deux, aucune ne bloque sur la ligne de l'autre, et les deux
// réussissent. C'est exactement le trou qu'on ferme.
//
// Les changements de rôle sont rares : les sérialiser tous entre eux ne coûte rien.
const PLATFORM_ROLES_LOCK = 611_200_001;

export interface IAdministrationAccount {
    id: string;
    email: string;
    name: string | null;
    role: string;
    pending: boolean;
}

/**
 * Les comptes d'administration actifs, avec leur état d'invitation.
 *
 * `pending` se dérive de l'absence de TOUTE ligne `Account`, pas de l'absence de mot de
 * passe : un compte Google porte une ligne sans mot de passe, et le confondre avec une
 * invitation lui enverrait un courriel d'accueil le jour où il demande une réinitialisation.
 */
export async function listAdministrationAccounts(
    prisma: PrismaClient,
): Promise<IAdministrationAccount[]> {
    const users = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, deletedAt: null },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            _count: { select: { accounts: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        pending: user._count.accounts === 0,
    }));
}

/**
 * Crée un compte d'administration sans aucun justificatif : la personne définit son mot de
 * passe par le lien de réinitialisation. L'adresse est tenue pour vérifiée, comme celle de
 * l'amorçage, puisque c'est ce lien qui la prouve.
 */
export async function createInvitedAdministrator(
    prisma: PrismaClient,
    input: { email: string; name: string; role: "ADMIN" | "SUPER_ADMIN" },
): Promise<{ id: string }> {
    try {
        const user = await prisma.user.create({
            data: {
                email: input.email,
                name: input.name,
                role: input.role,
                emailVerified: true,
            },
            select: { id: true },
        });
        return { id: user.id };
    } catch (error) {
        if (isUniqueViolation(error)) throw new Error(ERROR_ACCOUNT_EMAIL_TAKEN);
        throw error;
    }
}

/**
 * Change le rôle de plateforme d'un compte et rend le rôle qu'il portait avant.
 *
 * Deux retraits simultanés du même compte aboutissent tous deux à l'état visé sans lever :
 * seul `previousRole` dit lequel a réellement retiré.
 */
export async function setPlatformRole(
    prisma: PrismaClient,
    input: { userId: string; role: "CUSTOMER" | "ADMIN" | "SUPER_ADMIN" },
): Promise<{ previousRole: string }> {
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PLATFORM_ROLES_LOCK}::bigint)`;

        const current = await tx.user.findUnique({
            where: { id: input.userId },
            select: { role: true },
        });
        if (!current) throw new Error(ERROR_ACCOUNT_NOT_FOUND);

        if (current.role === "SUPER_ADMIN" && input.role !== "SUPER_ADMIN") {
            const remaining = await tx.user.count({
                where: { role: "SUPER_ADMIN", deletedAt: null },
            });
            if (remaining <= 1) throw new Error(ERROR_LAST_SUPER_ADMIN);
        }

        await tx.user.update({ where: { id: input.userId }, data: { role: input.role } });
        return { previousRole: current.role };
    });
}

/**
 * Vrai tant que le compte n'a aucune ligne `Account`. C'est la même condition que la colonne
 * `pending` de la liste, pour que la liste et le choix du courriel disent la même chose.
 */
export async function isAwaitingFirstPassword(
    prisma: PrismaClient,
    userId: string,
): Promise<boolean> {
    const accounts = await prisma.account.count({ where: { userId } });
    return accounts === 0;
}
