import {
    ERROR_ITEM_INELIGIBLE,
    addCartItem,
    createProduct,
    listOrdersForBuyer,
    listOrdersForVendor,
    listShopsForAdministration,
    placeOrders,
    prisma,
    readCart,
    readOrderForBuyer,
    readOrderForVendor,
    readVendorForMember,
    setOrderStatus,
    setProductStatus,
    setShopSuspension,
} from "@clemperl/db";
import { MAX_CART_QUANTITY } from "@clemperl/domain";

// Préfixe propre au fichier : les suites partagent une base qui n'est pas vidée entre deux
// passages, et deux suites qui nomment leurs boutiques pareil se marchent dessus.
const PREFIX = "susp";
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

const addItem = (input: { userId: string; variantId: string; quantity: number }) =>
    addCartItem(prisma, { ...input, maxQuantity: MAX_CART_QUANTITY });

const suspend = (vendorId: string) =>
    prisma.vendor.update({ where: { id: vendorId }, data: { suspendedAt: new Date() } });

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
            currency: "EUR" as never,
            paymentMethods: ["OFF_PLATFORM"] as never,
        },
    });
}

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

/** Une boutique ouverte, un membre, un acheteur, et un article publié prêt à être acheté. */
async function setup() {
    const shop = await createShop();
    const memberId = await createUser();
    await prisma.vendorMember.create({
        data: { vendorId: shop.id, userId: memberId, role: "OWNER" },
    });
    const userId = await createUser();
    const variantId = await publishedVariant(shop.id);
    return { shop, memberId, userId, variantId };
}

/** Une boutique ouverte et un compte administrateur nommé, qui la suspendra. */
async function setupWithAdministrator() {
    const shop = await createShop();
    counter += 1;
    const adminName = `Administratrice ${counter}`;
    const admin = await prisma.user.create({
        data: {
            email: `${PREFIX}-admin-${counter}@clemperl.test`,
            name: adminName,
            emailVerified: true,
            role: "ADMIN",
        },
    });
    return { shop, adminId: admin.id, adminName };
}

/** Le même décor, avec une commande déjà passée. */
async function placedOrder() {
    const { shop, memberId, userId, variantId } = await setup();
    await addItem({ userId, variantId, quantity: 1 });
    const { references } = await placeOrders(prisma, {
        userId,
        expectedTotal: PRICE,
        shipTo: SHIP_TO,
        notes: {},
        methods: { [shop.slug]: "OFF_PLATFORM" },
        lines: [{ variantId, label: "" }],
    });
    const reference = references[0] as string;
    const order = await prisma.order.findFirstOrThrow({ where: { reference } });
    return { id: order.id, reference, vendorId: shop.id, buyerId: userId, memberId };
}

afterAll(async () => {
    await prisma.$disconnect();
});

// Ces tests passent SANS qu'aucun code de production ait été écrit pour eux, et c'est
// voulu : ils épinglent une absence. Ils rougiront le jour où quelqu'un ajoutera la
// condition de suspension à une lecture qui ne doit pas la porter.
describe("ce qu'une suspension ne touche pas", () => {
    // Un acheteur ne perd JAMAIS l'accès à une commande qu'il a payée, et un vendeur doit
    // pouvoir expédier ce qu'il a déjà vendu.
    it("laisse les commandes lisibles des deux côtés", async () => {
        const order = await placedOrder();
        await suspend(order.vendorId);

        await expect(
            readOrderForBuyer(prisma, { buyerId: order.buyerId, reference: order.reference }),
        ).resolves.not.toBeNull();
        await expect(
            readOrderForVendor(prisma, { vendorId: order.vendorId, orderId: order.id }),
        ).resolves.not.toBeNull();
        expect(await listOrdersForBuyer(prisma, order.buyerId)).toHaveLength(1);
        expect(await listOrdersForVendor(prisma, order.vendorId)).toHaveLength(1);
    });

    // La commande reste ACTIONNABLE, pas seulement visible : un vendeur suspendu expédie ce
    // qu'il doit.
    it("laisse le vendeur faire avancer une commande", async () => {
        const order = await placedOrder();
        await suspend(order.vendorId);

        await setOrderStatus(prisma, {
            vendorId: order.vendorId,
            orderId: order.id,
            from: "PLACED",
            status: "ACCEPTED",
        });

        const relue = await prisma.order.findUnique({ where: { id: order.id } });
        expect(relue?.status).toBe("ACCEPTED");
    });

    // `readVendorForMember` ouvre l'espace vendeur. Y ajouter la condition ferait perdre son
    // écran à quelqu'un qui doit continuer à travailler.
    it("laisse les membres accéder à leur espace", async () => {
        const order = await placedOrder();
        await suspend(order.vendorId);

        await expect(readVendorForMember(prisma, order.memberId)).resolves.not.toBeNull();
    });

    // Une boutique FERMÉE, elle, retire bien l'espace. Les deux colonnes se ressemblent et
    // ne font pas la même chose : sans ce test, les confondre passerait inaperçu.
    it("contrairement à une fermeture, qui retire l'espace", async () => {
        const order = await placedOrder();
        await prisma.vendor.update({
            where: { id: order.vendorId },
            data: { deletedAt: new Date() },
        });

        await expect(readVendorForMember(prisma, order.memberId)).resolves.toBeNull();
    });
});

