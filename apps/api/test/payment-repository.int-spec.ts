import {
    ERROR_PAYMENT_ALREADY_SETTLED,
    ERROR_PAYMENT_NOT_OFFLINE,
    ERROR_PAYMENT_ORDER_CANCELLED,
    ERROR_PAYMENT_ORDER_NOT_FOUND,
    ERROR_PAYMENT_REF_UNKNOWN,
    addCartItem,
    applyProviderEvent,
    createProduct,
    placeOrders,
    prisma,
    readOrderToPay,
    recordAttempt,
    settleOffline,
    setProductStatus,
} from "@clemperl/db";
import { MAX_CART_QUANTITY } from "@clemperl/domain";

const PREFIX = "pay";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
const PRICE = 5000;
const OFFLINE = ["CASH_ON_DELIVERY", "BANK_TRANSFER", "OFF_PLATFORM"];
let counter = 0;

const SHIP_TO = {
    name: "Awa Traoré",
    phone: "+32470000000",
    line: "12 rue des Tanneurs",
    city: "Bruxelles",
    country: "BE",
};

async function createUser(): Promise<string> {
    counter += 1;
    const user = await prisma.user.create({
        data: {
            email: `${PREFIX}-${counter}@acheteur.test`,
            name: "Acheteuse",
            emailVerified: true,
        },
    });
    return user.id;
}

// La boutique n'accepte que la méthode du test : sans elle, ses variantes ne sont pas
// éligibles et `placeOrders` refuserait avant d'atteindre le dépôt éprouvé ici.
async function createShop(method: string) {
    counter += 1;
    return prisma.vendor.create({
        data: {
            slug: `${PREFIX}-shop-${counter}`,
            shopName: `Atelier ${counter}`,
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: `contact-${counter}@atelier.test`,
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: `Atelier ${counter} SRL`,
            registrationNumber: "0123456789",
            country: "BE",
            currency: "EUR",
            paymentMethods: [method] as never,
        },
    });
}

// Un produit PUBLIÉ complet, avec sa variante et son image prête : sans l'image le dépôt
// refuse la publication.
async function publishedVariant(vendorId: string): Promise<string> {
    counter += 1;
    const { id } = await createProduct(prisma, {
        vendorId,
        slug: `${PREFIX}-p-${counter}`,
        title: `Sac cabas ${counter}`,
        description: DESCRIPTION,
        category: "LEATHER_GOODS",
        priceAmount: PRICE,
        expectedCurrency: "EUR",
    });
    await prisma.productImage.create({
        data: {
            productId: id,
            objectPath: `${id}/1111111${counter % 10}-2222-3333-4444-555555555555/original.jpg`,
            originalName: "photo.jpg",
            position: 0,
            status: "READY",
            width: 1200,
            height: 800,
        },
    });
    await setProductStatus(prisma, { productId: id, vendorId, publish: true });
    const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: id } });
    return variant.id;
}

// Une commande réelle, passée par `placeOrders` : le montant, la devise, la référence et la
// méthode figée sont ceux que le dépôt produit, pas ceux que le test aurait inventés.
// `memberId` est un membre de la boutique, celui qui pointera un encaissement hors ligne.
async function placedOrder(input: { method: string }) {
    const buyerId = await createUser();
    const memberId = await createUser();
    const shop = await createShop(input.method);
    await prisma.vendorMember.create({
        data: { vendorId: shop.id, userId: memberId, role: "OWNER" },
    });
    const variantId = await publishedVariant(shop.id);
    await addCartItem(prisma, {
        userId: buyerId,
        variantId,
        quantity: 1,
        maxQuantity: MAX_CART_QUANTITY,
    });
    const { references } = await placeOrders(prisma, {
        userId: buyerId,
        expectedTotal: PRICE,
        shipTo: SHIP_TO,
        notes: {},
        methods: { [shop.slug]: input.method },
        lines: [{ variantId, label: "" }],
    });
    const order = await prisma.order.findFirstOrThrow({
        where: { reference: references[0] },
    });
    return { ...order, memberId };
}

