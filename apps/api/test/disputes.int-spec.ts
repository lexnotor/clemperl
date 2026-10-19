import {
    ERROR_DISPUTE_EXISTS,
    ERROR_DISPUTE_INVALID_LINES,
    ERROR_DISPUTE_NOT_ELIGIBLE,
    ERROR_DISPUTE_NOT_FOUND,
    ERROR_DISPUTE_STALE,
    ERROR_ORDER_NOT_FOUND,
    addCartItem,
    createProduct,
    decideDispute,
    listOpenDisputesForAdministration,
    listOrdersForVendor,
    readDisputeAttachmentForAdministration,
    readDisputeAttachmentForBuyer,
    readDisputeAttachmentForVendor,
    readDisputeForAdministration,
    readDisputeForBuyer,
    readDisputeForVendor,
    readOrderForBuyer,
    readOrderForVendor,
    markDisputeServed,
    openDispute,
    placeOrders,
    postDisputeMessageAsBuyer,
    postDisputeMessageAsVendor,
    prisma,
    setOrderStatus,
    setOrderStatusAsAdministrator,
    setProductStatus,
} from "@clemperl/db";
import { MAX_CART_QUANTITY } from "@clemperl/domain";

const PREFIX = "disp";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
let counter = 0;

// Le plafond vient de l'appelant : voir `IAddCartItem`.
const addItem = (input: { userId: string; variantId: string; quantity: number }) =>
    addCartItem(prisma, { ...input, maxQuantity: MAX_CART_QUANTITY });

const SHIP_TO = {
    name: "Awa Traoré",
    phone: "+32470000000",
    line: "12 rue des Tanneurs",
    city: "Bruxelles",
    country: "BE",
};

// Les tests qui ne portent pas sur la méthode la choisissent pour chaque boutique qu'ils
// nomment : `createShop` en accepte une par défaut.
const offPlatform = (...shops: { slug: string }[]) =>
    Object.fromEntries(shops.map((shop) => [shop.slug, "OFF_PLATFORM"]));

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

async function createShop(currency: string, paymentMethods: string[] = ["OFF_PLATFORM"]) {
    counter += 1;
    return prisma.vendor.create({
        data: {
            slug: `${PREFIX}-shop-${counter}`,
            shopName: `Atelier ${counter}`,
            shopDescription:
                "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: `contact-${counter}@atelier.test`,
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: `Atelier ${counter} SRL`,
            registrationNumber: "0123456789",
            country: "BE",
            currency: currency as never,
            paymentMethods: paymentMethods as never,
        },
    });
}

