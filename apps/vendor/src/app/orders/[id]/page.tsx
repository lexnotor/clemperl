import { ERROR_PAYMENT_ALREADY_SETTLED, prisma, readDisputeForVendor, readOrderForVendor } from "@clemperl/db";
import { E_ORDER_STATUS, E_PAYMENT_STATUS } from "@clemperl/db/enums";
import { allowedOrderActions, formatPrice, isOnlinePaymentMethod } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { requireVendorMembership } from "../../../lib/session";
import { DisputeReplyForm } from "./dispute-reply-form";
import { DisputeThread } from "./dispute-thread";
import { OrderActions } from "./order-actions";
import { SettleButton } from "./settle-button";

// Cette page lit la session : elle ne peut pas être pré-rendue au build.
export const dynamic = "force-dynamic";

const t = messages.orders;
const METHODS = messages.shop.payment.method;
const TD = messages.disputes;
const DATE = new Intl.DateTimeFormat("fr", { dateStyle: "long", timeStyle: "short" });

// Le navigateur doit savoir où joindre l'API. Lue ICI, à l'exécution, puis passée au bouton
// en prop : dans un composant client, Next remplacerait la variable à la construction du
// paquet, et l'adresse resterait celle de la machine qui l'a construit.
const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "";

export default async function OrderPage({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();
    const { id } = await params;

    const order = await readOrderForVendor(prisma, { vendorId: vendor.id, orderId: id });
    // 404 et non 403 : le filtre par boutique vit dans la signature du dépôt, et répondre
    // « interdit » confirmerait que cette commande existe, ce qui renseigne déjà.
    if (!order) {
        notFound();
    }

    // Lu par la même portée que la commande : un litige d'une autre boutique est
    // introuvable, même par un identifiant deviné.
    const dispute =
        order.dispute === null
            ? null
            : await readDisputeForVendor(prisma, { vendorId: vendor.id, orderId: order.id });

    // La devise est copiée dans une CONSTANTE locale : la restriction de type d'un accès
    // à une propriété est abandonnée dès qu'on entre dans une fermeture, et `formatPrice`
    // est appelée dans un `map`.
    const currency = order.currency;

    // Un encaissement porte la date où l'argent est arrivé, les autres celle où la tentative
    // a commencé. Le texte part tout fait : ni libellé ni nom ne se composent dans le JSX.
    const attempts = order.payments.map((attempt) => {
        // Une tentative sans fournisseur, réglée, est un pointage à la main. Son auteur peut
        // être anonyme : `name` est facultatif, et un compte supprimé laisse `settledBy`
        // vide. La ligne reste, avec un repli : la trace existe pour dire QUI a pointé, et
        // la taire rendrait le pointage anonyme.
        let settledBy: string | null = null;
        if (attempt.provider === null && attempt.status === E_PAYMENT_STATUS.SETTLED) {
            const name = attempt.settledBy?.name ?? null;
            settledBy =
                name === null
                    ? t.payment.settledByMember
                    : t.payment.settledBy.replace("{name}", () => name);
        }
        return {
            id: attempt.id,
            label: `${METHODS[attempt.method]} · ${t.payment.status[attempt.status]}`,
            date: DATE.format(attempt.settledAt ?? attempt.createdAt),
            settledBy,
        };
    });

    // Une commande ANNULÉE ne se pointe plus, et l'API le refuse désormais comme elle le
    // refuse déjà à l'acheteur. Le bouton suit ce refus plutôt que de le découvrir : un
    // bouton qu'on ne peut pas presser est une promesse que l'écran ne tient pas.
    const unsettled =
        order.paymentStatus !== E_PAYMENT_STATUS.SETTLED &&
        order.status !== E_ORDER_STATUS.CANCELLED;
    // Une méthode qui se règle chez un fournisseur ne se pointe pas à la main, et l'API le
    // refuse. Ce qu'elle sert vient du domaine, à partir de l'environnement qu'elle lit
    // aussi : sans adapter, la méthode se règle hors ligne, et le bouton « Paiement reçu »
    // doit être là, car l'API l'accepterait. La lecture se fait ICI, à l'exécution et côté
    // serveur : la variable n'est pas publique, et le navigateur ne la verrait pas.
    const online = isOnlinePaymentMethod(process.env, order.paymentMethod);

    // Les boutons viennent de CETTE liste, et de rien d'autre. Une action impossible ne
    // s'affiche pas grisée, elle ne s'affiche pas : un bouton qu'on ne peut pas presser
    // est une promesse que l'écran ne tient pas.
    const actions = allowedOrderActions(order.status).map((action) => ({
        action,
        label: t.action[action],
    }));

    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <Link href="/orders" className="text-sm text-muet hover:text-texte">
                {t.back}
            </Link>

            <div className="mt-4 flex items-baseline justify-between gap-6">
                <h1 className="font-titre text-4xl leading-tight tracking-tight">
                    {order.reference}
                </h1>
                <span className="text-sm text-muet">{t.status[order.status]}</span>
            </div>
            <p className="mt-2 text-sm text-muet">
                {t.placedOn} {DATE.format(order.createdAt)}
            </p>

            <section className="mt-10">
                <h2 className="font-titre text-xl">{t.lines}</h2>
                {/* Titre, libellé et prix unitaire viennent de la LIGNE de commande, jamais
                    du catalogue : le vendeur a pu renommer son produit ou changer son prix
                    depuis l'achat, et ce qui doit s'afficher est ce qui a été acheté. */}
                <ul className="mt-4 border-t border-bordure">
                    {order.items.map((line) => (
                        <li
                            key={line.id}
                            className="flex justify-between gap-6 border-b border-bordure py-3 text-sm"
                        >
                            <span>
                                {line.productTitle}
                                {line.variantLabel !== "" && ` (${line.variantLabel})`}
                                {` x${line.quantity}`}
                            </span>
                            <span>{formatPrice(line.unitAmount * line.quantity, currency)}</span>
                        </li>
                    ))}
                </ul>
                <p className="mt-4 text-right text-sm">
                    {t.total} : {formatPrice(order.totalAmount, currency)}
                </p>
            </section>

            <section className="mt-10 text-sm">
                <h2 className="font-titre text-xl">{t.payment.title}</h2>
                <p className="mt-4 flex justify-between gap-6">
                    <span>{METHODS[order.paymentMethod]}</span>
                    <span className="text-muet">{t.payment.status[order.paymentStatus]}</span>
                </p>
                {attempts.length > 0 && (
                    <>
                        <h3 className="mt-6 text-muet">{t.payment.attempts}</h3>
                        <ul className="mt-2 border-t border-bordure">
                            {attempts.map((attempt) => (
                                <li key={attempt.id} className="border-b border-bordure py-3">
                                    <p className="flex justify-between gap-6">
                                        <span>{attempt.label}</span>
                                        <span className="text-muet">{attempt.date}</span>
                                    </p>
                                    {attempt.settledBy !== null && (
                                        <p className="mt-1 text-muet">{attempt.settledBy}</p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                {unsettled && online && <p className="mt-4 text-muet">{t.payment.onlineOnly}</p>}
                {unsettled && !online && (
                    <div className="mt-4">
                        <SettleButton
                            orderId={order.id}
                            apiUrl={API_URL}
                            alreadySettledCode={ERROR_PAYMENT_ALREADY_SETTLED}
                            labels={{ settle: t.payment.settle, failed: t.payment.settleFailed }}
                        />
                    </div>
                )}
            </section>

            <section className="mt-10 text-sm">
                <h2 className="font-titre text-xl">{t.shipTo}</h2>
                <p className="mt-4">{order.shipToName}</p>
                <p>{order.shipToLine}</p>
                <p>
                    {order.shipToCity}, {order.shipToCountry}
                </p>
                <p>{order.shipToPhone}</p>
            </section>

            {order.note !== null && order.note !== "" && (
                <section className="mt-10 text-sm">
                    <h2 className="font-titre text-xl">{t.note}</h2>
                    <p className="mt-4">{order.note}</p>
                </section>
            )}

            {dispute !== null && (
                <section className="mt-10 border-t border-bordure pt-8 text-sm" data-testid="dispute">
                    <h2 className="font-titre text-xl">{TD.title}</h2>
                    <p className="mt-2 text-muet">{TD.intro}</p>
                    <p className="mt-4">
                        <span className="text-muet">{TD.statusLabel} : </span>
                        <span data-testid="dispute-status">{TD.status[dispute.status]}</span>
                    </p>
                    <p>
                        <span className="text-muet">{TD.reasonLabel} : </span>
                        {TD.reasons[dispute.reason]}
                    </p>
                    <h3 className="mt-4 text-muet">{TD.lines}</h3>
                    <ul className="mt-1">
                        {dispute.items.map(({ orderItem }) => (
                            <li key={orderItem.id}>
                                {orderItem.productTitle}
                                {orderItem.variantLabel !== "" && ` (${orderItem.variantLabel})`} x{orderItem.quantity}
                            </li>
                        ))}
                    </ul>
                    {/* La décision reste lisible après que le client s'est déclaré servi. */}
                    {dispute.decidedAt !== null && (
                        <div className="mt-6">
                            <h3 className="text-muet">{TD.decisionTitle}</h3>
                            <p className="mt-1">
                                {dispute.status === "DECIDED_FOR_VENDOR"
                                    ? TD.decision.DECIDED_FOR_VENDOR
                                    : TD.decision.DECIDED_FOR_BUYER}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap">{dispute.decisionComment}</p>
                        </div>
                    )}
                    <DisputeThread messages={dispute.messages} />
                    {dispute.status === "OPEN" && <DisputeReplyForm disputeId={dispute.id} />}
                </section>
            )}

            {actions.length > 0 && (
                <>
                    {/* Cette phrase prévient et n'empêche rien : les boutons ci-dessous restent
                        tous ouverts. Le vendeur connaît peut-être son client, ou a reçu les
                        fonds par un chemin que la plateforme ignore. */}
                    {unsettled && <p className="mt-10 text-sm">{t.payment.unpaidNotice}</p>}
                    <OrderActions orderId={order.id} actions={actions} />
                </>
            )}
        </main>
    );
}
