"use server";

import { auth } from "@clemperl/auth";
import {
    createInvitedAdministrator,
    ERROR_ACCOUNT_EMAIL_TAKEN,
    ERROR_ACCOUNT_NOT_FOUND,
    ERROR_ACCOUNT_ROLE_CHANGED,
    ERROR_LAST_SUPER_ADMIN,
    isAwaitingFirstPassword,
    prisma,
    setPlatformRole,
} from "@clemperl/db";
import {
    administratorInvitationSchema,
    canAppoint,
    canRemove,
    isAdministrator,
} from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import { revalidatePath } from "next/cache";
import { requireAdministrator } from "../../lib/session";
import type { IAccountsState } from "./types/accounts-state.interface";

const ERRORS = messages.errors.accounts as Record<string, string>;

function refuse(key: string): IAccountsState {
    return { message: [ERRORS[key] ?? (ERRORS["failed"] as string)] };
}

// Le lien de choix du mot de passe part par la réinitialisation. L'appel est direct, SANS
// les en-têtes de la requête : c'est la forme de l'amorçage, et c'est celle dont le
// comportement a été mesuré. `redirectTo` reste relatif.
async function sendPasswordLink(email: string): Promise<void> {
    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
}

// La garde est rappelée ICI. Une action serveur est une route publique, et la page qui a
// rendu le formulaire ne la protège pas : un administrateur peut poster `SUPER_ADMIN` à la
// main.
export async function invite(
    _previous: IAccountsState,
    form: FormData,
): Promise<IAccountsState> {
    const session = await requireAdministrator();

    const parsed = administratorInvitationSchema.safeParse({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        role: String(form.get("role") ?? ""),
    });
    if (!parsed.success) {
        return refuse("invalid");
    }
    // Le domaine arbitre le niveau visé d'après le niveau de CELUI QUI NOMME.
    if (!canAppoint(session.user.role, parsed.data.role)) {
        return refuse("forbidden");
    }

    // L'adresse est écrite en minuscules : c'est la forme sous laquelle la
    // réinitialisation la cherche.
    const email = parsed.data.email.toLowerCase();

    try {
        await createInvitedAdministrator(prisma, {
            email,
            name: parsed.data.name,
            role: parsed.data.role,
        });
    } catch (error) {
        if (error instanceof Error && error.message === ERROR_ACCOUNT_EMAIL_TAKEN) {
            return refuse("email_taken");
        }
        console.error("invite", error);
        return refuse("failed");
    }

    revalidatePath("/accounts");

    // Le courriel part APRÈS la création et ne doit pas l'annuler : le compte existe, c'est
    // un fait. Faire échouer l'action pour une panne de relais ferait recommencer
    // l'administrateur, qui buterait sur l'unicité de l'adresse.
    try {
        await sendPasswordLink(email);
    } catch (error) {
        console.error("invite: courriel non parti", error);
        return refuse("mail_failed");
    }

    return { message: [messages.accounts.invited] };
}

// Une seule action pour les boutons de rôle. Le formulaire poste le rôle VISÉ : `CUSTOMER`
// est un retrait et passe par `canRemove`, `SUPER_ADMIN` est une élévation et passe par
// `canAppoint`. Rien d'autre ne se décide ici : nommer un `ADMIN` est le travail de
// `invite`, et l'accepter ici laisserait un administrateur rétrograder un super_admin.
export async function changeRole(
    _previous: IAccountsState,
    form: FormData,
): Promise<IAccountsState> {
    const session = await requireAdministrator();
    const userId = String(form.get("userId") ?? "");
    const role = String(form.get("role") ?? "");

    if (role !== "CUSTOMER" && role !== "SUPER_ADMIN") {
        return refuse("forbidden");
    }

    // Le rôle COURANT se lit avant de décider : `canRemove` juge ce qu'on retire, et un
    // identifiant inventé ou vide ne désigne personne.
    const target = userId === ""
        ? null
        : await prisma.user.findFirst({
              where: { id: userId, deletedAt: null },
              select: { role: true },
          });
    // Un compte qui n'est plus (ou n'a jamais été) un compte d'administration n'a rien à
    // retirer ni à élever ici : on le dit tel quel, on n'annonce pas un retrait.
    if (!target || !isAdministrator(target.role)) {
        return refuse("not_found");
    }

    const permitted =
        role === "CUSTOMER"
            ? canRemove(session.user.role, target.role)
            : canAppoint(session.user.role, role);
    if (!permitted) {
        return refuse("forbidden");
    }

    try {
        // Le rôle LU est passé comme rôle attendu : le dépôt le recompare sous verrou, et
        // refuse un compte qui a bougé entre la lecture et l'écriture.
        await setPlatformRole(prisma, { userId, role, expectedRole: target.role });
    } catch (error) {
        // Le dernier super_admin est refusé par le dépôt, sous verrou. On ne le devance pas
        // par un décompte ici : ce serait une lecture suivie d'une décision, qui se
        // croiserait avec un autre retrait.
        if (error instanceof Error) {
            if (error.message === ERROR_LAST_SUPER_ADMIN) return refuse("last_super_admin");
            if (error.message === ERROR_ACCOUNT_NOT_FOUND) return refuse("not_found");
            if (error.message === ERROR_ACCOUNT_ROLE_CHANGED) return refuse("role_changed");
        }
        console.error("changeRole", error);
        return refuse("failed");
    }

    revalidatePath("/accounts");
    return { message: [] };
}

export async function resendInvitation(
    _previous: IAccountsState,
    form: FormData,
): Promise<IAccountsState> {
    await requireAdministrator();
    const userId = String(form.get("userId") ?? "");

    const user = userId === ""
        ? null
        : await prisma.user.findFirst({
              where: { id: userId, deletedAt: null },
              select: { email: true, role: true },
          });
    if (!user || !isAdministrator(user.role)) {
        return refuse("not_found");
    }

    // Sans ce contrôle, l'action enverrait une réinitialisation de mot de passe à quelqu'un
    // qui n'a rien demandé : le bouton n'est rendu que pour une invitation en attente, mais
    // l'action est une route publique.
    if (!(await isAwaitingFirstPassword(prisma, userId))) {
        return refuse("not_pending");
    }

    try {
        await sendPasswordLink(user.email);
    } catch (error) {
        console.error("resendInvitation", error);
        return refuse("mail_failed");
    }

    revalidatePath("/accounts");
    return { message: [messages.accounts.resent] };
}
