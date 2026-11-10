import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { addCartItem, createProduct, placeOrders, prisma, setProductStatus } from "@clemperl/db";
import { MAX_CART_QUANTITY } from "@clemperl/domain";
import { AppModule } from "../src/app.module";
import { openSession } from "./helpers/open-session";

const ORDERS = "{ orders { reference status paymentStatus total dispute } }";
const PREFIX = `vr-${Date.now()}`;
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
const SHIP_TO = {
    name: "Awa Traoré",
    phone: "+32470000000",
    line: "12 rue des Tanneurs",
    city: "Bruxelles",
    country: "BE",
};

let counter = 0;

// Une boutique complète, au modèle de `createShop` dans `order-oversight.int-spec.ts`.
async function createShop(label: string) {
    counter += 1;
    return prisma.vendor.create({
        data: {
            slug: `${PREFIX}-${label}`,
            shopName: `Atelier ${label}`,
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: `contact-${label}@atelier.test`,
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: `Atelier ${label} SRL`,
            registrationNumber: "0123456789",
            country: "BE",
            currency: "EUR",
            paymentMethods: ["OFF_PLATFORM"],
        },
    });
}

// Un produit PUBLIÉ complet : sans image prête, le dépôt refuse la publication.
async function publishedVariant(vendorId: string, amount: number) {
    counter += 1;
    const { id } = await createProduct(prisma, {
        vendorId,
        slug: `${PREFIX}-p-${counter}`,
        title: `Sac cabas ${counter}`,
        description: DESCRIPTION,
        category: "LEATHER_GOODS",
        priceAmount: amount,
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

describe("orders", () => {
    let app: INestApplication;
    const emails: string[] = [];
    const shopIds: string[] = [];

    async function account(label: string): Promise<{ cookie: string; userId: string }> {
        const email = `${PREFIX}-${label}@exemple.test`;
        emails.push(email);
        const cookie = await openSession(email);
        const { id } = await prisma.user.findUniqueOrThrow({ where: { email } });
        return { cookie, userId: id };
    }

    // Une commande passée par un acheteur neuf sur la boutique donnée, et sa référence.
    async function placedOrder(shop: { id: string; slug: string }): Promise<string> {
        const buyer = await account(`acheteur-${(counter += 1)}`);
        const variantId = await publishedVariant(shop.id, 5000);
        await addCartItem(prisma, {
            userId: buyer.userId,
            variantId,
            quantity: 1,
            maxQuantity: MAX_CART_QUANTITY,
        });
        const { references } = await placeOrders(prisma, {
            userId: buyer.userId,
            expectedTotal: 5000,
            shipTo: SHIP_TO,
            notes: {},
            methods: { [shop.slug]: "OFF_PLATFORM" },
            lines: [{ variantId, label: "" }],
        });
        return references[0] as string;
    }

    const post = (query: string) =>
        request(app.getHttpServer())
            .post("/graphql")
            .set("Content-Type", "application/json")
            .send({ query });

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = module.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
        // Une commande retient sa boutique et son acheteur : elle part avant les deux.
        await prisma.order.deleteMany({ where: { vendorId: { in: shopIds } } });
        await prisma.vendor.deleteMany({ where: { id: { in: shopIds } } });
        await prisma.user.deleteMany({ where: { email: { in: emails } } });
        await prisma.$disconnect();
    });

    it("refuse orders sans session", async () => {
        const response = await post(ORDERS).expect(200);

        expect(response.body.data).toBeNull();
        expect(response.body.errors[0].extensions.code).toBe("UNAUTHENTICATED");
    });

    it("refuse orders à un compte sans boutique", async () => {
        const { cookie } = await account("sans-boutique");

        const response = await post(ORDERS).set("Cookie", cookie).expect(200);

        expect(response.body.data).toBeNull();
        expect(response.body.errors[0].extensions.code).toBe("FORBIDDEN");
    });

    it("rend les commandes de la boutique, la plus récente en tête, et aucune d'une autre", async () => {
        const shopA = await createShop("a");
        const shopB = await createShop("b");
        shopIds.push(shopA.id, shopB.id);
        const { cookie, userId } = await account("membre-a");
        await prisma.vendorMember.create({
            data: { vendorId: shopA.id, userId, role: "OWNER" },
        });

        const first = await placedOrder(shopA);
        const second = await placedOrder(shopA);
        await placedOrder(shopB);

        const response = await post(ORDERS).set("Cookie", cookie).expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.orders.map((o: { reference: string }) => o.reference)).toEqual([
            second,
            first,
        ]);
    });

    // Une boutique, son membre connecté et une commande reçue : le terrain des trois cas de `order`.
    async function shopWithOrder(label: string) {
        const shop = await createShop(label);
        shopIds.push(shop.id);
        const { cookie, userId } = await account(`membre-${label}`);
        await prisma.vendorMember.create({ data: { vendorId: shop.id, userId, role: "OWNER" } });
        const reference = await placedOrder(shop);
        const { id } = await prisma.order.findFirstOrThrow({ where: { reference } });
        return { shop, cookie, reference, orderId: id };
    }

    const ORDER = (id: string) =>
        `{ order(id: "${id}") { reference lines { title quantity total } actions } }`;

    it("rend le détail d'une commande de la boutique", async () => {
        const { cookie, reference, orderId } = await shopWithOrder("detail");

        const response = await post(ORDER(orderId)).set("Cookie", cookie).expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.order.reference).toBe(reference);
        expect(response.body.data.order.lines).toHaveLength(1);
        expect(response.body.data.order.actions).toEqual(["ACCEPT", "CANCEL"]);
    });

    it("rend null pour la commande d'une autre boutique", async () => {
        const mine = await shopWithOrder("mienne");
        const other = await shopWithOrder("autre");

        const response = await post(ORDER(other.orderId)).set("Cookie", mine.cookie).expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.order).toBeNull();
    });

    it("rend null pour un identifiant inventé", async () => {
        const { cookie } = await shopWithOrder("invente");

        const response = await post(ORDER("n-existe-pas")).set("Cookie", cookie).expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.order).toBeNull();
    });
});

