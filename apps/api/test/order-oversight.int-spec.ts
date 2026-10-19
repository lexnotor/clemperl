import {
    ERROR_ORDER_NOT_FOUND,
    ERROR_ORDER_STATUS_STALE,
    addCartItem,
    createProduct,
    listOrdersForAdministration,
    placeOrders,
    prisma,
    readOrderForAdministration,
    setOrderStatus,
    setOrderStatusAsAdministrator,
    setProductStatus,
} from "@clemperl/db";
import { MAX_CART_QUANTITY } from "@clemperl/domain";

const PREFIX = "over";
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

/** Une commande en `PLACED`, et la boutique qui l'a reçue. */
async function placedOrder(): Promise<{
    orderId: string;
    shop: { id: string; shopName: string; slug: string };
}> {
    const userId = await createUser();
    const shop = await createShop("EUR");
    const { variantId } = await publishedVariant(shop.id, "EUR", 5000);
    await addItem({ userId, variantId, quantity: 1 });

    const { references } = await placeOrders(prisma, {
        userId,
        expectedTotal: 5000,
        shipTo: SHIP_TO,
        notes: {},
        methods: offPlatform(shop),
        lines: [{ variantId, label: "" }],
    });

    // `placeOrders` ne rend que des références : l'identifiant se relit.
    const order = await prisma.order.findFirstOrThrow({
        where: { reference: references[0] },
        select: { id: true },
    });
    return { orderId: order.id, shop };
}

describe("écrire un état de commande sans boutique", () => {
    it("fait avancer une commande sans portée de boutique", async () => {
        const { orderId } = await placedOrder();

        await setOrderStatusAsAdministrator(prisma, {
            orderId,
            from: "PLACED",
            status: "ACCEPTED",
        });

        const apres = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
        expect(apres.status).toBe("ACCEPTED");
    });

    // La comparaison-et-échange vaut des deux côtés : l'administration ne doit pas pouvoir
    // ramener en arrière une commande qu'un vendeur vient de faire avancer.
    it("refuse quand l'état lu a changé", async () => {
        const { orderId } = await placedOrder();
        await setOrderStatusAsAdministrator(prisma, {
            orderId,
            from: "PLACED",
            status: "ACCEPTED",
        });

        await expect(
            setOrderStatusAsAdministrator(prisma, {
                orderId,
                from: "PLACED",
                status: "CANCELLED",
            }),
        ).rejects.toMatchObject({ message: ERROR_ORDER_STATUS_STALE });
    });

    it("refuse une commande qui n'existe pas", async () => {
        await expect(
            setOrderStatusAsAdministrator(prisma, {
                orderId: "c00000000000000000000000",
                from: "PLACED",
                status: "ACCEPTED",
            }),
        ).rejects.toMatchObject({ message: ERROR_ORDER_NOT_FOUND });
    });

    // La régression à empêcher. Ce test établit qu'à l'exécution le chemin vendeur reste
    // aussi fermé qu'avant : la commande d'une autre boutique lui est introuvable. Que la
    // portée ne puisse pas être omise est une propriété de types, que ce test ne vérifie pas.
    it("laisse le chemin vendeur refuser la commande d'une autre boutique", async () => {
        const { orderId } = await placedOrder();
        const autre = await createShop("EUR");

        await expect(
            setOrderStatus(prisma, {
                vendorId: autre.id,
                orderId,
                from: "PLACED",
                status: "ACCEPTED",
            }),
        ).rejects.toMatchObject({ message: ERROR_ORDER_NOT_FOUND });
    });
});

