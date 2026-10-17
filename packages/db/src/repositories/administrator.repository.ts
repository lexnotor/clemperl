import type { PrismaClient } from "../../generated/prisma/client.js";
import { isUniqueViolation } from "../prisma-errors.js";

export const ERROR_ACCOUNT_NOT_FOUND = "ACCOUNT_NOT_FOUND";
export const ERROR_ACCOUNT_EMAIL_TAKEN = "ACCOUNT_EMAIL_TAKEN";
export const ERROR_LAST_SUPER_ADMIN = "LAST_SUPER_ADMIN";
export const ERROR_ACCOUNT_ROLE_CHANGED = "ACCOUNT_ROLE_CHANGED";

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
        if (isUniqueViolation(error)) throw new Error(ERROR_ACCOUNT_EMAIL_TAKEN, { cause: error });
        throw error;
    }
}

/**
 * Change le rôle de plateforme d'un compte et rend le rôle qu'il portait avant.
 *
 * Un compte déjà au rôle visé rend un succès sans écriture. Un compte qui ne porte plus le
 * rôle que l'appelant a lu est refusé avec `ERROR_ACCOUNT_ROLE_CHANGED`.
 *
 * `previousRole` ne distingue donc plus une écriture d'un succès sans écriture, et rien ne
 * le lit aujourd'hui : un appelant ne doit pas s'en servir pour savoir s'il a agi.
 */
export async function setPlatformRole(
    prisma: PrismaClient,
    input: {
        userId: string;
        role: "CUSTOMER" | "ADMIN" | "SUPER_ADMIN";
        expectedRole: string;
    },
): Promise<{ previousRole: string }> {
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PLATFORM_ROLES_LOCK}::bigint)`;

        const current = await tx.user.findUnique({
            where: { id: input.userId },
            select: { role: true },
        });
        if (!current) throw new Error(ERROR_ACCOUNT_NOT_FOUND);

        // Deux contrôles, DANS CET ORDRE, et sous le verrou.
        //
        // D'abord « le compte est déjà là où on le veut » : c'est un succès sans écriture.
        // Deux retraits ou deux élévations simultanés du même compte atteignent l'état
        // visé, et le second n'a rien à se voir reprocher.
        if (current.role === input.role) return { previousRole: current.role };

        // Ensuite « le compte a bougé » : l'appelant a décidé d'après le rôle qu'il a LU, et
        // un compte retiré entre-temps deviendrait sinon super_admin par une élévation
        // décidée pour un administrateur. Inverser les deux contrôles refuserait un retrait
        // déjà fait, que l'on veut tenir pour réussi.
        if (current.role !== input.expectedRole) throw new Error(ERROR_ACCOUNT_ROLE_CHANGED);

        if (current.role === "SUPER_ADMIN" && input.role !== "SUPER_ADMIN") {
            // « Au moins un super_admin UTILISABLE, AUTRE que la cible, reste ». Une
            // invitation jamais honorée porte le rôle sans aucune ligne `Account` : personne
            // ne peut s'y connecter, et la compter laisserait le seul compte utilisable se
            // retirer. La cible est exclue : sans cela, retirer une invitation mal adressée
            // serait refusé dès qu'elle est la seule comptée.
            const remaining = await tx.user.count({
                where: {
                    role: "SUPER_ADMIN",
                    deletedAt: null,
                    id: { not: input.userId },
                    accounts: { some: {} },
                },
            });
            if (remaining < 1) throw new Error(ERROR_LAST_SUPER_ADMIN);
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