const PRODUCTS = "{ products { title status } }";

// Un produit de la boutique donnée : brouillon, ou publié avec l'image que la publication exige.
async function productOf(vendorId: string, title: string, publish: boolean) {
    counter += 1;
    const { id } = await createProduct(prisma, {
        vendorId,
        slug: `${PREFIX}-q-${counter}`,
        title,
        description: DESCRIPTION,
        category: "LEATHER_GOODS",
        priceAmount: 5000,
        expectedCurrency: "EUR",
    });
    if (publish) {
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
    }
    return id;
}

describe("products", () => {
    let app: INestApplication;
    const emails: string[] = [];
    const shopIds: string[] = [];

    async function account(label: string): Promise<{ cookie: string; userId: string }> {
        const email = `${PREFIX}-p-${label}@exemple.test`;
        emails.push(email);
        const cookie = await openSession(email);
        const { id } = await prisma.user.findUniqueOrThrow({ where: { email } });
        return { cookie, userId: id };
    }

    const post = (query: string) =>
        request(app.getHttpServer())
            .post("/graphql")
            .set("Content-Type", "application/json")
            .send({ query });

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = module.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
        await prisma.product.deleteMany({ where: { vendorId: { in: shopIds } } });
        await prisma.vendor.deleteMany({ where: { id: { in: shopIds } } });
        await prisma.user.deleteMany({ where: { email: { in: emails } } });
        await prisma.$disconnect();
    });

    it("rend les produits de la boutique, brouillons compris, sans ceux d'une autre ni les supprimés", async () => {
        const shopA = await createShop("pa");
        const shopB = await createShop("pb");
        shopIds.push(shopA.id, shopB.id);
        const { cookie, userId } = await account("membre-a");
        await prisma.vendorMember.create({ data: { vendorId: shopA.id, userId, role: "OWNER" } });

        await productOf(shopA.id, "Brouillon ancien", false);
        await productOf(shopA.id, "Publié récent", true);
        const removed = await productOf(shopA.id, "Supprimé", false);
        await prisma.product.update({ where: { id: removed }, data: { deletedAt: new Date() } });
        await productOf(shopB.id, "D'une autre boutique", false);

        const response = await post(PRODUCTS).set("Cookie", cookie).expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.products).toEqual([
            { title: "Publié récent", status: "PUBLISHED" },
            { title: "Brouillon ancien", status: "DRAFT" },
        ]);
    });

    it("refuse products à un compte sans boutique", async () => {
        const { cookie } = await account("sans-boutique");

        const response = await post(PRODUCTS).set("Cookie", cookie).expect(200);

        expect(response.body.data).toBeNull();
        expect(response.body.errors[0].extensions.code).toBe("FORBIDDEN");
    });
});