describe("lire les commandes de toutes les boutiques", () => {
    it("rend les commandes de boutiques différentes, et dit le total", async () => {
        const a = await placedOrder();
        const b = await placedOrder();

        const { rows, total } = await listOrdersForAdministration(prisma, {
            skip: 0,
            take: 100,
        });

        expect(rows.map((l) => l.id)).toEqual(expect.arrayContaining([a.orderId, b.orderId]));
        expect(total).toBeGreaterThanOrEqual(2);
    });

    it("porte le nom de la boutique et son slug", async () => {
        const { orderId, shop } = await placedOrder();

        const ligne = (
            await listOrdersForAdministration(prisma, { skip: 0, take: 100 })
        ).rows.find((l) => l.id === orderId);

        expect(ligne?.shopName).toBe(shop.shopName);
        expect(ligne?.shopSlug).toBe(shop.slug);
    });

    it("filtre par état", async () => {
        const { orderId } = await placedOrder();
        const restee = await placedOrder();
        await setOrderStatusAsAdministrator(prisma, {
            orderId,
            from: "PLACED",
            status: "CANCELLED",
        });

        const { rows } = await listOrdersForAdministration(prisma, {
            status: "PLACED",
            skip: 0,
            take: 100,
        });

        expect(rows.find((l) => l.id === orderId)).toBeUndefined();
        expect(rows.find((l) => l.id === restee.orderId)).toBeDefined();
        expect(rows.every((l) => l.status === "PLACED")).toBe(true);
    });

    it("filtre par boutique", async () => {
        const mienne = await placedOrder();
        const autre = await placedOrder();

        const { rows } = await listOrdersForAdministration(prisma, {
            vendorId: mienne.shop.id,
            skip: 0,
            take: 100,
        });

        expect(rows.find((l) => l.id === mienne.orderId)).toBeDefined();
        expect(rows.find((l) => l.id === autre.orderId)).toBeUndefined();
    });

    // Les trois commandes partagent un horodatage, et leurs lignes sont réécrites une à
    // une dans l'ordre DÉCROISSANT des identifiants : l'ordre physique s'oppose ainsi à
    // l'ordre des identifiants. Le test vérifie que les trois reviennent triées par
    // identifiant croissant, c'est-à-dire que la clause `id` du tri est bien appliquée. Un
    // tri sur des clés égales n'est pas tenu de suivre l'ordre physique, donc l'absence de
    // clause finale peut passer inaperçue ici selon le plan de requête.
    it("départage par identifiant croissant les commandes de même horodatage", async () => {
        const quand = new Date();
        const faites = [await placedOrder(), await placedOrder(), await placedOrder()];
        const miennes = faites.map((f) => f.orderId);
        for (const id of [...miennes].sort().reverse()) {
            await prisma.order.update({ where: { id }, data: { createdAt: quand } });
        }

        const { rows } = await listOrdersForAdministration(prisma, { skip: 0, take: 10_000 });

        const miennesVues = rows.map((l) => l.id).filter((id) => miennes.includes(id));
        expect(miennesVues).toEqual([...miennes].sort());
    });

    // La suspension retire la boutique du catalogue, elle n'efface pas les engagements
    // pris avant. Une commande d'une boutique suspendue reste donc visible, et l'écran
    // d'administration doit pouvoir la débloquer comme une autre.
    it("rend aussi les commandes d'une boutique suspendue", async () => {
        const { orderId, shop } = await placedOrder();
        await prisma.vendor.update({
            where: { id: shop.id },
            data: { suspendedAt: new Date() },
        });

        const { rows } = await listOrdersForAdministration(prisma, { skip: 0, take: 100 });

        expect(rows.find((l) => l.id === orderId)).toBeDefined();
    });

    it("rend une page vide au-delà du total, sans lever", async () => {
        await expect(
            listOrdersForAdministration(prisma, { skip: 100_000, take: 20 }),
        ).resolves.toMatchObject({ rows: [] });
    });

    it("lit une commande par son identifiant, sans boutique", async () => {
        const { orderId, shop } = await placedOrder();

        const commande = await readOrderForAdministration(prisma, orderId);

        expect(commande?.shopSlug).toBe(shop.slug);
    });

    it("rend null pour une commande qui n'existe pas", async () => {
        await expect(
            readOrderForAdministration(prisma, "c00000000000000000000000"),
        ).resolves.toBeNull();
    });
});