// Lance des appels concurrents en FORÇANT leur entrelacement. Les lancer côte à côte laisse
// le premier finir avant que le second ne commence, et un test de concurrence resterait
// vert sans la protection qu'il garde. Une transaction du test verrouille donc une ligne,
// les appels butent dessus, et le verrou ne tombe qu'une fois qu'ils sont tous en attente :
// ce qu'ils ont lu avant de bloquer ne vaut plus rien à leur reprise.
async function raceBehindLock<T>(
    lock: { table: "orders" | "payments"; column: "id" | "order_id"; value: string },
    calls: (() => Promise<T>)[],
): Promise<PromiseSettledResult<T>[]> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => {
        locked = resolve;
    });
    // Le délai par défaut d'une transaction interactive (5 s) vaut celui du sondage plus bas :
    // le détenteur expirerait avant que le sondage n'échoue, et son erreur masquerait celle
    // qui dit pourquoi la course n'a pas eu lieu.
    const holder = prisma.$transaction(
        async (tx) => {
            // Les identifiants viennent de l'union ci-dessus, jamais d'une entrée.
            await tx.$executeRawUnsafe(
                `SELECT id FROM ${lock.table} WHERE ${lock.column} = $1 FOR UPDATE`,
                lock.value,
            );
            locked();
            await gate;
        },
        { timeout: 30_000 },
    );
    await isLocked;

    const running = Promise.allSettled(calls.map((call) => call()));
    let waiting = 0;
    try {
        for (let poll = 0; poll < 100; poll += 1) {
            const [row] = await prisma.$queryRaw<{ waiting: number }[]>`
                SELECT count(*)::int AS waiting FROM pg_stat_activity
                WHERE datname = current_database() AND wait_event_type = 'Lock'`;
            waiting = row?.waiting ?? 0;
            if (waiting >= calls.length) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    } finally {
        release();
        await holder;
    }
    const results = await running;

    // Un délai épuisé ne doit PAS passer pour une course gagnée : sans l'entrelacement, la
    // garde que le test vise n'a pas été exercée, et il certifierait une garantie que
    // personne n'a vérifiée. Le verrou est déjà relâché, rien ne reste suspendu.
    if (waiting < calls.length) {
        throw new Error(
            `Course non forcée : ${calls.length} appels devaient buter sur le verrou, ` +
                `${waiting} y butaient quand le délai a expiré. Le test ne prouve rien.`,
        );
    }
    return results;
}

afterAll(async () => {
    await prisma.$disconnect();
});

