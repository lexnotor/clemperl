import {
    ERROR_CART_EMPTY,
    ERROR_ITEM_INELIGIBLE,
    ERROR_LINE_MISSING,
    ERROR_METHOD_UNAVAILABLE,
    ERROR_ORDER_NOT_FOUND,
    ERROR_ORDER_STATUS_STALE,
    ERROR_TOTAL_CHANGED,
    addCartItem,
    createProduct,
    listOrdersForBuyer,
    listOrdersForVendor,
    placeOrders,
    prisma,
    readCart,
    readOrderForBuyer,
    readOrderForVendor,
    setOrderStatus,
    setProductStatus,
} from "@clemperl/db";
import { MAX_CART_QUANTITY } from "@clemperl/domain";

const PREFIX = "order";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
let counter = 0;

// Le plafond vient de l'appelant : voir `IAddCartItem`.
const addItem = (input: { userId: string; variantId: string; quantity: number }) =>
    addCartItem(prisma, { ...input, maxQuantity: MAX_CART_QUANTITY });

const PRICE = 5000;

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
// refuse la publication, garantie solidifiée en T2c, et sans elle le panier le refuserait
// aussi.
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

describe("placeOrders", () => {
    it("produit une commande par boutique et vide le panier", async () => {
        const userId = await createUser();
        const premiere = await createShop("EUR");
        const seconde = await createShop("EUR");
        const a = await publishedVariant(premiere.id, "EUR", 5000);
        const b = await publishedVariant(seconde.id, "EUR", 3000);
        await addItem({ userId, variantId: a.variantId, quantity: 2 });
        await addItem({ userId, variantId: b.variantId, quantity: 1 });

        const { references } = await placeOrders(prisma, {
            userId,
            expectedTotal: 13000,
            shipTo: SHIP_TO,
            notes: {},
            methods: offPlatform(premiere, seconde),
            lines: [
                { variantId: a.variantId, label: "" },
                { variantId: b.variantId, label: "" },
            ],
        });

        expect(references).toHaveLength(2);
        expect(await readCart(prisma, userId)).toBeNull();

        const commandes = await prisma.order.findMany({
            where: { reference: { in: references } },
            include: { items: true },
        });
        expect(commandes.map((c) => c.vendorId).sort()).toEqual(
            [premiere.id, seconde.id].sort(),
        );
        expect(commandes.reduce((t, c) => t + c.totalAmount, 0)).toBe(13000);
    });

    // Le prix AFFICHÉ est celui qui engage. Sans ce refus, un acheteur serait débité d'un
    // montant qu'il n'a jamais vu.
    it("refuse quand le total recalculé diffère de celui qu'on lui annonce", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: 4000,
                shipTo: SHIP_TO,
                notes: {},
                methods: offPlatform(shop),
                lines: [{ variantId: a.variantId, label: "" }],
            }),
        ).rejects.toMatchObject({ message: ERROR_TOTAL_CHANGED });

        // RIEN n'est écrit, et le panier survit.
        expect(await prisma.order.count({ where: { buyerId: userId } })).toBe(0);
        expect((await readCart(prisma, userId))?.lines).toHaveLength(1);
    });

    it("refuse quand un article est devenu inéligible, sans amputer la commande", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        const b = await publishedVariant(shop.id, "EUR", 3000);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });
        await addItem({ userId, variantId: b.variantId, quantity: 1 });
        await setProductStatus(prisma, {
            productId: b.productId,
            vendorId: shop.id,
            publish: false,
        });

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: 8000,
                shipTo: SHIP_TO,
                notes: {},
                methods: offPlatform(shop),
                lines: [
                    { variantId: a.variantId, label: "" },
                    { variantId: b.variantId, label: "" },
                ],
            }),
        ).rejects.toMatchObject({ message: ERROR_ITEM_INELIGIBLE });

        expect(await prisma.order.count({ where: { buyerId: userId } })).toBe(0);
    });

    it("refuse un panier vide", async () => {
        const userId = await createUser();

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: 0,
                shipTo: SHIP_TO,
                notes: {},
                methods: {},
                lines: [],
            }),
        ).rejects.toMatchObject({ message: ERROR_CART_EMPTY });
    });

    // Deux onglets qui valident le même panier. Sans verrou, les deux lisent un panier
    // plein et écrivent chacun leur jeu de commandes : l'acheteur paie deux fois.
    it("ne produit qu'un seul jeu de commandes pour deux validations simultanées", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });

        const commande = {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            methods: offPlatform(shop),
            lines: [{ variantId: a.variantId, label: "" }],
        };
        const resultats = await Promise.allSettled([
            placeOrders(prisma, commande),
            placeOrders(prisma, commande),
        ]);

        expect(await prisma.order.count({ where: { buyerId: userId } })).toBe(1);

        // Le compte seul ne prouve PAS que le verrou travaille. Sans lui, les deux
        // transactions lisent le panier, écrivent leurs commandes, et c'est la suppression
        // du panier qui les départage : la perdante reçoit un P2025 et sa transaction
        // entière est annulée, donc il reste bien une commande. Le test resterait vert
        // avec un verrou retiré, et ne garderait rien.
        //
        // Ce qui distingue vraiment les deux mondes est la RAISON du refus. Avec le
        // verrou, la perdante attend, relit un panier disparu et refuse proprement. Sans
        // lui, elle échoue sur une contrainte interne que l'écran ne sait pas traduire.
        const refusees = resultats.filter((r) => r.status === "rejected");
        expect(refusees).toHaveLength(1);
        expect((refusees[0] as PromiseRejectedResult).reason).toMatchObject({
            message: ERROR_CART_EMPTY,
        });
    });

    // Le libellé de déclinaison est calculé par l'APPELANT, parce qu'il vient du domaine
    // que ce package ne peut pas importer. Un appelant qui oublie une ligne figerait donc
    // une commande sans savoir ce qui a été acheté, et le figeage étant définitif, cette
    // information ne revient jamais. Un oubli doit faire du bruit, pas une chaîne vide.
    //
    // Le refus porte sur l'ABSENCE de l'entrée, pas sur un libellé vide : un produit sans
    // axe a bel et bien un libellé vide, et c'est légitime.
    it("refuse quand une ligne du panier n'a pas de libellé fourni", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        const b = await publishedVariant(shop.id, "EUR", 3000);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });
        await addItem({ userId, variantId: b.variantId, quantity: 1 });

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: 8000,
                shipTo: SHIP_TO,
                notes: {},
                methods: offPlatform(shop),
                // `b` manque.
                lines: [{ variantId: a.variantId, label: "" }],
            }),
        ).rejects.toMatchObject({ message: ERROR_LINE_MISSING });

        expect(await prisma.order.count({ where: { buyerId: userId } })).toBe(0);
        expect((await readCart(prisma, userId))?.lines).toHaveLength(2);
    });

    // Le cas RÉEL d'une ligne manquante n'est pas un appelant fautif : c'est un acheteur
    // qui a ajouté un article dans un autre onglet pendant qu'il remplissait son adresse.
    // Il doit lire que son total a changé, ce qui est vrai et actionnable, et non une
    // erreur interne sur un libellé, qui ne lui dit rien. Le contrôle du total passe donc
    // AVANT celui des libellés.
    it("annonce le total changé, et non le libellé, quand un article a été ajouté entretemps", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });

        // L'écran a lu le panier ici : un article, 5000.
        const vuParEcran = {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            methods: offPlatform(shop),
            lines: [{ variantId: a.variantId, label: "" }],
        };

        // Puis l'acheteur ajoute un article ailleurs.
        const b = await publishedVariant(shop.id, "EUR", 3000);
        await addItem({ userId, variantId: b.variantId, quantity: 1 });

        await expect(placeOrders(prisma, vuParEcran)).rejects.toMatchObject({
            message: ERROR_TOTAL_CHANGED,
        });
    });

    // LA raison d'être du figeage. Une commande est une pièce comptable : elle doit dire
    // ce qui a été acheté quand le catalogue ne le dit plus.
    it("reste lisible après renommage, suppression du produit et fermeture de la boutique", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });
        const { references } = await placeOrders(prisma, {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            methods: offPlatform(shop),
            lines: [{ variantId: a.variantId, label: "Taille : L" }],
        });

        // Les trois coups que le critère 6 nomme : renommer, supprimer, fermer. La
        // suppression du produit emporte ses variantes en cascade, et c'est le `SetNull`
        // qui empêche la ligne de commande de partir avec elles.
        await prisma.product.update({
            where: { id: a.productId },
            data: { title: "Titre changé après coup" },
        });
        await prisma.product.delete({ where: { id: a.productId } });
        await prisma.vendor.update({
            where: { id: shop.id },
            data: { deletedAt: new Date() },
        });

        const commande = await readOrderForBuyer(prisma, {
            buyerId: userId,
            reference: references[0] as string,
        });
        expect(commande?.items[0]?.productTitle).toContain("Sac cabas");
        expect(commande?.items[0]?.productTitle).not.toContain("changé après coup");
        expect(commande?.items[0]?.unitAmount).toBe(5000);
        expect(commande?.items[0]?.variantLabel).toBe("Taille : L");
        expect(commande?.items[0]?.variantId).toBeNull();
        // La boutique est fermée, et la commande sait encore de qui elle vient.
        expect(commande?.vendor.shopName).toContain("Atelier");
    });

    it("fige le mot destiné à chaque boutique", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });

        const { references } = await placeOrders(prisma, {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: { [shop.slug]: "Emballage cadeau" },
            methods: offPlatform(shop),
            lines: [{ variantId: a.variantId, label: "" }],
        });

        const commande = await prisma.order.findFirstOrThrow({
            where: { reference: references[0] },
        });
        expect(commande.note).toBe("Emballage cadeau");
        expect(commande.shipToCity).toBe(SHIP_TO.city);
    });
});

