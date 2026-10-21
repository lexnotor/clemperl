import {
    addCartItem,
    createProduct,
    listVendorIdsForMember,
    placeOrders,
    prisma,
    readDisputeAudience,
    readOrderAudience,
    readProductImageAudience,
} from "@clemperl/db";
import { MAX_CART_QUANTITY } from "@clemperl/domain";

const PREFIX = "rt";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
const PRICE = 5000;
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

async function createShop() {
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
            paymentMethods: ["OFF_PLATFORM"] as never,
        },
    });
}

// Un produit publié complet, avec sa variante et son image prête.
async function publishedProduct(vendorId: string, title?: string) {
    counter += 1;
    const { id } = await createProduct(prisma, {
        vendorId,
        slug: `${PREFIX}-p-${counter}`,
        title: title ?? `Sac cabas ${counter}`,
        description: DESCRIPTION,
        category: "LEATHER_GOODS",
        priceAmount: PRICE,
        expectedCurrency: "EUR",
    });
    const image = await prisma.productImage.create({
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
    const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: id } });
    return { productId: id, variantId: variant.id, imageId: image.id };
}

// Une commande réelle, passée par `placeOrders`.
async function placedOrder() {
    const buyerId = await createUser();
    const shop = await createShop();
    const product = await publishedProduct(shop.id);
    await prisma.product.update({ where: { id: product.productId }, data: { status: "PUBLISHED" } });
    await addCartItem(prisma, {
        userId: buyerId,
        variantId: product.variantId,
        quantity: 1,
        maxQuantity: MAX_CART_QUANTITY,
    });
    const { references, orderIds } = await placeOrders(prisma, {
        userId: buyerId,
        expectedTotal: PRICE,
        shipTo: SHIP_TO,
        notes: {},
        methods: { [shop.slug]: "OFF_PLATFORM" },
        lines: [{ variantId: product.variantId, label: "" }],
    });
    return { buyerId, shop, reference: references[0] as string, orderId: orderIds[0] as string };
}

afterAll(async () => {
    await prisma.$disconnect();
});

describe("readOrderAudience", () => {
    it("rend l'acheteur, la boutique et la référence de la commande", async () => {
        const order = await placedOrder();

        expect(await readOrderAudience(prisma, order.orderId)).toEqual({
            buyerId: order.buyerId,
            vendorId: order.shop.id,
            reference: order.reference,
        });
    });

    it("rend null pour une commande inconnue", async () => {
        expect(await readOrderAudience(prisma, "inconnue")).toBeNull();
    });
});

describe("readDisputeAudience", () => {
    it("rend l'audience de la commande du litige", async () => {
        const order = await placedOrder();
        const dispute = await prisma.dispute.create({
            data: {
                orderId: order.orderId,
                reason: "DAMAGED",
                locale: "fr",
                lastActivityAt: new Date(),
            },
        });

        expect(await readDisputeAudience(prisma, dispute.id)).toEqual({
            buyerId: order.buyerId,
            vendorId: order.shop.id,
            reference: order.reference,
        });
    });

    it("rend null pour un litige inconnu", async () => {
        expect(await readDisputeAudience(prisma, "inconnu")).toBeNull();
    });
});

describe("readProductImageAudience", () => {
    it("rend la boutique, le titre du produit et l'état de l'image", async () => {
        const shop = await createShop();
        const product = await publishedProduct(shop.id, "Sac du matin");

        expect(await readProductImageAudience(prisma, product.imageId)).toEqual({
            vendorId: shop.id,
            productTitle: "Sac du matin",
            status: "READY",
        });
    });

    it("rend null pour une image inconnue", async () => {
        expect(await readProductImageAudience(prisma, "inconnue")).toBeNull();
    });
});

describe("listVendorIdsForMember", () => {
    it("rend les boutiques ouvertes du membre, triées par identifiant, sans la fermée", async () => {
        const userId = await createUser();
        const first = await createShop();
        const second = await createShop();
        const closed = await createShop();
        for (const shop of [first, second, closed]) {
            await prisma.vendorMember.create({
                data: { vendorId: shop.id, userId, role: "MANAGER" },
            });
        }
        await prisma.vendor.update({ where: { id: closed.id }, data: { deletedAt: new Date() } });

        expect(await listVendorIdsForMember(prisma, userId)).toEqual(
            [first.id, second.id].sort(),
        );
    });

    it("rend une liste vide pour qui ne vend rien", async () => {
        expect(await listVendorIdsForMember(prisma, await createUser())).toEqual([]);
    });
});

describe("placeOrders, identifiants", () => {
    it("rend un identifiant de commande par référence, dans le même ordre", async () => {
        const userId = await createUser();
        const a = await createShop();
        const b = await createShop();
        const pa = await publishedProduct(a.id);
        const pb = await publishedProduct(b.id);
        await prisma.product.updateMany({
            where: { id: { in: [pa.productId, pb.productId] } },
            data: { status: "PUBLISHED" },
        });
        for (const p of [pa, pb]) {
            await addCartItem(prisma, {
                userId,
                variantId: p.variantId,
                quantity: 1,
                maxQuantity: MAX_CART_QUANTITY,
            });
        }

        const { references, orderIds } = await placeOrders(prisma, {
            userId,
            expectedTotal: PRICE * 2,
            shipTo: SHIP_TO,
            notes: {},
            methods: { [a.slug]: "OFF_PLATFORM", [b.slug]: "OFF_PLATFORM" },
            lines: [
                { variantId: pa.variantId, label: "" },
                { variantId: pb.variantId, label: "" },
            ],
        });

        expect(orderIds).toHaveLength(references.length);
        for (const [index, reference] of references.entries()) {
            const order = await prisma.order.findUniqueOrThrow({
                where: { id: orderIds[index] as string },
            });
            expect(order.reference).toBe(reference);
        }
    });
});
