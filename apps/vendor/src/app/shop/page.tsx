import { countProductsForVendor, prisma } from "@clemperl/db";
import { offerablePaymentMethods } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { FormSection } from "@clemperl/ui";
import type { JSX } from "react";
import { ShopOffline } from "../components/shop-offline";
import { requireVendorMembership } from "../../lib/session";
import { ShopForm } from "./shop-form";

// Cette page lit la session : elle ne peut pas être pré-rendue au build. Sans
// `force-dynamic`, Next sert un rendu figé, et un utilisateur qui vient de se
// déconnecter continue d'y voir ses données.
export const dynamic = "force-dynamic";

const t = messages.shop;

export default async function ShopPage(): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();

    // Le verrou se lit ici et non dans le composant : c'est la base qui refuse, et
    // l'écran ne fait que ne pas proposer ce qui sera refusé.
    const productCount = await countProductsForVendor(prisma, vendor.id);

    // Les cases viennent du DOMAINE, pas de l'enum : une méthode en ligne n'existe que si un
    // adapter la sert, et cocher ce que la plateforme ne sait pas servir mène l'acheteur
    // devant un bouton « Payer » que l'API refuse. La lecture se fait ICI, à l'exécution et
    // côté serveur : la variable n'est pas publique, et un composant client ne la verrait pas.
    // Ce que la boutique accepte déjà reste offert, sinon l'enregistrement le retirerait de
    // la base sans que personne ne l'ait décidé.
    const paymentChoices = offerablePaymentMethods(process.env, vendor.paymentMethods);

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
            <ShopOffline suspended={vendor.suspendedAt !== null} />
            <h1 className="font-titre text-4xl leading-tight tracking-tight">{vendor.shopName}</h1>

            <ShopForm
                shopName={vendor.shopName}
                shopDescription={vendor.shopDescription}
                contactEmail={vendor.contactEmail}
                contactPhone={vendor.contactPhone}
                categories={vendor.categories}
                currency={vendor.currency}
                currencyLocked={productCount > 0}
                paymentMethods={vendor.paymentMethods}
                paymentChoices={paymentChoices}
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