describe("la méthode de paiement", () => {
    it("se fige sur la commande, et le paiement naît en attente", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR", ["CASH_ON_DELIVERY", "OFF_PLATFORM"]);
        const a = await publishedVariant(shop.id, "EUR", PRICE);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });

        const { references } = await placeOrders(prisma, {
            userId,
            expectedTotal: PRICE,
            shipTo: SHIP_TO,
            notes: {},
            methods: { [shop.slug]: "CASH_ON_DELIVERY" },
            lines: [{ variantId: a.variantId, label: "" }],
        });

        const order = await readOrderForBuyer(prisma, {
            buyerId: userId,
            reference: references[0] ?? "",
        });
        expect(order?.paymentMethod).toBe("CASH_ON_DELIVERY");
        expect(order?.paymentStatus).toBe("PENDING");
        expect(order?.payments).toEqual([]);
    });

    // Le champ vient d'un formulaire, donc du client. Une valeur que la boutique n'accepte
    // pas doit refuser TOUTE la validation, et non se replier sur un défaut : se replier
    // choisirait pour l'acheteur comment il paie. La boutique a des méthodes, mais pas
    // celle-ci : une boutique sans aucune méthode échouerait plus tôt, à l'éligibilité.
    it("refuse une méthode que la boutique n'accepte pas", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR", ["OFF_PLATFORM"]);
        const a = await publishedVariant(shop.id, "EUR", PRICE);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: PRICE,
                shipTo: SHIP_TO,
                notes: {},
                methods: { [shop.slug]: "CARD" },
                lines: [{ variantId: a.variantId, label: "" }],
            }),
        ).rejects.toMatchObject({ message: ERROR_METHOD_UNAVAILABLE });

        // Le panier est INTACT : une validation refusée ne doit rien emporter.
        expect(await prisma.order.count({ where: { buyerId: userId } })).toBe(0);
        expect((await readCart(prisma, userId))?.lines).toHaveLength(1);
    });

    // Une valeur hors de l'enum n'est pas une méthode que la boutique refuse : c'est une
    // valeur que la base ne sait pas écrire. Elle doit être refusée avant, avec la même
    // raison, et non faire lever une erreur de Prisma que l'écran ne traduit pas.
    it("refuse une valeur qui n'est pas une méthode", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR", ["OFF_PLATFORM"]);
        const a = await publishedVariant(shop.id, "EUR", PRICE);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: PRICE,
                shipTo: SHIP_TO,
                notes: {},
                methods: { [shop.slug]: "BITCOIN" },
                lines: [{ variantId: a.variantId, label: "" }],
            }),
        ).rejects.toMatchObject({ message: ERROR_METHOD_UNAVAILABLE });

        expect((await readCart(prisma, userId))?.lines).toHaveLength(1);
    });

    it("refuse une boutique du panier sans méthode fournie", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR", ["OFF_PLATFORM"]);
        const a = await publishedVariant(shop.id, "EUR", PRICE);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: PRICE,
                shipTo: SHIP_TO,
                notes: {},
                methods: {},
                lines: [{ variantId: a.variantId, label: "" }],
            }),
        ).rejects.toMatchObject({ message: ERROR_METHOD_UNAVAILABLE });

        expect((await readCart(prisma, userId))?.lines).toHaveLength(1);
    });

    // Une boutique décoche sa méthode pendant que l'acheteur remplit son adresse. Les
    // méthodes se lisent dans la transaction, donc la validation refuse sur l'état de la
    // boutique à l'instant de l'écriture, et non sur celui que l'écran affichait.
    it("refuse une méthode que la boutique a décochée entretemps", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR", ["CASH_ON_DELIVERY", "OFF_PLATFORM"]);
        const a = await publishedVariant(shop.id, "EUR", PRICE);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });

        // L'écran proposait les deux, l'acheteur a choisi la livraison, puis la boutique
        // retire cette méthode.
        await prisma.vendor.update({
            where: { id: shop.id },
            data: { paymentMethods: ["OFF_PLATFORM"] },
        });

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: PRICE,
                shipTo: SHIP_TO,
                notes: {},
                methods: { [shop.slug]: "CASH_ON_DELIVERY" },
                lines: [{ variantId: a.variantId, label: "" }],
            }),
        ).rejects.toMatchObject({ message: ERROR_METHOD_UNAVAILABLE });

        expect(await prisma.order.count({ where: { buyerId: userId } })).toBe(0);
        expect((await readCart(prisma, userId))?.lines).toHaveLength(1);
    });

    // Deux boutiques, deux méthodes différentes : c'est tout l'intérêt du choix par
    // boutique, et le cas qu'un choix unique pour le panier aurait rendu impossible.
    it("donne à chaque commande la méthode de sa boutique", async () => {
        const userId = await createUser();
        const first = await createShop("EUR", ["CASH_ON_DELIVERY"]);
        const second = await createShop("EUR", ["BANK_TRANSFER"]);
        const a = await publishedVariant(first.id, "EUR", PRICE);
        const b = await publishedVariant(second.id, "EUR", PRICE);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });
        await addItem({ userId, variantId: b.variantId, quantity: 1 });

        const { references } = await placeOrders(prisma, {
            userId,
            expectedTotal: PRICE * 2,
            shipTo: SHIP_TO,
            notes: {},
            methods: {
                [first.slug]: "CASH_ON_DELIVERY",
                [second.slug]: "BANK_TRANSFER",
            },
            lines: [
                { variantId: a.variantId, label: "" },
                { variantId: b.variantId, label: "" },
            ],
        });

        expect(references).toHaveLength(2);
        const orders = await prisma.order.findMany({
            where: { reference: { in: references } },
            select: { vendorId: true, paymentMethod: true },
        });
        expect(orders.find((o) => o.vendorId === first.id)?.paymentMethod).toBe(
            "CASH_ON_DELIVERY",
        );
        expect(orders.find((o) => o.vendorId === second.id)?.paymentMethod).toBe(
            "BANK_TRANSFER",
        );
    });

    // Le refus d'UNE boutique emporte TOUTE la validation : aucune commande n'est écrite et
    // le panier reste intact. L'ordre dans lequel les boutiques sont visitées n'est pas
    // fixé, et le test tient dans les deux cas.
    it("refuse tout quand une seule des boutiques n'a pas de méthode valide", async () => {
        const userId = await createUser();
        const first = await createShop("EUR", ["CASH_ON_DELIVERY"]);
        const second = await createShop("EUR", ["BANK_TRANSFER"]);
        const a = await publishedVariant(first.id, "EUR", PRICE);
        const b = await publishedVariant(second.id, "EUR", PRICE);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });
        await addItem({ userId, variantId: b.variantId, quantity: 1 });

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: PRICE * 2,
                shipTo: SHIP_TO,
                notes: {},
                methods: {
                    [first.slug]: "CASH_ON_DELIVERY",
                    [second.slug]: "CASH_ON_DELIVERY",
                },
                lines: [
                    { variantId: a.variantId, label: "" },
                    { variantId: b.variantId, label: "" },
                ],
            }),
        ).rejects.toMatchObject({ message: ERROR_METHOD_UNAVAILABLE });

        expect(await prisma.order.count({ where: { buyerId: userId } })).toBe(0);
        expect((await readCart(prisma, userId))?.lines).toHaveLength(2);
    });

    // L'écran de validation ne propose que ce que la boutique accepte : le panier porte
    // donc les méthodes de la boutique de chaque ligne.
    it("le panier rend les méthodes que chaque boutique accepte", async () => {
        const userId = await createUser();
        const first = await createShop("EUR", ["CASH_ON_DELIVERY", "OFF_PLATFORM"]);
        const second = await createShop("EUR", ["BANK_TRANSFER"]);
        const a = await publishedVariant(first.id, "EUR", PRICE);
        const b = await publishedVariant(second.id, "EUR", PRICE);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });
        await addItem({ userId, variantId: b.variantId, quantity: 1 });

        const cart = await readCart(prisma, userId);

        const methodsOf = (variantId: string) =>
            cart?.lines.find((line) => line.variantId === variantId)?.shopMethods.sort();
        expect(methodsOf(a.variantId)).toEqual(["CASH_ON_DELIVERY", "OFF_PLATFORM"]);
        expect(methodsOf(b.variantId)).toEqual(["BANK_TRANSFER"]);
    });

    // Les lectures rendent l'axe de l'argent : c'est ce que les écrans afficheront.
    it("les listes et les lectures rendent la méthode et l'état du paiement", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR", ["BANK_TRANSFER"]);
        const a = await publishedVariant(shop.id, "EUR", PRICE);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });
        const { references } = await placeOrders(prisma, {
            userId,
            expectedTotal: PRICE,
            shipTo: SHIP_TO,
            notes: {},
            methods: { [shop.slug]: "BANK_TRANSFER" },
            lines: [{ variantId: a.variantId, label: "" }],
        });
        const order = await prisma.order.findFirstOrThrow({
            where: { reference: references[0] },
        });

        const forBuyer = await listOrdersForBuyer(prisma, userId);
        expect(forBuyer[0]?.paymentMethod).toBe("BANK_TRANSFER");
        expect(forBuyer[0]?.paymentStatus).toBe("PENDING");

        const forVendor = await listOrdersForVendor(prisma, shop.id);
        expect(forVendor[0]?.paymentMethod).toBe("BANK_TRANSFER");
        expect(forVendor[0]?.paymentStatus).toBe("PENDING");

        // La trace d'une tentative apparaît, sans son payload : `rawPayload` est chiffré
        // et ne se lit qu'à l'enquête.
        await prisma.orderPayment.create({
            data: {
                orderId: order.id,
                method: "BANK_TRANSFER",
                amount: PRICE,
                currency: "EUR",
                provider: "simulated",
                providerRef: `ref-${counter}`,
                rawPayload: Buffer.from("chiffré"),
            },
        });
        const buyerView = await readOrderForBuyer(prisma, {
            buyerId: userId,
            reference: references[0] ?? "",
        });
        const vendorView = await readOrderForVendor(prisma, {
            vendorId: shop.id,
            orderId: order.id,
        });
        for (const view of [buyerView, vendorView]) {
            expect(view?.payments).toHaveLength(1);
            expect(view?.payments[0]).toMatchObject({
                method: "BANK_TRANSFER",
                status: "PENDING",
                provider: "simulated",
            });
            expect(view?.payments[0]).not.toHaveProperty("rawPayload");
        }
    });
});