// Un produit PUBLIÉ complet, avec sa variante et son image prête. Sans l'image le dépôt
// refuse la publication, et sans elle le panier le refuserait aussi.
async function publishedVariant(
    vendorId: string,
    currency: string,
    amount: number,
) {
    counter += 1;
    const { id } = await createProduct(prisma, {
        vendorId,
        slug: `${PREFIX}-p-${counter}`,
        title: `Sac cabas ${counter}`,
        description: DESCRIPTION,
        category: "LEATHER_GOODS",
        priceAmount: amount,
        expectedCurrency: currency,
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
    const variant = await prisma.productVariant.findFirstOrThrow({
        where: { productId: id },
    });
    return { productId: id, variantId: variant.id };
}

afterAll(async () => {
    await prisma.$disconnect();
});

/** Une commande en `PLACED`, son acheteur, sa référence, et la boutique qui l'a reçue. */
async function placedOrder(): Promise<{
    orderId: string;
    buyerId: string;
    reference: string;
    shop: { id: string; shopName: string; slug: string };
}> {
    const buyerId = await createUser();
    const shop = await createShop("EUR");
    const { variantId } = await publishedVariant(shop.id, "EUR", 5000);
    await addItem({ userId: buyerId, variantId, quantity: 1 });

    const { references } = await placeOrders(prisma, {
        userId: buyerId,
        expectedTotal: 5000,
        shipTo: SHIP_TO,
        notes: {},
        methods: offPlatform(shop),
        lines: [{ variantId, label: "" }],
    });
    const reference = references[0] as string;

    // `placeOrders` ne rend que des références : l'identifiant se relit.
    const order = await prisma.order.findFirstOrThrow({
        where: { reference },
        select: { id: true },
    });
    return { orderId: order.id, buyerId, reference, shop };
}

const shippedAtOf = async (orderId: string) =>
    (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).shippedAt;

describe("dater l'expédition", () => {
    it("date la commande quand le vendeur l'expédie", async () => {
        const { orderId, shop } = await placedOrder();
        await setOrderStatus(prisma, { vendorId: shop.id, orderId, from: "PLACED", status: "ACCEPTED" });
        expect(await shippedAtOf(orderId)).toBeNull();

        await setOrderStatus(prisma, { vendorId: shop.id, orderId, from: "ACCEPTED", status: "SHIPPED" });

        expect(await shippedAtOf(orderId)).toBeInstanceOf(Date);
    });

    // Un chemin d'expédition qui oublierait la date retirerait tout recours à ses acheteurs,
    // et rien ne le signalerait : les deux chemins sont donc éprouvés.
    it("date la commande quand l'administration l'expédie", async () => {
        const { orderId } = await placedOrder();
        await setOrderStatusAsAdministrator(prisma, { orderId, from: "PLACED", status: "ACCEPTED" });
        expect(await shippedAtOf(orderId)).toBeNull();

        await setOrderStatusAsAdministrator(prisma, { orderId, from: "ACCEPTED", status: "SHIPPED" });

        expect(await shippedAtOf(orderId)).toBeInstanceOf(Date);
    });

    it("ne date rien sur une annulation", async () => {
        const { orderId, shop } = await placedOrder();

        await setOrderStatus(prisma, { vendorId: shop.id, orderId, from: "PLACED", status: "CANCELLED" });

        expect(await shippedAtOf(orderId)).toBeNull();
    });
});

// Bien avant toute commande de ces tests : la coupure du délai ne joue que là où un test
// la choisit.
const FAR_PAST = new Date("2000-01-01T00:00:00.000Z");

const EVIDENCE = {
    objectPath: "disputes/test/evidence-1.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1200,
    originalName: "colis.jpg",
};

/** Une commande expédiée par sa boutique, avec les identifiants de ses lignes. */
async function shippedOrder() {
    const placed = await placedOrder();
    const { orderId, shop } = placed;
    await setOrderStatus(prisma, { vendorId: shop.id, orderId, from: "PLACED", status: "ACCEPTED" });
    await setOrderStatus(prisma, { vendorId: shop.id, orderId, from: "ACCEPTED", status: "SHIPPED" });
    const lines = await prisma.orderItem.findMany({ where: { orderId }, select: { id: true } });
    return { ...placed, lineIds: lines.map((line) => line.id) };
}

/** Une commande expédiée, et le litige que son acheteur vient d'y ouvrir. */
async function openedDispute() {
    const order = await shippedOrder();
    const opened = await openDispute(prisma, {
        buyerId: order.buyerId,
        orderReference: order.reference,
        shippedAfter: FAR_PAST,
        reason: "DAMAGED",
        lineIds: order.lineIds,
        body: "Le fermoir est arrivé cassé.",
        locale: "en",
        attachments: [EVIDENCE],
    });
    return { ...order, disputeId: opened.disputeId, opened };
}

describe("ouvrir un litige", () => {
    it("ouvre un litige sur sa commande expédiée", async () => {
        const { disputeId, orderId, opened, shop } = await openedDispute();

        const dispute = await prisma.dispute.findUniqueOrThrow({
            where: { id: disputeId },
            include: { items: true, messages: { include: { attachments: true } } },
        });
        expect(dispute.status).toBe("OPEN");
        expect(dispute.locale).toBe("en");
        expect(dispute.items).toHaveLength(1);
        expect(dispute.messages).toHaveLength(1);
        expect(dispute.messages[0]?.party).toBe("BUYER");
        expect(dispute.messages[0]?.attachments[0]?.originalName).toBe("colis.jpg");
        expect(opened.orderId).toBe(orderId);
        expect(opened.vendorContactEmail).toBe(
            (await prisma.vendor.findUniqueOrThrow({ where: { id: shop.id } })).contactEmail,
        );
        // Une boutique sans candidature n'a pas de langue : le français, comme en T6a.
        expect(opened.vendorLocale).toBe("fr");
    });

    // La base départage : l'unicité sur la commande ne laisse passer qu'une ouverture.
    it("deux ouvertures simultanées n'en laissent passer qu'une", async () => {
        const order = await shippedOrder();
        const ouvrir = () =>
            openDispute(prisma, {
                buyerId: order.buyerId,
                orderReference: order.reference,
                shippedAfter: FAR_PAST,
                reason: "NOT_RECEIVED",
                lineIds: order.lineIds,
                body: "Rien reçu.",
                locale: "fr",
                attachments: [],
            });

        const results = await Promise.allSettled([ouvrir(), ouvrir()]);

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
        expect(rejected.reason).toMatchObject({ message: ERROR_DISPUTE_EXISTS });
    });

    it("refuse une ligne d'une autre commande, et n'écrit rien", async () => {
        const order = await shippedOrder();
        const autre = await shippedOrder();

        await expect(
            openDispute(prisma, {
                buyerId: order.buyerId,
                orderReference: order.reference,
                shippedAfter: FAR_PAST,
                reason: "WRONG_ITEM",
                lineIds: autre.lineIds,
                body: "Mauvais article.",
                locale: "fr",
                attachments: [],
            }),
        ).rejects.toMatchObject({ message: ERROR_DISPUTE_INVALID_LINES });
        expect(await prisma.dispute.count({ where: { orderId: order.orderId } })).toBe(0);
    });

    it("refuse aucune ligne", async () => {
        const order = await shippedOrder();

        await expect(
            openDispute(prisma, {
                buyerId: order.buyerId,
                orderReference: order.reference,
                shippedAfter: FAR_PAST,
                reason: "WRONG_ITEM",
                lineIds: [],
                body: "Mauvais article.",
                locale: "fr",
                attachments: [],
            }),
        ).rejects.toMatchObject({ message: ERROR_DISPUTE_INVALID_LINES });
    });

    it("refuse une commande expédiée avant la coupure", async () => {
        const order = await shippedOrder();

        await expect(
            openDispute(prisma, {
                buyerId: order.buyerId,
                orderReference: order.reference,
                // Une coupure dans le futur : la commande, expédiée à l'instant, est trop ancienne.
                shippedAfter: new Date(Date.now() + 60_000),
                reason: "DAMAGED",
                lineIds: order.lineIds,
                body: "Abîmé.",
                locale: "fr",
                attachments: [],
            }),
        ).rejects.toMatchObject({ message: ERROR_DISPUTE_NOT_ELIGIBLE });
    });

    it("refuse une commande qui n'est pas expédiée", async () => {
        const { buyerId, reference } = await placedOrder();

        await expect(
            openDispute(prisma, {
                buyerId,
                orderReference: reference,
                shippedAfter: FAR_PAST,
                reason: "NOT_RECEIVED",
                lineIds: ["inutile"],
                body: "Rien reçu.",
                locale: "fr",
                attachments: [],
            }),
        ).rejects.toMatchObject({ message: ERROR_DISPUTE_NOT_ELIGIBLE });
    });

    it("refuse la commande d'un autre acheteur", async () => {
        const order = await shippedOrder();
        const intrus = await createUser();

        await expect(
            openDispute(prisma, {
                buyerId: intrus,
                orderReference: order.reference,
                shippedAfter: FAR_PAST,
                reason: "DAMAGED",
                lineIds: order.lineIds,
                body: "Abîmé.",
                locale: "fr",
                attachments: [],
            }),
        ).rejects.toMatchObject({ message: ERROR_ORDER_NOT_FOUND });
    });
});

describe("écrire dans un litige", () => {
    it("un message avance la date du dernier échange", async () => {
        const { disputeId, shop } = await openedDispute();
        const avant = (await prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } })).lastActivityAt;
        const membre = await createUser();

        await postDisputeMessageAsVendor(prisma, {
            vendorId: shop.id,
            authorId: membre,
            disputeId,
            body: "Voici le bon de livraison signé.",
            attachments: [EVIDENCE],
        });

        const apres = await prisma.dispute.findUniqueOrThrow({
            where: { id: disputeId },
            include: { messages: { orderBy: { createdAt: "asc" } } },
        });
        expect(apres.lastActivityAt.getTime()).toBeGreaterThan(avant.getTime());
        expect(apres.messages.map((m) => m.party)).toEqual(["BUYER", "VENDOR"]);
    });

    it("refuse un message sur un litige tranché", async () => {
        const { disputeId, buyerId } = await openedDispute();
        const admin = await createUser();
        await decideDispute(prisma, {
            disputeId,
            decidedById: admin,
            from: "OPEN",
            status: "DECIDED_FOR_BUYER",
            comment: "Photo probante.",
        });

        await expect(
            postDisputeMessageAsBuyer(prisma, {
                buyerId,
                disputeId,
                body: "Encore un mot.",
                attachments: [],
            }),
        ).rejects.toMatchObject({ message: ERROR_DISPUTE_STALE });
    });

    it("refuse au vendeur le litige d'une autre boutique", async () => {
        const { disputeId } = await openedDispute();
        const autre = await createShop("EUR");
        const membre = await createUser();

        await expect(
            postDisputeMessageAsVendor(prisma, {
                vendorId: autre.id,
                authorId: membre,
                disputeId,
                body: "Je réponds à la place d'une autre boutique.",
                attachments: [],
            }),
        ).rejects.toMatchObject({ message: ERROR_DISPUTE_NOT_FOUND });
    });
});