describe("une boutique suspendue et un panier", () => {
    // Le panier GARDE la ligne, et c'est la validation qui refuse : l'acheteur lit le refus
    // que T3 a déjà écrit pour un article devenu indisponible. Vider le panier à sa place
    // lui ferait croire qu'il a renoncé.
    it("refuse la validation et laisse le panier intact", async () => {
        const { shop, userId, variantId } = await setup();
        await addItem({ userId, variantId, quantity: 1 });
        await suspend(shop.id);

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: PRICE,
                shipTo: SHIP_TO,
                notes: {},
                methods: { [shop.slug]: "OFF_PLATFORM" },
                lines: [{ variantId, label: "" }],
            }),
        ).rejects.toMatchObject({ message: ERROR_ITEM_INELIGIBLE });

        const panier = await readCart(prisma, userId);
        expect(panier?.lines).toHaveLength(1);
    });
});

describe("setShopSuspension", () => {
    it("suspend en gardant qui et quand", async () => {
        const { shop, adminId } = await setupWithAdministrator();

        await setShopSuspension(prisma, {
            vendorId: shop.id,
            administratorId: adminId,
            suspended: true,
        });

        const apres = await prisma.vendor.findUniqueOrThrow({ where: { id: shop.id } });
        expect(apres.suspendedAt).not.toBeNull();
        expect(apres.suspendedById).toBe(adminId);
    });

    // Les deux colonnes s'effacent ENSEMBLE : une date sans auteur, ou l'inverse, ferait
    // lire à l'écran une suspension que personne n'a décidée.
    it("rétablit en effaçant les deux colonnes ensemble", async () => {
        const { shop, adminId } = await setupWithAdministrator();
        await setShopSuspension(prisma, {
            vendorId: shop.id,
            administratorId: adminId,
            suspended: true,
        });

        await setShopSuspension(prisma, {
            vendorId: shop.id,
            administratorId: adminId,
            suspended: false,
        });

        const apres = await prisma.vendor.findUniqueOrThrow({ where: { id: shop.id } });
        expect(apres.suspendedAt).toBeNull();
        expect(apres.suspendedById).toBeNull();
    });

    // Deux administrateurs, ou un double clic. L'état visé est atteint et rien ne lève. La
    // date ne bouge PAS : elle dit depuis quand la boutique est suspendue, et la réécrire
    // effacerait cette information sans que personne l'ait voulu.
    it("accepte de suspendre une boutique déjà suspendue sans bouger la date", async () => {
        const { shop, adminId } = await setupWithAdministrator();
        await setShopSuspension(prisma, {
            vendorId: shop.id,
            administratorId: adminId,
            suspended: true,
        });
        const premiere = await prisma.vendor.findUniqueOrThrow({ where: { id: shop.id } });

        await setShopSuspension(prisma, {
            vendorId: shop.id,
            administratorId: adminId,
            suspended: true,
        });

        const seconde = await prisma.vendor.findUniqueOrThrow({ where: { id: shop.id } });
        expect(seconde.suspendedAt).toEqual(premiere.suspendedAt);
    });

    it("accepte de rétablir une boutique active", async () => {
        const { shop, adminId } = await setupWithAdministrator();

        await expect(
            setShopSuspension(prisma, {
                vendorId: shop.id,
                administratorId: adminId,
                suspended: false,
            }),
        ).resolves.toBeUndefined();
    });
});

describe("listShopsForAdministration", () => {
    it("rend l'état et le nom de qui a suspendu", async () => {
        const { shop, adminId, adminName } = await setupWithAdministrator();
        await setShopSuspension(prisma, {
            vendorId: shop.id,
            administratorId: adminId,
            suspended: true,
        });

        const ligne = (await listShopsForAdministration(prisma)).find((r) => r.id === shop.id);
        expect(ligne?.suspendedAt).not.toBeNull();
        expect(ligne?.suspendedBy?.name).toBe(adminName);
    });

    // `SetNull` : la boutique reste suspendue, seul le nom disparaît. La ligne de l'écran ne
    // doit pas casser pour autant, et surtout la suspension ne doit pas se lever toute
    // seule parce qu'un compte a été supprimé.
    it("survit à la suppression du compte qui a suspendu", async () => {
        const { shop, adminId } = await setupWithAdministrator();
        await setShopSuspension(prisma, {
            vendorId: shop.id,
            administratorId: adminId,
            suspended: true,
        });

        await prisma.user.delete({ where: { id: adminId } });

        const ligne = (await listShopsForAdministration(prisma)).find((r) => r.id === shop.id);
        expect(ligne?.suspendedAt).not.toBeNull();
        expect(ligne?.suspendedBy).toBeNull();
    });

    it("ne rend pas une boutique fermée", async () => {
        const { shop } = await setupWithAdministrator();
        await prisma.vendor.update({
            where: { id: shop.id },
            data: { deletedAt: new Date() },
        });

        const lignes = await listShopsForAdministration(prisma);
        expect(lignes.find((r) => r.id === shop.id)).toBeUndefined();
    });
});
