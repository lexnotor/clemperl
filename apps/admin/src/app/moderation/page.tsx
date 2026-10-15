import { listProductsToModerate, prisma } from "@clemperl/db";
import { MODERATION_REASONS, derivativePath } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import type { JSX } from "react";
import { requireAdministrator } from "../../lib/session";
import { ModerationRow } from "./moderation-row";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long" });

// La route de relais vit sur la boutique, seule origine qui la porte. Même choix que la
// page des images du vendeur.
const STOREFRONT = process.env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "";

export default async function ModerationPage(): Promise<JSX.Element> {
    await requireAdministrator();
    const t = messages.moderation;
    const labels = messages.moderation.reason as Record<string, string>;
    const file = await listProductsToModerate(prisma);

    // Les motifs dérivent de l'ÉNUMÉRATION, pas du catalogue. Dans l'autre sens, ajouter
    // une valeur à `E_MODERATION_REASON` sans penser au catalogue la rendrait invisible et
    // inchoisissable, sans rien casser nulle part : le motif existerait en base et personne
    // ne pourrait le citer. Ici, un motif sans libellé s'affiche brut, donc se voit.
    const reasons = MODERATION_REASONS.map((value) => ({
        value,
        label: labels[value] ?? value,
    }));

    return (
        <main className="mx-auto max-w-3xl px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{t.title}</h1>

            {file.length === 0 ? (
                <p className="mt-8 border-t border-bordure pt-8 text-base text-muet">{t.empty}</p>
            ) : (
                <>
                    {/* Le COMPTE, parce que la file se vide : il dit où l'on en est, ce
                        qu'une liste sans total ne dit pas quand elle tient sur plusieurs
                        écrans. */}
                    <p data-testid="reste" className="mt-2 text-sm text-muet">
                        {t.remaining.replace("{count}", () => String(file.length))}
                    </p>

                    <ul className="mt-8 border-t border-bordure">
                        {file.map((ligne) => (
                            <li
                                key={ligne.id}
                                className="flex items-center justify-between gap-6 border-b border-bordure py-5"
                            >
                                <div className="flex items-center gap-4">
                                    {/* On modère d'abord avec les yeux : la vignette
                                        d'abord, le texte ensuite. */}
                                    {ligne.imagePath === "" ? null : (
                                        // Un `img` ordinaire et non `next/image` : la
                                        // vignette vient d'une autre origine, que
                                        // l'optimiseur demanderait d'autoriser pour rien,
                                        // le chemin étant immuable et déjà mis en cache.
                                        <img
                                            src={`${STOREFRONT}/api/media/${derivativePath(ligne.imagePath, 320)}`}
                                            alt=""
                                            width={80}
                                            height={80}
                                            className="h-20 w-20 object-cover"
                                        />
                                    )}
                                    <div className="flex flex-col gap-1">
                                        <span className="font-titre text-lg">{ligne.title}</span>
                                        {/* Le SLUG à côté du nom : `shopName` n'est pas
                                            unique, et deux lignes indistinguables feraient
                                            agir sur le produit de quelqu'un d'autre. */}
                                        <span className="text-sm text-muet">
                                            {ligne.shopName} · {ligne.shopSlug}
                                        </span>
                                        {ligne.publishedAt === null ? null : (
                                            <span className="text-sm text-muet">
                                                {t.publishedOn} {DATE.format(ligne.publishedAt)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <ModerationRow
                                    productId={ligne.id}
                                    reasons={reasons}
                                    labels={{
                                        review: t.review,
                                        retire: t.retire,
                                        reasonLabel: t.reasonLabel,
                                        reasonPlaceholder: t.reasonPlaceholder,
                                        commentLabel: t.commentLabel,
                                        confirm: t.confirm,
                                    }}
                                />
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </main>
    );
}