describe("trancher et servir", () => {
    it("trancher deux fois laisse passer la première seulement", async () => {
        const { disputeId } = await openedDispute();
        const admin = await createUser();
        const trancher = (status: string) =>
            decideDispute(prisma, { disputeId, decidedById: admin, from: "OPEN", status, comment: "Vu." });

        const decision = await trancher("DECIDED_FOR_BUYER");

        expect(decision.buyerLocale).toBe("en");
        expect(decision.buyerEmail).toMatch(/@acheteur\.test$/);
        await expect(trancher("DECIDED_FOR_VENDOR")).rejects.toMatchObject({
            message: ERROR_DISPUTE_STALE,
        });
    });

    it("servir après une décision pour l'acheteur garde la décision", async () => {
        const { disputeId, buyerId } = await openedDispute();
        const admin = await createUser();
        await decideDispute(prisma, {
            disputeId,
            decidedById: admin,
            from: "OPEN",
            status: "DECIDED_FOR_BUYER",
            comment: "Photo probante.",
        });

        await markDisputeServed(prisma, { buyerId, disputeId, from: "DECIDED_FOR_BUYER" });

        const apres = await prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } });
        expect(apres.status).toBe("SERVED");
        expect(apres.decidedAt).toBeInstanceOf(Date);
        expect(apres.decisionComment).toBe("Photo probante.");
        expect(apres.servedAt).toBeInstanceOf(Date);
    });

    it("un autre acheteur ne peut pas servir", async () => {
        const { disputeId } = await openedDispute();
        const intrus = await createUser();

        await expect(
            markDisputeServed(prisma, { buyerId: intrus, disputeId, from: "OPEN" }),
        ).rejects.toMatchObject({ message: ERROR_DISPUTE_NOT_FOUND });
    });
});

