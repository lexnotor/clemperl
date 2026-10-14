import { listShopsForAdministration, prisma } from "@clemperl/db";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import type { JSX } from "react";
import { requireAdministrator } from "../../lib/session";
import { SuspensionForm } from "./suspension-form";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long" });

// Ce que la ligne annonce, en une phrase. Trois états à dire, pas deux :
//
// active ; suspendue par quelqu'un qu'on sait nommer ; suspendue sans qu'on puisse le
// nommer. Le troisième arrive de deux façons différentes, et toutes deux sont réelles : le
// compte qui a suspendu a été supprimé, et le `SetNull` de la relation a effacé le lien sans
// lever la suspension ; ou ce compte existe mais n'a pas de nom, `User.name` étant nullable.
// Dans les deux cas la boutique est bien suspendue, et c'est ce qui compte.
function etatDe(shop: {
    suspendedAt: Date | null;
    suspendedBy: { name: string | null } | null;
}): string {
    if (shop.suspendedAt === null) {
        return messages.shops.active;
    }

    const quand = DATE.format(shop.suspendedAt);
    const nom = shop.suspendedBy?.name;
    return nom === null || nom === undefined
        ? `${messages.shops.suspendedByUnknown} · ${quand}`
        : `${messages.shops.suspendedBy.replace("{name}", nom)} · ${quand}`;
}

export default async function ShopsPage(): Promise<JSX.Element> {
    await requireAdministrator();
    const t = messages.shops;
    const shops = await listShopsForAdministration(prisma);

    return (
        <main className="mx-auto max-w-3xl px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{t.title}</h1>

            {shops.length === 0 ? (
                <p className="mt-8 border-t border-bordure pt-8 text-base text-muet">{t.empty}</p>
            ) : (
                <ul className="mt-8 border-t border-bordure">
                    {shops.map((shop) => (
                        <li
                            key={shop.id}
                            className="flex items-center justify-between gap-6 border-b border-bordure py-5"
                        >
                            <div className="flex flex-col gap-1">
                                <span className="font-titre text-lg">{shop.shopName}</span>
                                <span data-testid="etat" className="text-sm text-muet">
                                    {etatDe(shop)}
                                </span>
                            </div>
                            <SuspensionForm
                                vendorId={shop.id}
                                suspended={shop.suspendedAt !== null}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
