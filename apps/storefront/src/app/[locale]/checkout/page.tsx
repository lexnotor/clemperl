import { prisma, readCart } from "@clemperl/db";
import { formatPrice, groupByShop, sumLines } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { JSX } from "react";
import { requireVerifiedSession } from "../../../lib/session";
import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
    const { locale } = await params;
    const session = await requireVerifiedSession("/checkout");
    const t = await getTranslations("orders");

    const cart = await readCart(prisma, session.user.id);
    // Un panier vide n'a rien à valider : on renvoie là où l'acheteur peut agir, plutôt
    // que de rendre un formulaire qui échouera à la soumission.
    if (!cart || cart.lines.length === 0) {
        redirect("/cart");
    }

    const total = sumLines(cart.lines);
    const shops = groupByShop(cart.lines).map((group) => ({
        slug: group.shopSlug,
        name: group.lines[0]?.shopName ?? group.shopSlug,
    }));

    return (
        <main className="mx-auto w-full max-w-2xl px-6 py-16">
            <h1 className="font-titre text-4xl tracking-tight">{t("confirm")}</h1>
            <CheckoutForm
                expectedTotal={total}
                total={formatPrice(total, cart.currency as never, locale)}
                shops={shops}
                labels={{
                    shipTo: t("shipTo"),
                    shipToName: t("shipToName"),
                    shipToPhone: t("shipToPhone"),
                    shipToLine: t("shipToLine"),
                    shipToCity: t("shipToCity"),
                    shipToCountry: t("shipToCountry"),
                    noteToShop: t("noteToShop", { shop: "{shop}" }),
                    noteHint: t("noteHint"),
                    confirm: t("confirm"),
                }}
                errors={{
                    invalid: t("invalid"),
                    totalChanged: t("totalChanged"),
                    itemUnavailable: t("itemUnavailable"),
                    cartEmpty: t("cartEmpty"),
                }}
            />
        </main>
    );
}