describe("applyProviderEvent", () => {
    it("règle la commande et garde le payload", async () => {
        const order = await placedOrder({ method: "CARD" });
        await recordAttempt(prisma, {
            orderId: order.id,
            method: "CARD",
            amount: order.totalAmount,
            currency: order.currency,
            provider: "SIMULATED",
            providerRef: "sim_a",
        });

        const result = await applyProviderEvent(prisma, {
            provider: "SIMULATED",
            providerRef: "sim_a",
            status: "SETTLED",
            rawPayload: Buffer.from("chiffré"),
        });

        expect(result).toEqual({ changed: true, orderId: order.id });
        const after = await prisma.order.findUnique({ where: { id: order.id } });
        expect(after?.paymentStatus).toBe("SETTLED");
        const attempts = await prisma.orderPayment.findMany({ where: { orderId: order.id } });
        expect(attempts).toHaveLength(1);
        expect(attempts[0]?.status).toBe("SETTLED");
        expect(attempts[0]?.settledAt).not.toBeNull();
        expect(attempts[0]?.rawPayload).not.toBeNull();
    });

    // LE test central de la tranche. Un fournisseur rejoue ses webhooks : c'est le cas
    // normal, pas l'exception.
    //
    // Compter les lignes et relire le statut de la commande ne suffit pas : une commande
    // déjà `SETTLED` le reste quand on la règle une seconde fois, et un rejeu qui réécrirait
    // la tentative (son payload, sa date de règlement) passerait inaperçu. Les deux lignes
    // sont donc comparées en entier avant et après le rejeu, `updatedAt` compris : il
    // avance à la moindre écriture.
    it("ne crée rien et ne change rien quand le même événement arrive deux fois", async () => {
        const order = await placedOrder({ method: "CARD" });
        await recordAttempt(prisma, {
            orderId: order.id,
            method: "CARD",
            amount: order.totalAmount,
            currency: order.currency,
            provider: "SIMULATED",
            providerRef: "sim_b",
        });
        const event = {
            provider: "SIMULATED",
            providerRef: "sim_b",
            status: "SETTLED" as const,
            rawPayload: Buffer.from("chiffré"),
        };

        expect((await applyProviderEvent(prisma, event)).changed).toBe(true);
        const attemptBefore = await prisma.orderPayment.findFirstOrThrow({
            where: { orderId: order.id },
        });
        const orderBefore = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

        expect(await applyProviderEvent(prisma, event)).toEqual({
            changed: false,
            orderId: order.id,
        });

        const attempts = await prisma.orderPayment.findMany({ where: { orderId: order.id } });
        expect(attempts).toHaveLength(1);
        expect(attempts[0]).toEqual(attemptBefore);
        const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(after).toEqual(orderBefore);
        expect(after.paymentStatus).toBe("SETTLED");
    });

    // Un fournisseur qui n'a pas reçu notre réponse à temps rejoue l'événement pendant que
    // le premier est encore en cours de traitement. Lire le statut puis l'écrire laisse les
    // deux voir `PENDING` : les deux réécrivent la tentative et les deux répondent
    // `changed: true`. Un seul des deux doit gagner, et c'est l'écriture elle-même qui doit
    // le décider.
    it("ne laisse gagner qu'un seul de deux événements identiques simultanés", async () => {
        const order = await placedOrder({ method: "CARD" });
        await recordAttempt(prisma, {
            orderId: order.id,
            method: "CARD",
            amount: order.totalAmount,
            currency: order.currency,
            provider: "SIMULATED",
            providerRef: "sim_race",
        });
        const event = {
            provider: "SIMULATED",
            providerRef: "sim_race",
            status: "SETTLED" as const,
            rawPayload: Buffer.from("chiffré"),
        };

        const results = await raceBehindLock(
            { table: "payments", column: "order_id", value: order.id },
            [
                () => applyProviderEvent(prisma, event),
                () => applyProviderEvent(prisma, event),
            ],
        );

        expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
        expect(
            results.filter((r) => r.status === "fulfilled" && r.value.changed),
        ).toHaveLength(1);
        expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(1);
    });

    // Une tentative tranchée ne se rouvre pas, même quand l'événement qui arrive ensuite
    // dit autre chose : un fournisseur n'envoie pas ses événements dans l'ordre, et un
    // échec tardif ne doit pas défaire un règlement.
    it("ne rouvre pas une tentative réglée quand un événement contraire arrive ensuite", async () => {
        const order = await placedOrder({ method: "CARD" });
        await recordAttempt(prisma, {
            orderId: order.id,
            method: "CARD",
            amount: order.totalAmount,
            currency: order.currency,
            provider: "SIMULATED",
            providerRef: "sim_late",
        });
        await applyProviderEvent(prisma, {
            provider: "SIMULATED",
            providerRef: "sim_late",
            status: "SETTLED",
            rawPayload: Buffer.from("premier"),
        });
        const attemptBefore = await prisma.orderPayment.findFirstOrThrow({
            where: { orderId: order.id },
        });

        const late = await applyProviderEvent(prisma, {
            provider: "SIMULATED",
            providerRef: "sim_late",
            status: "FAILED",
            rawPayload: Buffer.from("tardif"),
        });

        expect(late.changed).toBe(false);
        const attempt = await prisma.orderPayment.findFirstOrThrow({
            where: { orderId: order.id },
        });
        expect(attempt).toEqual(attemptBefore);
        expect(attempt.status).toBe("SETTLED");
        const after = await prisma.order.findUnique({ where: { id: order.id } });
        expect(after?.paymentStatus).toBe("SETTLED");
    });

    // Deux onglets démarrent le même paiement : l'une des deux tentatives aboutit, l'autre
    // reste `PENDING`. Un échec qui arrive ensuite sur celle-là (un délai dépassé, par
    // exemple) se garde dans sa trace sans toucher à la commande, que l'argent a déjà
    // réglée : la tentative morte reste sans effet sur elle.
    it("garde l'échec d'une tentative abandonnée sans défaire une commande déjà réglée", async () => {
        const order = await placedOrder({ method: "CARD" });
        for (const providerRef of ["sim_e1", "sim_e2"]) {
            await recordAttempt(prisma, {
                orderId: order.id,
                method: "CARD",
                amount: order.totalAmount,
                currency: order.currency,
                provider: "SIMULATED",
                providerRef,
            });
        }
        await applyProviderEvent(prisma, {
            provider: "SIMULATED",
            providerRef: "sim_e2",
            status: "SETTLED",
            rawPayload: Buffer.from("payé"),
        });

        const late = await applyProviderEvent(prisma, {
            provider: "SIMULATED",
            providerRef: "sim_e1",
            status: "FAILED",
            rawPayload: Buffer.from("expiré"),
        });

        expect(late.changed).toBe(true);
        const attempts = await prisma.orderPayment.findMany({
            where: { orderId: order.id },
            orderBy: { providerRef: "asc" },
        });
        expect(attempts.map((a) => a.status)).toEqual(["FAILED", "SETTLED"]);
        const after = await prisma.order.findUnique({ where: { id: order.id } });
        expect(after?.paymentStatus).toBe("SETTLED");
    });

    // Le pendant côté argent : la tentative abandonnée finit par ABOUTIR chez le fournisseur,
    // et l'acheteur a payé deux fois. La plateforme ne peut pas l'empêcher, mais elle doit
    // le TRACER : la ligne garde son règlement et son payload, c'est ce qu'ouvrira le
    // remboursement, et la commande, déjà réglée, ne bouge pas.
    it("garde le règlement tardif d'une tentative abandonnée, la commande restant réglée", async () => {
        const order = await placedOrder({ method: "CARD" });
        for (const providerRef of ["sim_g1", "sim_g2"]) {
            await recordAttempt(prisma, {
                orderId: order.id,
                method: "CARD",
                amount: order.totalAmount,
                currency: order.currency,
                provider: "SIMULATED",
                providerRef,
            });
        }
        await applyProviderEvent(prisma, {
            provider: "SIMULATED",
            providerRef: "sim_g2",
            status: "SETTLED",
            rawPayload: Buffer.from("premier paiement"),
        });

        const late = await applyProviderEvent(prisma, {
            provider: "SIMULATED",
            providerRef: "sim_g1",
            status: "SETTLED",
            rawPayload: Buffer.from("second paiement"),
        });

        expect(late.changed).toBe(true);
        const abandoned = await prisma.orderPayment.findFirstOrThrow({
            where: { providerRef: "sim_g1" },
        });
        expect(abandoned.status).toBe("SETTLED");
        expect(abandoned.settledAt).not.toBeNull();
        expect(Buffer.from(abandoned.rawPayload ?? []).toString()).toBe("second paiement");
        expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(2);
        const after = await prisma.order.findUnique({ where: { id: order.id } });
        expect(after?.paymentStatus).toBe("SETTLED");
    });

    // Un paiement dont la plateforme n'a aucune trace de démarrage n'est pas le sien : rien
    // ne s'écrit, et le refus est nommé.
    it("refuse une référence inconnue sans rien écrire", async () => {
        const avant = await prisma.orderPayment.count();
        await expect(
            applyProviderEvent(prisma, {
                provider: "SIMULATED",
                providerRef: "sim_jamais_demarre",
                status: "SETTLED",
                rawPayload: Buffer.from("chiffré"),
            }),
        ).rejects.toMatchObject({ message: ERROR_PAYMENT_REF_UNKNOWN });
        expect(await prisma.orderPayment.count()).toBe(avant);
    });

    it("garde l'échec dans la trace, et laisse réessayer", async () => {
        const order = await placedOrder({ method: "CARD" });
        await recordAttempt(prisma, {
            orderId: order.id,
            method: "CARD",
            amount: order.totalAmount,
            currency: order.currency,
            provider: "SIMULATED",
            providerRef: "sim_c1",
        });
        await applyProviderEvent(prisma, {
            provider: "SIMULATED",
            providerRef: "sim_c1",
            status: "FAILED",
            rawPayload: Buffer.from("un"),
        });
        expect(
            (await prisma.order.findUnique({ where: { id: order.id } }))?.paymentStatus,
        ).toBe("FAILED");

        await recordAttempt(prisma, {
            orderId: order.id,
            method: "CARD",
            amount: order.totalAmount,
            currency: order.currency,
            provider: "SIMULATED",
            providerRef: "sim_c2",
        });
        await applyProviderEvent(prisma, {
            provider: "SIMULATED",
            providerRef: "sim_c2",
            status: "SETTLED",
            rawPayload: Buffer.from("deux"),
        });

        const after = await prisma.order.findUnique({ where: { id: order.id } });
        expect(after?.paymentStatus).toBe("SETTLED");
        const attempts = await prisma.orderPayment.findMany({ where: { orderId: order.id } });
        expect(attempts).toHaveLength(2);
        expect(attempts.map((a) => a.status).sort()).toEqual(["FAILED", "SETTLED"]);
    });

    // Un fournisseur annonce souvent une étape avant l'issue. Elle se garde sans rien
    // affirmer sur l'argent.
    it("garde un événement en attente sans déplacer l'axe de l'argent", async () => {
        const order = await placedOrder({ method: "CARD" });
        await recordAttempt(prisma, {
            orderId: order.id,
            method: "CARD",
            amount: order.totalAmount,
            currency: order.currency,
            provider: "SIMULATED",
            providerRef: "sim_d",
        });
        await applyProviderEvent(prisma, {
            provider: "SIMULATED",
            providerRef: "sim_d",
            status: "PENDING",
            rawPayload: Buffer.from("étape"),
        });
        const after = await prisma.order.findUnique({ where: { id: order.id } });
        expect(after?.paymentStatus).toBe("PENDING");
        const attempt = await prisma.orderPayment.findFirst({ where: { orderId: order.id } });
        expect(attempt?.status).toBe("PENDING");
        expect(attempt?.rawPayload).not.toBeNull();
    });

    // Sur une commande encore `PENDING`, écrire `PENDING` ne se verrait pas : le test
    // ci-dessus resterait vert même si un événement en attente écrivait sur la commande. Ici
    // la commande est déjà `FAILED`, et seule l'absence d'écriture la laisse ainsi.
    it("ne ramène pas à l'attente une commande dont la tentative précédente a échoué", async () => {
        const order = await placedOrder({ method: "CARD" });
        for (const providerRef of ["sim_f1", "sim_f2"]) {
            await recordAttempt(prisma, {
                orderId: order.id,
                method: "CARD",
                amount: order.totalAmount,
                currency: order.currency,
                provider: "SIMULATED",
                providerRef,
            });
        }
        await applyProviderEvent(prisma, {
            provider: "SIMULATED",
            providerRef: "sim_f1",
            status: "FAILED",
            rawPayload: Buffer.from("refusé"),
        });

        await applyProviderEvent(prisma, {
            provider: "SIMULATED",
            providerRef: "sim_f2",
            status: "PENDING",
            rawPayload: Buffer.from("étape"),
        });

        const after = await prisma.order.findUnique({ where: { id: order.id } });
        expect(after?.paymentStatus).toBe("FAILED");
    });
});