describe("lire un litige", () => {
    it("l'acheteur lit son litige, messages dans l'ordre", async () => {
        const { disputeId, buyerId, reference, shop } = await openedDispute();
        await postDisputeMessageAsVendor(prisma, {
            vendorId: shop.id,
            authorId: await createUser(),
            disputeId,
            body: "Nous renvoyons la pièce.",
            attachments: [],
        });

        const dispute = await readDisputeForBuyer(prisma, { buyerId, orderReference: reference });

        expect(dispute?.status).toBe("OPEN");
        expect(dispute?.messages.map((m) => m.party)).toEqual(["BUYER", "VENDOR"]);
        expect(dispute?.messages[0]?.attachments[0]?.originalName).toBe("colis.jpg");
        expect(dispute?.items[0]?.orderItem.productTitle).toMatch(/^Sac cabas/);
    });

    it("un autre acheteur ne le lit pas", async () => {
        const { reference } = await openedDispute();
        const intrus = await createUser();

        expect(await readDisputeForBuyer(prisma, { buyerId: intrus, orderReference: reference })).toBeNull();
    });

    it("une autre boutique ne le lit pas", async () => {
        const { orderId, shop } = await openedDispute();
        const autre = await createShop("EUR");

        expect(await readDisputeForVendor(prisma, { vendorId: shop.id, orderId })).not.toBeNull();
        expect(await readDisputeForVendor(prisma, { vendorId: autre.id, orderId })).toBeNull();
    });

    it("l'administration le lit avec sa commande et sa boutique", async () => {
        const { disputeId, reference, shop } = await openedDispute();

        const dispute = await readDisputeForAdministration(prisma, disputeId);

        expect(dispute?.order.reference).toBe(reference);
        expect(dispute?.order.vendor.slug).toBe(shop.slug);
    });
});

