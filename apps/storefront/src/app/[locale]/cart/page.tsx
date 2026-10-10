import { auth } from "@clemperl/auth";
import { prisma, readCart } from "@clemperl/db";
import { formatPrice, groupByShop, sumLines, variantLabel } from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import type { JSX } from "react";
import { CartLines } from "./components/cart-lines";
import { LocalCartNotice } from "./components/local-cart-notice";
import { LocalCartSync } from "./components/local-cart-sync";

// Personnelle par construction : elle dépend de la session et du panier.
export const dynamic = "force-dynamic";

export default async function CartPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
    const { locale } = await params;
    const t = await getTranslations("cart");
    const session = await auth.api.getSession({ headers: await headers() });

    // La page n'EXIGE pas la session : un panier se remplit avant d'avoir un compte, et
    // renvoyer vers la connexion ferait croire que l'article est perdu.
    //
    // Sans session, le serveur ne sait RIEN du panier, qui vit dans le navigateur : c'est
    // `LocalCartNotice` qui dit alors ce qu'il contient, et lui seul peut le savoir.
    const cart = session?.user ? await readCart(prisma, session.user.id) : null;
    const groups = groupByShop(cart?.lines ?? []);
    const currency = cart?.currency ?? "";

    // TOUS les prix sont formatés ICI. `formatPrice` tire `@clemperl/core`, donc
    // nodemailer, donc `node:net` : un composant client qui l'importerait ferait entrer
    // tout cela dans le paquet navigateur.
    const sections = groups.map((group) => ({
        shopSlug: group.shopSlug,
        shopName: group.lines[0]?.shopName ?? "",
        subtotal: formatPrice(sumLines(group.lines), currency as never, locale),
        lines: group.lines.map((line) => ({
            variantId: line.variantId,
            productTitle: line.productTitle,
            productSlug: line.productSlug,
            shopSlug: line.shopSlug,
            variantLabel: variantLabel(line.optionValues),
            quantity: line.quantity,
            unitPrice: formatPrice(line.unitAmount, currency as never, locale),
            linePrice: formatPrice(line.unitAmount * line.quantity, currency as never, locale),
        })),
    }));
    const total = sumLines(cart?.lines ?? []);

    return (
        <main className="mx-auto w-full max-w-4xl px-6 py-16">
            <h1 className="font-titre text-4xl tracking-tight">{t("title")}</h1>

            <LocalCartSync
                signedIn={session?.user !== undefined}
                labels={{
                    rejected: t("rejected"),
                    reason: {
                        ineligible: t("rejection.ineligible"),
                        currency: t("rejection.currency"),
                        // Née de la garde de quantité : un article écarté pour une
                        // quantité illisible n'est pas « plus disponible », et le dire
                        // enverrait l'acheteur chercher un défaut du catalogue.
                        quantity: t("rejection.quantity"),
                    },
                }}
            />

            {session?.user === undefined ? (
                <LocalCartNotice
                    labels={{
                        // `t.raw` et non `t` : ces deux messages portent un paramètre
                        // `{count}` que SEUL le client connaît, puisqu'il vient de
                        // `localStorage`. `t` exige la valeur et rend la clé elle-même
                        // quand elle manque, ce qui affiche « cart.localOne » à l'écran.
                        one: t.raw("localOne"),
                        many: t.raw("localMany"),
                        empty: t("empty"),
                        signInToOrder: t("signInToOrder"),
                    }}
                />
            ) : sections.length === 0 ? (
                <p className="mt-8 text-sm text-muet">{t("empty")}</p>
            ) : (
                <CartLines
                    sections={sections}
                    total={formatPrice(total, currency as never, locale)}
                    signedIn={session?.user !== undefined}
                    labels={{
                        quantity: t("quantity"),
                        remove: t("remove"),
                        subtotal: t("subtotal"),
                        total: t("total"),
                        checkout: t("checkout"),
                        signInToOrder: t("signInToOrder"),
                    }}
                />
            )}
        </main>
    );
}
