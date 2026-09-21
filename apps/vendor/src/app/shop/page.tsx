import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { FormSection } from "@clemperl/ui";
import type { JSX } from "react";
import { requireVendorMembership } from "../../lib/session";
import { ShopForm } from "./shop-form";

// Cette page lit la session : elle ne peut pas être pré-rendue au build. Sans
// `force-dynamic`, Next sert un rendu figé, et un utilisateur qui vient de se
// déconnecter continue d'y voir ses données.
export const dynamic = "force-dynamic";

const t = messages.shop;

export default async function ShopPage(): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();

    // Des tuples DÉCLARÉS, pas un tableau de tableaux : `noUncheckedIndexedAccess` est
    // activé dans `packages/tsconfig/base.json`, et une cellule lue par indice y vaut
    // `string | undefined`.
    const legalRows: readonly (readonly [string, string])[] = [
        [t.legalForm, vendor.legalForm],
        [t.legalName, vendor.legalName],
        [t.registrationNumber, vendor.registrationNumber],
        [t.taxNumber, vendor.taxNumber ?? t.notProvided],
        [t.country, vendor.country],
    ];

    return (
        <main className="mx-auto max-w-2xl px-6 py-16">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">{vendor.shopName}</h1>

            <ShopForm
                shopName={vendor.shopName}
                shopDescription={vendor.shopDescription}
                contactEmail={vendor.contactEmail}
                contactPhone={vendor.contactPhone}
                categories={vendor.categories}
            />

            <div className="mt-12">
                <FormSection title={t.legalSection}>
                    <p className="text-sm text-muet">{t.legalNotice}</p>
                    <dl className="flex flex-col gap-3 text-sm">
                        {legalRows.map(([label, value]) => (
                            <div key={label} className="flex justify-between gap-6">
                                <dt className="text-muet">{label}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </FormSection>
            </div>
        </main>
    );
}