describe("la liste des litiges ouverts", () => {
    const silence = (id: string, iso: string) =>
        prisma.dispute.update({ where: { id }, data: { lastActivityAt: new Date(iso) } });
    const ordre = async (ids: readonly string[]) =>
        (await listOpenDisputesForAdministration(prisma))
            .map((row) => row.id)
            .filter((id) => ids.includes(id));

    // L'ordre croissant du dernier échange met d'office les plus longs silences en tête :
    // c'est lui qui fait arriver les litiges à trancher là où l'administration regarde.
    it("rend les plus anciens silences en tête", async () => {
        const recent = (await openedDispute()).disputeId;
        const ancien = (await openedDispute()).disputeId;
        const moyen = (await openedDispute()).disputeId;
        await silence(recent, "2026-10-18T00:00:00.000Z");
        await silence(ancien, "2026-10-01T00:00:00.000Z");
        await silence(moyen, "2026-10-10T00:00:00.000Z");

        expect(await ordre([recent, ancien, moyen])).toEqual([ancien, moyen, recent]);
    });

    it("départage deux silences identiques par l'identifiant", async () => {
        const a = (await openedDispute()).disputeId;
        const b = (await openedDispute()).disputeId;
        await silence(a, "2026-09-01T00:00:00.000Z");
        await silence(b, "2026-09-01T00:00:00.000Z");

        expect(await ordre([a, b])).toEqual([a, b].sort());
    });

    it("ne rend pas un litige tranché", async () => {
        const { disputeId } = await openedDispute();
        await decideDispute(prisma, {
            disputeId,
            decidedById: await createUser(),
            from: "OPEN",
            status: "DECIDED_FOR_VENDOR",
            comment: "Bon de livraison signé.",
        });

        expect(await ordre([disputeId])).toEqual([]);
    });
});

describe("lire une pièce", () => {
    const pieceOf = async (disputeId: string) =>
        (await prisma.disputeAttachment.findFirstOrThrow({ where: { message: { disputeId } } })).id;

    it("l'acheteur lit sa pièce, un autre acheteur ne la lit pas", async () => {
        const { disputeId, buyerId } = await openedDispute();
        const attachmentId = await pieceOf(disputeId);
        const intrus = await createUser();

        expect((await readDisputeAttachmentForBuyer(prisma, { attachmentId, buyerId }))?.objectPath).toBe(
            EVIDENCE.objectPath,
        );
        expect(await readDisputeAttachmentForBuyer(prisma, { attachmentId, buyerId: intrus })).toBeNull();
    });

    it("la boutique lit la pièce, une autre boutique ne la lit pas", async () => {
        const { disputeId, shop } = await openedDispute();
        const attachmentId = await pieceOf(disputeId);
        const autre = await createShop("EUR");

        expect(await readDisputeAttachmentForVendor(prisma, { attachmentId, vendorId: shop.id })).not.toBeNull();
        expect(await readDisputeAttachmentForVendor(prisma, { attachmentId, vendorId: autre.id })).toBeNull();
    });

    it("l'administration lit toute pièce, et rien pour un identifiant inconnu", async () => {
        const { disputeId } = await openedDispute();
        const attachmentId = await pieceOf(disputeId);

        expect((await readDisputeAttachmentForAdministration(prisma, attachmentId))?.mimeType).toBe("image/jpeg");
        expect(await readDisputeAttachmentForAdministration(prisma, "c00000000000000000000000")).toBeNull();
    });
});

describe("la commande dit son litige", () => {
    it("chez l'acheteur, chez la boutique, et dans la liste de la boutique", async () => {
        const { buyerId, reference, orderId, shop } = await openedDispute();

        expect((await readOrderForBuyer(prisma, { buyerId, reference }))?.dispute?.status).toBe("OPEN");
        expect((await readOrderForVendor(prisma, { vendorId: shop.id, orderId }))?.dispute?.status).toBe("OPEN");
        const ligne = (await listOrdersForVendor(prisma, shop.id)).find((row) => row.id === orderId);
        expect(ligne?.dispute?.status).toBe("OPEN");
    });
});