describe("settleOffline", () => {
    it("règle une commande hors ligne et dit qui l'a pointée", async () => {
        const order = await placedOrder({ method: "CASH_ON_DELIVERY" });
        await settleOffline(prisma, {
            vendorId: order.vendorId,
            orderId: order.id,
            userId: order.memberId,
            offlineMethods: OFFLINE,
        });

        const after = await prisma.order.findUnique({ where: { id: order.id } });
        expect(after?.paymentStatus).toBe("SETTLED");
        const attempts = await prisma.orderPayment.findMany({ where: { orderId: order.id } });
        expect(attempts).toHaveLength(1);
        // La ligne dit tout ce qu'une enquête cherchera : combien, par quelle méthode, qui
        // l'a pointée, et qu'elle est bien réglée. Une tentative laissée `PENDING` ou au
        // mauvais montant rendrait la trace fausse avec une commande pourtant `SETTLED`.
        expect(attempts[0]).toMatchObject({
            status: "SETTLED",
            method: "CASH_ON_DELIVERY",
            amount: order.totalAmount,
            currency: order.currency,
            settledById: order.memberId,
            provider: null,
            providerRef: null,
        });
        expect(attempts[0]?.settledAt).not.toBeNull();
    });

    // Un pointage est tout ou rien. Si la tentative ne peut pas s'écrire (ici l'utilisateur
    // n'existe pas, la clé étrangère de `settledById` refuse), la commande ne doit pas
    // rester réglée : une commande `SETTLED` sans aucune ligne qui le prouve est un
    // encaissement sans trace ni pointeur.
    it("ne règle pas la commande quand la tentative ne peut pas s'écrire", async () => {
        const order = await placedOrder({ method: "CASH_ON_DELIVERY" });

        await expect(
            settleOffline(prisma, {
                vendorId: order.vendorId,
                orderId: order.id,
                userId: "utilisateur-inconnu",
                offlineMethods: OFFLINE,
            }),
        ).rejects.toMatchObject({ code: "P2003" });

        const after = await prisma.order.findUnique({ where: { id: order.id } });
        expect(after?.paymentStatus).toBe("PENDING");
        expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(0);
    });

    // `readOrderToPay` refuse déjà une commande annulée à l'ACHETEUR. Sans ce refus-ci, le
    // vendeur pouvait faire ce que l'acheteur ne pouvait pas : pointer comme payée une
    // commande qu'il venait lui-même d'annuler. L'acheteur lisait alors « Annulée » et
    // « Payé » côte à côte, sans aucun recours, et la trace affirmait un encaissement sur
    // une commande qui n'existe plus.
    it("refuse de pointer une commande annulée", async () => {
        const order = await placedOrder({ method: "CASH_ON_DELIVERY" });
        await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });

        await expect(
            settleOffline(prisma, {
                vendorId: order.vendorId,
                orderId: order.id,
                userId: order.memberId,
                offlineMethods: OFFLINE,
            }),
        ).rejects.toMatchObject({ message: ERROR_PAYMENT_ORDER_CANCELLED });

        const after = await prisma.order.findUnique({ where: { id: order.id } });
        expect(after?.paymentStatus).toBe("PENDING");
        expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(0);
    });

    // Ce refus ferme un mensonge : seul le fournisseur dit ce qui s'est passé sur un
    // paiement en ligne, et un vendeur qui le pointerait à la main l'inventerait.
    it("refuse de pointer un paiement en ligne", async () => {
        const order = await placedOrder({ method: "CARD" });
        await expect(
            settleOffline(prisma, {
                vendorId: order.vendorId,
                orderId: order.id,
                userId: order.memberId,
                offlineMethods: OFFLINE,
            }),
        ).rejects.toMatchObject({ message: ERROR_PAYMENT_NOT_OFFLINE });
        expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(0);
    });

    // Le filtre par boutique vit dans la SIGNATURE : `orderId` vient de l'URL, donc du
    // client.
    it("refuse la commande d'une autre boutique", async () => {
        const mine = await placedOrder({ method: "CASH_ON_DELIVERY" });
        const other = await placedOrder({ method: "CASH_ON_DELIVERY" });
        await expect(
            settleOffline(prisma, {
                vendorId: other.vendorId,
                orderId: mine.id,
                userId: other.memberId,
                offlineMethods: OFFLINE,
            }),
        ).rejects.toMatchObject({ message: ERROR_PAYMENT_ORDER_NOT_FOUND });
    });

    it("refuse un second pointage", async () => {
        const order = await placedOrder({ method: "BANK_TRANSFER" });
        const input = {
            vendorId: order.vendorId,
            orderId: order.id,
            userId: order.memberId,
            offlineMethods: OFFLINE,
        };
        await settleOffline(prisma, input);
        await expect(settleOffline(prisma, input)).rejects.toMatchObject({
            message: ERROR_PAYMENT_ALREADY_SETTLED,
        });
        expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(1);
    });

    // Un double clic sur « marquer comme payé ». Hors ligne, la tentative n'a ni
    // fournisseur ni référence : aucune contrainte d'unicité ne retient la seconde, et deux
    // lignes `SETTLED` diraient que la boutique a encaissé deux fois.
    it("ne pointe qu'une fois quand deux pointages arrivent ensemble", async () => {
        const order = await placedOrder({ method: "CASH_ON_DELIVERY" });
        const input = {
            vendorId: order.vendorId,
            orderId: order.id,
            userId: order.memberId,
            offlineMethods: OFFLINE,
        };

        const results = await raceBehindLock(
            { table: "orders", column: "id", value: order.id },
            [() => settleOffline(prisma, input), () => settleOffline(prisma, input)],
        );

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const refused = results.find((r) => r.status === "rejected");
        expect((refused as PromiseRejectedResult).reason).toMatchObject({
            message: ERROR_PAYMENT_ALREADY_SETTLED,
        });
        expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(1);
    });
});