describe("l'isolement des commandes", () => {
    // Les deux listes sont filtrées par leur propriétaire : retirer le filtre de l'une ou
    // de l'autre ferait apparaître la commande d'un tiers.
    it("les listes ne montrent que les commandes de leur propriétaire", async () => {
        const mien = await createUser();
        const autre = await createUser();
        const mienne = await createShop("EUR");
        const voisine = await createShop("EUR");
        const a = await publishedVariant(mienne.id, "EUR", 5000);
        const b = await publishedVariant(voisine.id, "EUR", 3000);
        await addItem({
            userId: mien,
            variantId: a.variantId,
            quantity: 1,
        });
        await addItem({
            userId: autre,
            variantId: b.variantId,
            quantity: 1,
        });
        const miennes = await placeOrders(prisma, {
            userId: mien,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            methods: offPlatform(mienne),
            lines: [{ variantId: a.variantId, label: "" }],
        });
        await placeOrders(prisma, {
            userId: autre,
            expectedTotal: 3000,
            shipTo: SHIP_TO,
            notes: {},
            methods: offPlatform(voisine),
            lines: [{ variantId: b.variantId, label: "" }],
        });

        const forBuyer = await listOrdersForBuyer(prisma, mien);
        expect(forBuyer.map((c) => c.reference)).toEqual(miennes.references);

        const forVendor = await listOrdersForVendor(prisma, mienne.id);
        expect(forVendor.map((c) => c.reference)).toEqual(miennes.references);
    });

    it("un acheteur ne lit pas la commande d'un autre", async () => {
        const mien = await createUser();
        const autre = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addItem({
            userId: autre,
            variantId: a.variantId,
            quantity: 1,
        });
        const { references } = await placeOrders(prisma, {
            userId: autre,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            methods: offPlatform(shop),
            lines: [{ variantId: a.variantId, label: "" }],
        });

        await expect(
            readOrderForBuyer(prisma, {
                buyerId: mien,
                reference: references[0] as string,
            }),
        ).resolves.toBeNull();
    });

    it("un vendeur ne lit pas la commande d'une autre boutique", async () => {
        const userId = await createUser();
        const mienne = await createShop("EUR");
        const autre = await createShop("EUR");
        const a = await publishedVariant(autre.id, "EUR", 5000);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });
        await placeOrders(prisma, {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            methods: offPlatform(autre),
            lines: [{ variantId: a.variantId, label: "" }],
        });
        const commande = await prisma.order.findFirstOrThrow({
            where: { vendorId: autre.id },
        });

        await expect(
            readOrderForVendor(prisma, { vendorId: mienne.id, orderId: commande.id }),
        ).resolves.toBeNull();
    });

    // L'ÉCRITURE elle-même, et pas seulement son refus. `packages/db/vitest.config.ts`
    // exclut les dépôts de la couverture unitaire : sans ce test, remplacer le corps de
    // `setOrderStatus` par un no-op laisse toute la suite verte.
    it("le vendeur fait avancer sa commande, un état après l'autre", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });
        await placeOrders(prisma, {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            methods: offPlatform(shop),
            lines: [{ variantId: a.variantId, label: "" }],
        });
        const order = await prisma.order.findFirstOrThrow({ where: { vendorId: shop.id } });

        await setOrderStatus(prisma, {
            vendorId: shop.id,
            orderId: order.id,
            from: "PLACED",
            status: "ACCEPTED",
        });
        await setOrderStatus(prisma, {
            vendorId: shop.id,
            orderId: order.id,
            from: "ACCEPTED",
            status: "SHIPPED",
        });

        const relue = await prisma.order.findFirstOrThrow({ where: { id: order.id } });
        expect(relue.status).toBe("SHIPPED");
    });

    // Une boutique a plusieurs membres, donc deux écrans peuvent regarder la même commande.
    // Ce test épingle la condition de statut : sans elle, un clic depuis une page périmée
    // ramène une commande EXPÉDIÉE à « acceptée », et un `count === 0` ne le voit pas.
    it("un écran périmé n'écrase pas une décision plus récente", async () => {
        const userId = await createUser();
        const shop = await createShop("EUR");
        const a = await publishedVariant(shop.id, "EUR", 5000);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });
        await placeOrders(prisma, {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            methods: offPlatform(shop),
            lines: [{ variantId: a.variantId, label: "" }],
        });
        const order = await prisma.order.findFirstOrThrow({ where: { vendorId: shop.id } });

        // Un collègue accepte puis expédie.
        await setOrderStatus(prisma, {
            vendorId: shop.id,
            orderId: order.id,
            from: "PLACED",
            status: "ACCEPTED",
        });
        await setOrderStatus(prisma, {
            vendorId: shop.id,
            orderId: order.id,
            from: "ACCEPTED",
            status: "SHIPPED",
        });

        // L'autre page, restée sur « commande passée », clique sur « Accepter ».
        await expect(
            setOrderStatus(prisma, {
                vendorId: shop.id,
                orderId: order.id,
                from: "PLACED",
                status: "ACCEPTED",
            }),
        ).rejects.toMatchObject({ message: ERROR_ORDER_STATUS_STALE });

        const relue = await prisma.order.findFirstOrThrow({ where: { id: order.id } });
        expect(relue.status).toBe("SHIPPED");
    });

    it("un vendeur ne fait pas avancer la commande d'une autre boutique", async () => {
        const userId = await createUser();
        const mienne = await createShop("EUR");
        const autre = await createShop("EUR");
        const a = await publishedVariant(autre.id, "EUR", 5000);
        await addItem({ userId, variantId: a.variantId, quantity: 1 });
        await placeOrders(prisma, {
            userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            methods: offPlatform(autre),
            lines: [{ variantId: a.variantId, label: "" }],
        });
        const commande = await prisma.order.findFirstOrThrow({
            where: { vendorId: autre.id },
        });

        await expect(
            setOrderStatus(prisma, {
                vendorId: mienne.id,
                orderId: commande.id,
                from: "PLACED",
                status: "ACCEPTED",
            }),
        ).rejects.toMatchObject({ message: ERROR_ORDER_NOT_FOUND });

        const relue = await prisma.order.findFirstOrThrow({
            where: { id: commande.id },
        });
        expect(relue.status).toBe("PLACED");
    });
});
