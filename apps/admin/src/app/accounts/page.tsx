import { listAdministrationAccounts, prisma } from "@clemperl/db";
import { canAppoint, canRemove } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import type { JSX } from "react";
import { requireAdministrator } from "../../lib/session";
import { AccountRow } from "./account-row";
import { InvitationForm } from "./invitation-form";

export const dynamic = "force-dynamic";

const LEVELS = ["ADMIN", "SUPER_ADMIN"] as const;

export default async function AccountsPage(): Promise<JSX.Element> {
    const session = await requireAdministrator();
    const t = messages.accounts;
    const roles = t.role as Record<string, string>;
    const actorRole = session.user.role;
    const accounts = await listAdministrationAccounts(prisma);

    // Le SERVEUR décide ce que chaque ligne permet, et passe des booléens : les composants
    // client n'importent pas le domaine, dont le barillet tire `@clemperl/core` dans le
    // paquet navigateur. Une action non permise n'est pas rendue.
    const levels = LEVELS.filter((level) => canAppoint(actorRole, level)).map((value) => ({
        value,
        label: roles[value] ?? value,
    }));

    // Le dernier super_admin UTILISABLE ne se retire pas, et l'écran ne propose pas ce
    // qu'il sait refusé. Une invitation en attente ne compte pas : personne ne peut s'y
    // connecter. Ce n'est qu'un affichage : le refus qui compte est celui du dépôt, sous
    // verrou, quand deux retraits se croisent.
    const usableSuperAdmins = (excluded: string) =>
        accounts.filter(
            (account) =>
                account.role === "SUPER_ADMIN" && !account.pending && account.id !== excluded,
        ).length;

    return (
        <main className="mx-auto max-w-3xl px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{t.title}</h1>

            <section className="mt-8 border-t border-bordure pt-8">
                <h2 className="font-titre text-xl">{t.invite}</h2>
                <InvitationForm
                    levels={levels}
                    labels={{
                        name: t.name,
                        email: t.email,
                        level: t.level,
                        levelPlaceholder: t.levelPlaceholder,
                        submit: t.submit,
                    }}
                />
            </section>

            {accounts.length === 0 ? (
                <p className="mt-8 border-t border-bordure pt-8 text-base text-muet">{t.empty}</p>
            ) : (
                <ul className="mt-8 border-t border-bordure">
                    {accounts.map((account) => (
                        <AccountRow
                            key={account.id}
                            userId={account.id}
                            name={account.name ?? t.unnamed}
                            email={account.email}
                            roleLabel={roles[account.role] ?? account.role}
                            pending={account.pending}
                            canRemove={
                                canRemove(actorRole, account.role) &&
                                !(account.role === "SUPER_ADMIN" && usableSuperAdmins(account.id) < 1)
                            }
                            canResend={account.pending}
                            canPromote={
                                account.role === "ADMIN" && canAppoint(actorRole, "SUPER_ADMIN")
                            }
                            labels={{
                                pending: t.pending,
                                remove: t.remove,
                                resend: t.resend,
                                promote: t.promote,
                            }}
                        />
                    ))}
                </ul>
            )}
        </main>
    );
}