describe("readOrderToPay", () => {
    it("rend ce qu'il faut pour démarrer", async () => {
        const order = await placedOrder({ method: "CARD" });
        const found = await readOrderToPay(prisma, {
            buyerId: order.buyerId,
            orderId: order.id,
        });
        expect(found).toMatchObject({
            id: order.id,
            reference: order.reference,
            amount: order.totalAmount,
            currency: order.currency,
            method: "CARD",
        });
    });

    it("refuse la commande de quelqu'un d'autre", async () => {
        const order = await placedOrder({ method: "CARD" });
        const stranger = await createUser();
        await expect(
            readOrderToPay(prisma, { buyerId: stranger, orderId: order.id }),
        ).rejects.toMatchObject({ message: ERROR_PAYMENT_ORDER_NOT_FOUND });
    });

    it("refuse une commande annulée", async () => {
        const order = await placedOrder({ method: "CARD" });
        await prisma.order.update({
            where: { id: order.id },
            data: { status: "CANCELLED" },
        });
        await expect(
            readOrderToPay(prisma, { buyerId: order.buyerId, orderId: order.id }),
        ).rejects.toMatchObject({ message: ERROR_PAYMENT_ORDER_CANCELLED });
    });

    it("refuse une commande déjà réglée", async () => {
        const order = await placedOrder({ method: "CARD" });
        await prisma.order.update({
            where: { id: order.id },
            data: { paymentStatus: "SETTLED" },
        });
        await expect(
            readOrderToPay(prisma, { buyerId: order.buyerId, orderId: order.id }),
        ).rejects.toMatchObject({ message: ERROR_PAYMENT_ALREADY_SETTLED });
    });
});
